#!/usr/bin/env python3
"""
hloc_features.py — SuperPoint + LightGlue -> database.db COLMAP-compat (P05).

Substitui os passos `colmap feature_extractor` + `colmap sequential_matcher`
do pipeline `[2/5]`. O `database.db` gerado e' lido normalmente por
`colmap mapper` ou `glomap mapper` (P04) — i.e., e' drop-in replacement do
extractor/matcher do COLMAP.

Uso (chamado pelo run-pipeline.ps1 quando -UseHloc esta ativo):

  python hloc_features.py \\
      --image-dir   output/<tour>/colmap_ws/images \\
      --database-path output/<tour>/colmap_ws/database.db \\
      --export-dir  output/<tour>/hloc \\
      [--mask-dir   output/<tour>/masks] \\
      [--max-image-size 1600] \\
      [--num-pairs-per-image 30] \\
      [--max-keypoints 4096] \\
      [--device cuda] \\
      [--report     output/<tour>/hloc_report.json]

Exit codes:
  0 — sucesso (database.db populado e geometric verification OK).
  1 — erro de uso (pasta nao existe, poucas imagens etc.).
  2 — dependencia Python ausente (torch / hloc / pycolmap nao instalados).
  3 — falha em runtime (extracao/match/import do database).
  4 — CUDA nao disponivel (hloc + LightGlue em CPU sao impraticavel).

TODO(founder): em RunPod Linux + RTX 4090, -UseHloc deveria ser default (item
[9] do ROADMAP). Em Windows + RTX 5060 Ti, usar so' em tours problematicos
(paredes brancas, baixa textura, registration ratio < 80% no baseline).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# ───── Imports defensivos: erros mapeados em exit codes p/ o pipeline cair no fallback ─────
try:
    import numpy as np
except ImportError as exc:  # pragma: no cover
    print(f"[hloc_features] ERRO: numpy ausente ({exc}).", file=sys.stderr)
    sys.exit(2)

try:
    import torch
except ImportError as exc:  # pragma: no cover
    print(f"[hloc_features] ERRO: torch ausente ({exc}). pip install -r requirements_hloc.txt", file=sys.stderr)
    sys.exit(2)

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def _list_images(image_dir: Path) -> list[str]:
    return sorted(
        p.name for p in image_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )


def _apply_masks(image_dir: Path, mask_dir: Path, out_dir: Path) -> Path:
    """Pre-mascara frames (convencao COLMAP: 0=ignorar features, 255=manter).

    Para cada `frame_xxxx.jpg`, procura `frame_xxxx.jpg.png` em `mask_dir` e
    zera os pixels do frame onde mask == 0. hloc nao tem suporte nativo a
    masks como o COLMAP; pre-mascarar e' o workaround documentado.
    """
    try:
        import cv2  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            f"opencv-python necessario para mascaras ({exc}). pip install opencv-python"
        ) from exc

    import cv2  # type: ignore

    out_dir.mkdir(parents=True, exist_ok=True)
    masked_count = 0
    untouched_count = 0
    for name in _list_images(image_dir):
        src = image_dir / name
        dst = out_dir / name
        img = cv2.imread(str(src), cv2.IMREAD_COLOR)
        if img is None:
            continue
        mask_path = mask_dir / f"{name}.png"
        if mask_path.is_file():
            mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
            if mask is not None and mask.shape[:2] == img.shape[:2]:
                img = img.copy()
                img[mask == 0] = 0
                masked_count += 1
            else:
                untouched_count += 1
        else:
            untouched_count += 1
        cv2.imwrite(str(dst), img)
    print(
        f"[hloc_features] mascaras aplicadas: {masked_count} frames mascarados, "
        f"{untouched_count} mantidos como original",
        flush=True,
    )
    return out_dir


def _safe_median_features(features_path: Path) -> int:
    """Mediana de keypoints por imagem (best-effort; -1 se falhar)."""
    try:
        import h5py

        counts: list[int] = []
        with h5py.File(str(features_path), "r") as f:
            def _visit(name: str, obj) -> None:  # type: ignore[no-untyped-def]
                if isinstance(obj, h5py.Dataset) and name.endswith("/keypoints"):
                    counts.append(int(obj.shape[0]))

            f.visititems(_visit)
        return int(np.median(counts)) if counts else 0
    except Exception:
        return -1


def _safe_median_matches(matches_path: Path) -> int:
    """Mediana de matches positivos por par (best-effort; -1 se falhar).

    Layout h5 do hloc: matches0 (int array) com -1 indicando 'sem match'.
    """
    try:
        import h5py

        counts: list[int] = []
        with h5py.File(str(matches_path), "r") as f:
            def _visit(name: str, obj) -> None:  # type: ignore[no-untyped-def]
                if isinstance(obj, h5py.Dataset) and name.endswith("/matches0"):
                    arr = obj[:]
                    counts.append(int(np.sum(arr > -1)))

            f.visititems(_visit)
        return int(np.median(counts)) if counts else 0
    except Exception:
        return -1


def main() -> int:
    ap = argparse.ArgumentParser(
        description="hloc (SuperPoint+LightGlue) -> database.db COLMAP-compat (P05).",
    )
    ap.add_argument("--image-dir", type=Path, required=True,
                    help="Pasta com os frames (mesma que vai para o COLMAP/GLOMAP).")
    ap.add_argument("--database-path", type=Path, required=True,
                    help="Caminho do database.db de saida (sera recriado).")
    ap.add_argument("--export-dir", type=Path, required=True,
                    help="Cache hloc (h5 de features/matches/pairs).")
    ap.add_argument("--mask-dir", type=Path, default=None,
                    help="Pasta masks/ do P03 (opcional; pre-mascara os frames).")
    ap.add_argument("--max-image-size", type=int, default=1600,
                    help="Lado maior maximo p/ resize (default 1600; SuperPoint nao ganha em 4K).")
    ap.add_argument("--num-pairs-per-image", type=int, default=30,
                    help="Pares por imagem no modo retrieval (auto-ativado p/ > 200 frames).")
    ap.add_argument("--max-keypoints", type=int, default=4096,
                    help="Sweet spot para SuperPoint; nao aumente alem disso em tours pequenos.")
    ap.add_argument("--device", default="cuda",
                    help="Device pra hloc (cuda obrigatorio em prod).")
    ap.add_argument("--report", type=Path, default=None,
                    help="JSON de saida com estatisticas.")
    args = ap.parse_args()

    # ───── CUDA obrigatorio ─────
    if args.device.startswith("cuda") and not torch.cuda.is_available():
        print(
            "[hloc_features] ERRO: CUDA nao disponivel. hloc + LightGlue em CPU "
            "sao impraticavel para tours reais. Aborte ou rode sem -UseHloc.",
            file=sys.stderr,
        )
        return 4

    # ───── Imports tardios (hloc / pycolmap) p/ erro claro se faltar ─────
    try:
        from hloc import extract_features, match_features, pairs_from_exhaustive
        from hloc.reconstruction import (
            create_empty_db,
            import_images,
            get_image_ids,
            import_features,
            import_matches,
            estimation_and_geometric_verification,
        )
        import pycolmap
    except ImportError as exc:
        print(
            f"[hloc_features] ERRO: hloc/pycolmap ausentes ({exc}). "
            "Instale com: pip install -r scripts/local-gs/requirements_hloc.txt",
            file=sys.stderr,
        )
        return 2

    # ───── Sanidade da entrada ─────
    image_dir: Path = args.image_dir
    if not image_dir.is_dir():
        print(f"[hloc_features] ERRO: --image-dir nao existe: {image_dir}", file=sys.stderr)
        return 1

    image_names = _list_images(image_dir)
    if len(image_names) < 5:
        print(
            f"[hloc_features] ERRO: muito poucas imagens em {image_dir} "
            f"({len(image_names)}); minimo recomendado 20.",
            file=sys.stderr,
        )
        return 1

    args.export_dir.mkdir(parents=True, exist_ok=True)

    # ───── (Opcional P03) pre-mascarar frames ─────
    effective_image_dir = image_dir
    masks_applied = False
    if args.mask_dir is not None and args.mask_dir.is_dir():
        try:
            masked_out = args.export_dir / "frames_masked"
            _apply_masks(image_dir, args.mask_dir, masked_out)
            effective_image_dir = masked_out
            image_names = _list_images(effective_image_dir)
            masks_applied = True
        except Exception as exc:
            print(
                f"[hloc_features] AVISO: falha ao aplicar mascaras ({exc}); seguindo sem mascarar.",
                file=sys.stderr,
            )

    # ───── Configuracao SuperPoint + LightGlue ─────
    # extract_features.confs e' um dict global; copiar antes de mutar.
    feature_conf = dict(extract_features.confs["superpoint_aachen"])
    feature_conf["preprocessing"] = dict(feature_conf["preprocessing"])
    feature_conf["preprocessing"]["resize_max"] = int(args.max_image_size)
    feature_conf["model"] = dict(feature_conf["model"])
    feature_conf["model"]["max_keypoints"] = int(args.max_keypoints)

    matcher_conf = match_features.confs["superpoint+lightglue"]

    print(
        f"[hloc_features] config: features={feature_conf['model'].get('name', 'superpoint')} "
        f"| matcher={matcher_conf['model'].get('name', 'lightglue')} "
        f"| max_image_size={args.max_image_size} | max_keypoints={args.max_keypoints} "
        f"| frames={len(image_names)} | device={args.device}",
        flush=True,
    )

    # ───── 1) Extracao de features ─────
    print("[hloc_features] extraindo SuperPoint features...", flush=True)
    t_ex = time.perf_counter()
    try:
        features_path = extract_features.main(
            conf=feature_conf,
            image_dir=effective_image_dir,
            export_dir=args.export_dir,
            image_list=image_names,
        )
    except Exception as exc:
        print(f"[hloc_features] ERRO em extract_features: {exc}", file=sys.stderr)
        return 3
    extraction_seconds = time.perf_counter() - t_ex
    print(f"[hloc_features] features OK em {extraction_seconds:.1f}s -> {features_path.name}", flush=True)

    # ───── 2) Pares: exhaustive p/ <=200 frames, retrieval p/ acima ─────
    pairs_path = args.export_dir / "pairs.txt"
    pair_mode: str
    if len(image_names) <= 200:
        pair_mode = "exhaustive"
        print(f"[hloc_features] gerando pares exhaustive ({len(image_names)} imagens)...", flush=True)
        try:
            pairs_from_exhaustive.main(
                output=pairs_path,
                image_list=image_names,
            )
        except Exception as exc:
            print(f"[hloc_features] ERRO em pairs_from_exhaustive: {exc}", file=sys.stderr)
            return 3
    else:
        pair_mode = "retrieval_netvlad"
        print(
            f"[hloc_features] {len(image_names)} > 200 imagens -> retrieval (NetVLAD, top-{args.num_pairs_per_image})...",
            flush=True,
        )
        try:
            from hloc import pairs_from_retrieval

            retrieval_conf = extract_features.confs["netvlad"]
            retrieval_path = extract_features.main(
                conf=retrieval_conf,
                image_dir=effective_image_dir,
                export_dir=args.export_dir,
                image_list=image_names,
            )
            pairs_from_retrieval.main(
                descriptors=retrieval_path,
                output=pairs_path,
                num_matched=int(args.num_pairs_per_image),
            )
        except Exception as exc:
            print(
                f"[hloc_features] AVISO: retrieval falhou ({exc}); fallback p/ exhaustive.",
                file=sys.stderr,
            )
            try:
                pairs_from_exhaustive.main(output=pairs_path, image_list=image_names)
                pair_mode = "exhaustive_fallback"
            except Exception as exc2:
                print(f"[hloc_features] ERRO em pairs_from_exhaustive fallback: {exc2}", file=sys.stderr)
                return 3

    # ───── 3) Matching com LightGlue ─────
    print("[hloc_features] matching com LightGlue...", flush=True)
    t_match = time.perf_counter()
    try:
        matches_path = match_features.main(
            conf=matcher_conf,
            pairs=pairs_path,
            features=features_path,
            export_dir=args.export_dir,
        )
    except Exception as exc:
        print(f"[hloc_features] ERRO em match_features: {exc}", file=sys.stderr)
        return 3
    matching_seconds = time.perf_counter() - t_match
    print(f"[hloc_features] matches OK em {matching_seconds:.1f}s -> {matches_path.name}", flush=True)

    # ───── 4) Popular database.db COLMAP-compat ─────
    db_path: Path = args.database_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    print(f"[hloc_features] populando database.db COLMAP-compat em {db_path}...", flush=True)
    try:
        create_empty_db(db_path)
        import_images(effective_image_dir, db_path, camera_mode=pycolmap.CameraMode.SINGLE)
        image_ids = get_image_ids(db_path)
        import_features(image_ids, db_path, features_path)
        import_matches(image_ids, db_path, pairs_path, matches_path)
        estimation_and_geometric_verification(db_path, pairs_path, verbose=False)
    except Exception as exc:
        print(f"[hloc_features] ERRO ao popular database: {exc}", file=sys.stderr)
        # Apaga database parcial p/ o pipeline cair limpo no fallback COLMAP.
        if db_path.exists():
            try:
                db_path.unlink()
            except OSError:
                pass
        return 3

    if not db_path.is_file():
        print("[hloc_features] ERRO: database.db nao foi criado.", file=sys.stderr)
        return 3

    # ───── 5) Estatisticas + relatorio ─────
    feat_median = _safe_median_features(features_path)
    match_median = _safe_median_matches(matches_path)

    report = {
        "total_frames": len(image_names),
        "features_per_image_median": feat_median,
        "matches_per_pair_median": match_median,
        "pair_mode": pair_mode,
        "pairs_evaluated": (len(image_names) * (len(image_names) - 1) // 2)
            if pair_mode.startswith("exhaustive")
            else len(image_names) * int(args.num_pairs_per_image),
        "extraction_seconds": round(extraction_seconds, 2),
        "matching_seconds": round(matching_seconds, 2),
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "max_image_size": int(args.max_image_size),
        "max_keypoints": int(args.max_keypoints),
        "masks_applied": bool(masks_applied),
        "feature_extractor": "superpoint_aachen",
        "matcher": "superpoint+lightglue",
    }

    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"[hloc_features] relatorio gravado em {args.report}", flush=True)

    print(
        f"[hloc_features] OK | "
        f"extracao={extraction_seconds:.1f}s | matching={matching_seconds:.1f}s | "
        f"features_mediana={feat_median} | matches_mediana={match_median}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
