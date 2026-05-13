#!/usr/bin/env python3
"""rotate_ply_yup.py — Aplica R_x(180 graus) a um .ply 3DGS para convencao Y-up (P10).

Por que:
- Brush herda a convencao do COLMAP (Y aponta para baixo, computer vision).
- O viewer do Imerso (`@mkkellogg/gaussian-splats-3d`) compensa via cameraUp=[0,-1,0].
- Ferramentas externas (SuperSplat, Blender, Unity, Polycam) assumem Y up (OpenGL).
- Este script gera um .ply paralelo com a cena rotacionada R_x(pi) = (x,y,z)->(x,-y,-z),
  alinhado a convencao graphics, sem alterar o .ply original.

O que muda:
- Position (x, y, z) -> (x, -y, -z)
- Rotation quaternion (rot_0=w, rot_1=x, rot_2=y, rot_3=z): q_new = q_R * q_old com
  q_R = (0, 1, 0, 0). Resultado: (w, x, y, z) -> (-x, w, -z, y).
- Normais (nx, ny, nz): mesma regra das positions (campo em geral nao usado, mas
  preservado por consistencia).
- Spherical Harmonics > 0: cada coeficiente recebe um sign flip determinado pela
  Wigner-D em base real para R_x(pi). DC (l=0) e invariante.
- Scale e Opacity: invariantes a rotacao rigida.

Assinatura SH (base real, ordem 3DGS: l=1 antes de l=2 antes de l=3):
  l=1, m: [-1, 0, +1]                        -> signs [-1, -1, +1]
  l=2, m: [-2, -1, 0, +1, +2]                -> signs [-1, +1, +1, -1, +1]
  l=3, m: [-3, -2, -1, 0, +1, +2, +3]        -> signs [-1, +1, -1, -1, +1, -1, +1]

Layout f_rest no 3DGS Inria (preservado pelo Brush): canal-major, isto e,
  f_rest[c*num_extra + k] = canal c (R/G/B), coeficiente k (l=1..L, m=-l..+l).
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
    print("[rotate_ply_yup] ERRO: pip install numpy", file=sys.stderr)
    sys.exit(2)

try:
    from plyfile import PlyData, PlyElement
except ImportError:
    print("[rotate_ply_yup] ERRO: pip install plyfile", file=sys.stderr)
    sys.exit(2)


def sh_signs_rx_pi(num_extra: int) -> np.ndarray:
    """Sinais por coeficiente SH (l>=1) sob R_x(pi), ordem 3DGS.

    Derivacao: Y_l^m(theta, phi) = N * P_l^|m|(cos theta) * trig(m*phi).
    Sob R_x(pi): theta->pi-theta (cos theta -> -cos theta), phi->-phi.
    cos(m phi)  -> cos(m phi)   (par)
    sin(m phi)  -> -sin(m phi)  (impar)
    P_l^|m|(-c) = (-1)^(l-|m|) P_l^|m|(c)
    => sign(m<0)  = -(-1)^(l-|m|) = (-1)^(l-|m|+1)
       sign(m=0)  = (-1)^l
       sign(m>0)  = (-1)^(l-m)
    """
    signs: list[int] = []
    l = 1
    while len(signs) < num_extra:
        for m in range(-l, l + 1):
            am = abs(m)
            if m < 0:
                s = -((-1) ** (l - am))
            elif m == 0:
                s = (-1) ** l
            else:
                s = (-1) ** (l - m)
            signs.append(int(s))
            if len(signs) == num_extra:
                break
        l += 1
        if l > 10:
            raise ValueError(f"num_extra={num_extra} fora do esperado (l max=10)")
    return np.array(signs, dtype=np.float32)


def apply_quat_rx_pi(rot4: np.ndarray) -> np.ndarray:
    """Compoe q_R = (0,1,0,0) (R_x pi) com cada quaternion existente q_old.
    Producto Hamilton: q_R * q_old = (-x, w, -z, y), com q_old=(w,x,y,z).
    """
    w = rot4[:, 0]
    x = rot4[:, 1]
    y = rot4[:, 2]
    z = rot4[:, 3]
    return np.stack([-x, w, -z, y], axis=-1).astype(np.float32)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Rotaciona um .ply 3DGS por R_x(180 graus) para convencao Y-up (P10)."
    )
    ap.add_argument("--input", type=Path, required=True, help="Arquivo .ply de entrada")
    ap.add_argument("--output", type=Path, required=True, help="Arquivo .ply de saida")
    ap.add_argument(
        "--report",
        type=Path,
        default=None,
        help="JSON opcional com estatisticas da transformacao",
    )
    args = ap.parse_args()

    if not args.input.is_file():
        print(f"[rotate_ply_yup] ERRO: --input nao existe: {args.input}", file=sys.stderr)
        return 1

    t0 = time.perf_counter()
    ply = PlyData.read(str(args.input))
    if "vertex" not in {e.name for e in ply.elements}:
        print("[rotate_ply_yup] ERRO: PLY sem elemento vertex", file=sys.stderr)
        return 1

    v = ply["vertex"]
    data = v.data
    n = int(data.shape[0])
    if n == 0:
        print("[rotate_ply_yup] ERRO: zero gaussianas", file=sys.stderr)
        return 1

    field_names = set(data.dtype.names or ())

    # Positions
    if not {"x", "y", "z"}.issubset(field_names):
        print("[rotate_ply_yup] ERRO: PLY sem x/y/z", file=sys.stderr)
        return 1
    data["y"] = -data["y"]
    data["z"] = -data["z"]

    # Normais (mesma regra; geralmente zero, mas preservamos consistencia)
    if {"nx", "ny", "nz"}.issubset(field_names):
        data["ny"] = -data["ny"]
        data["nz"] = -data["nz"]

    # Quaternions de orientacao da gaussiana (3DGS: rot_0=w, rot_1=x, rot_2=y, rot_3=z)
    quat_rotated = 0
    if {"rot_0", "rot_1", "rot_2", "rot_3"}.issubset(field_names):
        rot = np.stack(
            [data["rot_0"], data["rot_1"], data["rot_2"], data["rot_3"]], axis=-1
        )
        new_rot = apply_quat_rx_pi(rot)
        data["rot_0"] = new_rot[:, 0]
        data["rot_1"] = new_rot[:, 1]
        data["rot_2"] = new_rot[:, 2]
        data["rot_3"] = new_rot[:, 3]
        quat_rotated = n

    # SH ordem > 0. DC (f_dc_*) e l=0 e invariante sob R_x(pi).
    rest_keys = sorted(
        (k for k in field_names if k.startswith("f_rest_")),
        key=lambda s: int(s.split("_")[-1]),
    )
    sh_flipped = 0
    sh_total_coeffs = 0
    if rest_keys:
        total_rest = len(rest_keys)
        if total_rest % 3 != 0:
            print(
                f"[rotate_ply_yup] AVISO: f_rest count {total_rest} nao divisivel por 3 "
                "canais; SH nao sera rotacionado (output pode ter cores erradas em angulos opostos).",
                file=sys.stderr,
            )
        else:
            num_extra = total_rest // 3
            signs = sh_signs_rx_pi(num_extra)
            sh_total_coeffs = total_rest
            for c in range(3):
                for k in range(num_extra):
                    if signs[k] == -1:
                        key = f"f_rest_{c * num_extra + k}"
                        data[key] = -data[key]
                        sh_flipped += 1

    out_el = PlyElement.describe(data, "vertex")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    PlyData([out_el], text=False).write(str(args.output))

    elapsed = round(time.perf_counter() - t0, 2)

    report = {
        "input_gaussians": int(n),
        "output_gaussians": int(n),
        "transform": "R_x(180deg) -> y'=-y, z'=-z",
        "quaternions_recomposed": int(quat_rotated),
        "sh_coefficients_total": int(sh_total_coeffs),
        "sh_coefficients_flipped": int(sh_flipped),
        "duration_seconds": elapsed,
        "input_ply": str(args.input),
        "output_ply": str(args.output),
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(
        f"[rotate_ply_yup] OK | n={n} | {elapsed}s | quats={quat_rotated} | "
        f"SH flipped={sh_flipped}/{sh_total_coeffs}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
