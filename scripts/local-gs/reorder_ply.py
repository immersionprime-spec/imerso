#!/usr/bin/env python3
"""reorder_ply.py — Reordena gaussianas em um .ply 3DGS por importancia visual (P08).

Splats mais importantes (alta opacidade x volume em espaco linear) ficam no
inicio do arquivo. Viewers com progressiveLoad exibem os primeiros chunks
com a cena ja reconhecivel.

Investigacao create-ksplat / @mkkellogg/gaussian-splats-3d (P08):
- O formato .ksplat empacota splats na ordem em que aparecem no buffer de
  entrada; nao ha opcao de bucketing/sort no utilitario create-ksplat.js do
  gs3d-source (mesma logica do pacote npm). A lib reordena em runtime na GPU
  para depth-sort, mas o progressiveLoad le o arquivo sequencialmente — por
  isso a ordem no .ply/.ksplat importa para TTR percebido.

Uso:
  python reorder_ply.py --input scene.ply --output scene_reordered.ply --report reorder_report.json

Dependencias: numpy, plyfile (CPU).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

try:
    import numpy as np
except ImportError:
    print("[reorder_ply] ERRO: pip install numpy", file=sys.stderr)
    sys.exit(2)

try:
    from plyfile import PlyData, PlyElement
except ImportError:
    print("[reorder_ply] ERRO: pip install plyfile", file=sys.stderr)
    sys.exit(2)

REQUIRED = (
    "x", "y", "z",
    "scale_0", "scale_1", "scale_2",
    "rot_0", "rot_1", "rot_2", "rot_3",
    "f_dc_0", "f_dc_1", "f_dc_2",
    "opacity",
)


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x.astype(np.float64)))


def linear_scales(raw: np.ndarray) -> np.ndarray:
    return np.exp(raw.astype(np.float64))


def importance(vertex_data: np.ndarray) -> np.ndarray:
    op = sigmoid(vertex_data["opacity"])
    s0, s1, s2 = linear_scales(vertex_data["scale_0"]), linear_scales(vertex_data["scale_1"]), linear_scales(vertex_data["scale_2"])
    return op * s0 * s1 * s2


def main() -> int:
    ap = argparse.ArgumentParser(description="Reordena .ply 3DGS por importancia (P08)")
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--report", type=Path, default=None)
    args = ap.parse_args()

    if not args.input.is_file():
        print(f"[reorder_ply] ERRO: --input nao existe: {args.input}", file=sys.stderr)
        return 1

    t0 = time.perf_counter()
    ply = PlyData.read(str(args.input))
    if "vertex" not in {e.name for e in ply.elements}:
        print("[reorder_ply] ERRO: PLY sem elemento vertex", file=sys.stderr)
        return 1
    v = ply["vertex"]
    names = list(v.data.dtype.names or ())
    missing = [f for f in REQUIRED if f not in names]
    if missing:
        print(f"[reorder_ply] ERRO: campos ausentes: {missing}", file=sys.stderr)
        return 1

    data = v.data
    n = int(data.shape[0])
    if n == 0:
        print("[reorder_ply] ERRO: zero gaussianas", file=sys.stderr)
        return 1

    imp = importance(data)
    order = np.argsort(-imp)
    reordered = data[order]

    out_el = PlyElement.describe(reordered, "vertex")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    PlyData([out_el], text=False).write(str(args.output))

    elapsed = round(time.perf_counter() - t0, 2)
    imp_sorted = np.sort(imp)[::-1]
    k10 = max(1, n // 10)
    top_avg = float(np.mean(imp_sorted[:k10]))
    bot_avg = float(np.mean(imp_sorted[-k10:]))

    report = {
        "total_gaussians": n,
        "top_10pct_avg_importance": round(top_avg, 6),
        "bottom_10pct_avg_importance": round(bot_avg, 6),
        "reorder_seconds": elapsed,
        "input_ply": str(args.input),
        "output_ply": str(args.output),
    }
    if args.report:
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"[reorder_ply] OK | n={n} | {elapsed}s | top10%avg={top_avg:.4g} bot10%avg={bot_avg:.4g}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
