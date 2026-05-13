#!/usr/bin/env python3
"""
frame_selector.py — Selects high-quality frames for SfM (blur + pHash + temporal coverage).

Metrics:
- Blur: Laplacian variance on grayscale (configurable threshold).
- Redundancy: 64-bit pHash, Hamming distance < threshold => duplicate (skipped when --no-phash-dedupe).
- Temporal: optional gap filling using extraction FPS and video duration.

Safety mechanisms (added 2026-05-11 after diagnosis of bad SfM runs):
- AUTO-TUNE: if more than --auto-tune-threshold of frames are discarded as blurry,
  the blur threshold is recomputed as the 25th percentile of the sharpness distribution
  (floored at --auto-tune-floor). This avoids garbage-in for videos shot in motion.
- GAP_FILL FLOOR: reinjected frames must have sharpness >= 0.5 * min_sharpness
  (the working threshold, after auto-tune). Prevents reinjecting blurry frames just
  because they fill a temporal gap.
- OUTPUT CAP: output_count is capped at ceil(1.25 * target_count). Reinjected frames
  with lowest sharpness are dropped first.

Usage:
  python frame_selector.py \\
      --input-dir frames_raw/ \\
      --output-dir frames/ \\
      --target-count 300 \\
      --min-sharpness 35.0 \\
      --phash-threshold 6 \\
      --keep-first-last \\
      --report report.json
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import imagehash
import numpy as np
from PIL import Image


@dataclass
class FrameRecord:
    path: Path
    order_index: int
    sharpness: float
    phash: imagehash.ImageHash | None


def _natural_frame_sort_key(p: Path) -> tuple[int, str]:
    """Numeric order for frame_00012.jpg (lexical sort would mis-order 10 before 2)."""
    m = re.search(r"(\d+)", p.stem)
    n = int(m.group(1)) if m else 0
    return (n, p.name.lower())


def list_frames(input_dir: Path) -> list[Path]:
    # Case-insensitive FS (Windows): *.jpg and *.JPG match the same files — dedupe by resolve().
    raw: list[Path] = []
    for ext in ("*.jpg", "*.jpeg", "*.png"):
        raw.extend(input_dir.glob(ext))
    unique: dict[str, Path] = {}
    for p in raw:
        unique[str(p.resolve())] = p
    return sorted(unique.values(), key=_natural_frame_sort_key)


def laplacian_variance_bgr(bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def load_frame_metrics(
    paths: list[Path], compute_phash: bool
) -> tuple[list[FrameRecord], float, float]:
    records: list[FrameRecord] = []
    mins = float("inf")
    maxs = float("-inf")
    total = len(paths)
    for i, p in enumerate(paths):
        if (i + 1) % 50 == 0 or i == 0:
            print(f"{i + 1}/{total}  {p.name}", flush=True)
        bgr = cv2.imread(str(p), cv2.IMREAD_COLOR)
        if bgr is None:
            raise RuntimeError(f"Failed to read image: {p}")
        sharp = laplacian_variance_bgr(bgr)
        mins = min(mins, sharp)
        maxs = max(maxs, sharp)
        ph: imagehash.ImageHash | None = None
        if compute_phash:
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            pil = Image.fromarray(rgb)
            ph = imagehash.phash(pil)
        records.append(FrameRecord(path=p, order_index=i, sharpness=sharp, phash=ph))
    return records, mins, maxs


def filter_blur(
    records: list[FrameRecord],
    min_sharpness: float,
    keep_first_last: bool,
) -> tuple[list[FrameRecord], int]:
    n = len(records)
    if n == 0:
        return [], 0
    discarded = 0
    kept: list[FrameRecord] = []
    for i, r in enumerate(records):
        is_edge = keep_first_last and (i == 0 or i == n - 1)
        if is_edge or r.sharpness >= min_sharpness:
            kept.append(r)
        else:
            discarded += 1
    return kept, discarded


def hamming(a: imagehash.ImageHash, b: imagehash.ImageHash) -> int:
    return int(a - b)


def filter_redundant(
    records: list[FrameRecord], phash_threshold: int
) -> tuple[list[FrameRecord], int]:
    """Drop frame if Hamming distance to last *accepted* phash is strictly less than threshold."""
    if not records:
        return [], 0
    discarded = 0
    kept: list[FrameRecord] = []
    last_hash: imagehash.ImageHash | None = None
    for r in records:
        assert r.phash is not None
        if last_hash is None:
            kept.append(r)
            last_hash = r.phash
            continue
        d = hamming(r.phash, last_hash)
        if d < phash_threshold:
            discarded += 1
            continue
        kept.append(r)
        last_hash = r.phash
    return kept, discarded


def filter_uniform_sample(
    records: list[FrameRecord], target_count: int
) -> tuple[list[FrameRecord], int]:
    n = len(records)
    if n <= target_count:
        return records, 0
    if target_count <= 1:
        return [records[0]], n - 1
    raw = np.linspace(0, n - 1, num=target_count)
    idxs = sorted({int(round(float(p))) for p in raw})
    idxs = [max(0, min(n - 1, i)) for i in idxs]
    idxs = sorted(set(idxs))
    # Restore count if rounding collapsed duplicates (rare when n >> target_count)
    used = set(idxs)
    k = 0
    while len(idxs) < target_count and k < n:
        if k not in used:
            idxs.append(k)
            used.add(k)
        k += 1
    idxs = sorted(idxs)[:target_count]
    picked = [records[i] for i in idxs]
    return picked, n - len(picked)


def filter_gap_fill(
    records: list[FrameRecord],
    all_by_index: dict[int, FrameRecord],
    video_duration: float,
    target_count: int,
    extraction_fps: float,
    min_reinject_sharpness: float = 0.0,
    max_pool_size: int | None = None,
) -> tuple[list[FrameRecord], int, int]:
    """Re-include best-sharpness frame in large temporal gaps between consecutive picks.

    Returns (final_records, reincluded_count, rejected_floor_count).
    A reinjection only happens if best.sharpness >= min_reinject_sharpness (floor),
    avoiding the previous behavior of recycling blurry frames just to fill gaps.
    Pool growth is bounded by max_pool_size (cap superior).
    """
    if not records or video_duration <= 0 or target_count <= 0 or extraction_fps <= 0:
        return records, 0, 0
    max_gap = (video_duration / max(target_count, 1)) * 3.0
    reincluded = 0
    rejected_floor = 0
    pool: dict[int, FrameRecord] = {r.order_index: r for r in records}
    max_iter = max(len(all_by_index) * 3, 100)
    for _ in range(max_iter):
        if max_pool_size is not None and len(pool) >= max_pool_size:
            break
        idxs = sorted(pool.keys())
        added = False
        for a, b in zip(idxs, idxs[1:]):
            gap_time = (b - a) / extraction_fps
            if gap_time <= max_gap:
                continue
            available = [
                all_by_index[i]
                for i in range(a + 1, b)
                if i in all_by_index and i not in pool
            ]
            if not available:
                continue
            best = max(available, key=lambda r: r.sharpness)
            if best.sharpness < min_reinject_sharpness:
                rejected_floor += 1
                continue
            pool[best.order_index] = best
            reincluded += 1
            added = True
            break
        if not added:
            break
    return sorted(pool.values(), key=lambda r: r.order_index), reincluded, rejected_floor


def median_sharpness(records: list[FrameRecord]) -> float:
    vals = sorted(r.sharpness for r in records)
    if not vals:
        return 0.0
    m = len(vals) // 2
    if len(vals) % 2:
        return float(vals[m])
    return float((vals[m - 1] + vals[m]) / 2.0)


def main() -> int:
    t0 = time.perf_counter()
    ap = argparse.ArgumentParser(
        description="Select sharp, non-redundant frames for COLMAP / SfM."
    )
    ap.add_argument("--input-dir", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, required=True)
    ap.add_argument("--target-count", type=int, default=300)
    ap.add_argument("--min-sharpness", type=float, default=35.0)
    ap.add_argument("--phash-threshold", type=int, default=6)
    ap.add_argument(
        "--keep-first-last",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Keep first and last frame even if below blur threshold (default: true).",
    )
    ap.add_argument(
        "--no-phash-dedupe",
        action="store_true",
        help="Skip pHash deduplication and temporal gap fill (photos mode).",
    )
    ap.add_argument("--report", type=Path, required=True)
    ap.add_argument(
        "--video-duration-seconds",
        type=float,
        default=0.0,
        help="Video length for max-gap computation (filter 4). Omit or 0 to skip gap fill.",
    )
    ap.add_argument(
        "--extraction-fps",
        type=float,
        default=5.0,
        help="FPS used when extracting frames_raw (time index = order_index / fps).",
    )
    ap.add_argument(
        "--output-cap-ratio",
        type=float,
        default=1.25,
        help="Hard upper bound on output_count = ceil(target_count * ratio). Default 1.25.",
    )
    ap.add_argument(
        "--auto-tune-threshold",
        type=float,
        default=0.70,
        help="If blur discard ratio >= this, re-run blur filter using p25 sharpness. Default 0.70.",
    )
    ap.add_argument(
        "--auto-tune-floor",
        type=float,
        default=15.0,
        help="Minimum sharpness after auto-tune (never drops below this). Default 15.0.",
    )
    ap.add_argument(
        "--no-auto-tune",
        action="store_true",
        help="Disable adaptive blur threshold (keeps --min-sharpness exactly as given).",
    )
    ap.add_argument(
        "--gap-fill-floor-ratio",
        type=float,
        default=0.5,
        help="Gap-fill reinjections require sharpness >= ratio * working_min_sharpness. Default 0.5.",
    )
    args = ap.parse_args()

    input_dir: Path = args.input_dir
    output_dir: Path = args.output_dir
    if not input_dir.is_dir():
        print(f"ERROR: input-dir is not a directory: {input_dir}", file=sys.stderr)
        return 1

    paths = list_frames(input_dir)
    input_count = len(paths)
    if input_count == 0:
        print("ERROR: no .jpg/.jpeg/.png in input-dir", file=sys.stderr)
        return 1

    compute_phash = not args.no_phash_dedupe
    all_records, min_seen, max_seen = load_frame_metrics(paths, compute_phash)

    params: dict[str, Any] = {
        "target_count": args.target_count,
        "min_sharpness": args.min_sharpness,
        "phash_threshold": args.phash_threshold,
        "keep_first_last": args.keep_first_last,
        "no_phash_dedupe": args.no_phash_dedupe,
        "video_duration_seconds": args.video_duration_seconds,
        "extraction_fps": args.extraction_fps,
        "output_cap_ratio": args.output_cap_ratio,
        "auto_tune_threshold": args.auto_tune_threshold,
        "auto_tune_floor": args.auto_tune_floor,
        "no_auto_tune": args.no_auto_tune,
        "gap_fill_floor_ratio": args.gap_fill_floor_ratio,
    }

    # Filter 1 — blur
    working_min_sharpness = float(args.min_sharpness)
    after_blur, discarded_blur = filter_blur(
        all_records, working_min_sharpness, args.keep_first_last
    )

    # AUTO-TUNE: se descarte por blur passar o limite, recomputa threshold como p25
    # da distribuicao real, com floor de seguranca. Evita "garbage in" em videos
    # com motion blur natural onde o default seria agressivo demais.
    auto_tuned_value: float | None = None
    if not args.no_auto_tune:
        blur_ratio_initial = discarded_blur / max(input_count, 1)
        if blur_ratio_initial >= args.auto_tune_threshold:
            sharps = sorted(r.sharpness for r in all_records)
            p25 = sharps[len(sharps) // 4] if sharps else working_min_sharpness
            candidate = max(args.auto_tune_floor, min(working_min_sharpness, p25))
            if candidate < working_min_sharpness:
                print(
                    f"AUTO-TUNE: {blur_ratio_initial:.0%} discarded by blur "
                    f"(>= {args.auto_tune_threshold:.0%}). Re-running blur filter with "
                    f"min_sharpness {working_min_sharpness:.1f} -> {candidate:.1f} (p25 "
                    f"floored at {args.auto_tune_floor:.1f}).",
                    flush=True,
                )
                working_min_sharpness = candidate
                auto_tuned_value = candidate
                after_blur, discarded_blur = filter_blur(
                    all_records, working_min_sharpness, args.keep_first_last
                )

    # Filter 2 — redundancy
    discarded_redundant = 0
    if args.no_phash_dedupe:
        after_redund = after_blur
    else:
        after_redund, discarded_redundant = filter_redundant(
            after_blur, args.phash_threshold
        )

    # Filter 3 — cap to target_count
    after_sample, discarded_sampling = filter_uniform_sample(
        after_redund, args.target_count
    )

    # Cap superior do output (calculado uma vez, usado pelo gap_fill e pelo trim final).
    hard_cap = max(1, int(round(args.target_count * args.output_cap_ratio)))

    # Indices "originais" (saidos do uniform sample) — usado para distinguir reinjetados.
    originals_set: set[int] = {r.order_index for r in after_sample}

    # Filter 4 — gap fill (video only), com floor de nitidez e cap.
    discarded_gap_reinjected = 0
    rejected_floor = 0
    if (
        not args.no_phash_dedupe
        and args.video_duration_seconds > 0
        and args.extraction_fps > 0
    ):
        by_idx = {r.order_index: r for r in all_records}
        floor_for_gap = working_min_sharpness * max(0.0, args.gap_fill_floor_ratio)
        after_sample, discarded_gap_reinjected, rejected_floor = filter_gap_fill(
            after_sample,
            by_idx,
            args.video_duration_seconds,
            args.target_count,
            args.extraction_fps,
            min_reinject_sharpness=floor_for_gap,
            max_pool_size=hard_cap,
        )

    # Cap final: se ainda passou de hard_cap, descarta primeiro os reinjetados de menor
    # nitidez. Originals nunca sao truncados (preservar uniform sample garante cobertura).
    trimmed_by_cap = 0
    if len(after_sample) > hard_cap:
        originals_kept = [r for r in after_sample if r.order_index in originals_set]
        reinjected_kept = [r for r in after_sample if r.order_index not in originals_set]
        reinjected_kept.sort(key=lambda r: r.sharpness, reverse=True)
        room = max(0, hard_cap - len(originals_kept))
        kept_reinjected = reinjected_kept[:room]
        trimmed_by_cap = len(reinjected_kept) - len(kept_reinjected)
        after_sample = sorted(
            originals_kept + kept_reinjected, key=lambda r: r.order_index
        )

    # De-duplicate by path / index and sort for copy
    final_map: dict[int, FrameRecord] = {}
    for r in after_sample:
        final_map[r.order_index] = r
    final_list = sorted(final_map.values(), key=lambda r: r.order_index)
    output_count = len(final_list)

    blur_ratio = discarded_blur / max(input_count, 1)
    if blur_ratio > 0.30:
        print(
            f"WARNING: {blur_ratio:.0%} of frames discarded as blurry — "
            "slow down capture or lower --min-sharpness.",
            file=sys.stderr,
        )

    median_kept = median_sharpness(final_list)
    duration_seconds = time.perf_counter() - t0

    report: dict[str, Any] = {
        "input_count": input_count,
        "output_count": output_count,
        "output_cap": hard_cap,
        "discarded_blur": discarded_blur,
        "discarded_redundant": discarded_redundant,
        "discarded_sampling": discarded_sampling,
        "discarded_gap_reinjected": discarded_gap_reinjected,
        "discarded_gap_rejected_by_floor": rejected_floor,
        "discarded_by_output_cap": trimmed_by_cap,
        "auto_tuned_min_sharpness": auto_tuned_value,
        "working_min_sharpness": round(working_min_sharpness, 4),
        "min_sharpness_seen": round(min_seen, 4),
        "max_sharpness_seen": round(max_seen, 4),
        "median_sharpness_kept": round(median_kept, 4),
        "params": params,
        "duration_seconds": round(duration_seconds, 3),
    }

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    if output_count == 0 or output_count < 20:
        print(
            f"ERROR: output_count={output_count} (< 20 or zero). Refusing to proceed.",
            file=sys.stderr,
        )
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    for old in output_dir.glob("*.jpg"):
        old.unlink()
    for old in output_dir.glob("*.jpeg"):
        old.unlink()
    for old in output_dir.glob("*.png"):
        old.unlink()

    for r in final_list:
        dest = output_dir / r.path.name
        shutil.copy2(r.path, dest)

    print(
        f"OK: {output_count} frames -> {output_dir} | report: {args.report}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
