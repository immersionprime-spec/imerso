#!/usr/bin/env python3
"""make_lite_ply.py — Gera .ply com subconjunto das primeiras N gaussianas (P08).

Entrada deve estar ja ordenada por importancia (reorder_ply.py). Mantem as
primeiras ceil(n * ratio) linhas sem alterar schema.

Uso:
  python make_lite_ply.py --input scene_reordered.ply --output scene_lite.ply --ratio 0.30
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

try:
    from plyfile import PlyData, PlyElement
except ImportError:
    print("[make_lite_ply] ERRO: pip install plyfile", file=sys.stderr)
    sys.exit(2)


def main() -> int:
    ap = argparse.ArgumentParser(description="Subset PLY for lite ksplat (P08)")
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--ratio", type=float, default=0.30, help="Fracao 0..1 de gaussianas a manter (default 0.30)")
    args = ap.parse_args()

    r = float(args.ratio)
    if r <= 0 or r > 1:
        print("[make_lite_ply] ERRO: --ratio deve estar em (0, 1]", file=sys.stderr)
        return 1

    if not args.input.is_file():
        print(f"[make_lite_ply] ERRO: --input nao existe: {args.input}", file=sys.stderr)
        return 1

    ply = PlyData.read(str(args.input))
    v = ply["vertex"]
    data = v.data
    n = int(data.shape[0])
    keep = max(1, int(math.ceil(n * r)))
    keep = min(keep, n)
    subset = data[:keep]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    el = PlyElement.describe(subset, "vertex")
    PlyData([el], text=False).write(str(args.output))

    print(f"[make_lite_ply] OK | {n} -> {keep} ({100 * keep / n:.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
