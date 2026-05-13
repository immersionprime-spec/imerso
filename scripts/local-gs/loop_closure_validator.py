#!/usr/bin/env python3
"""
loop_closure_validator.py — Valida fechamento de loop após SfM.

Lê sparse/0/images.bin do COLMAP, calcula distância entre primeiro e último
frame da trajetória (ordem temporal pelo nome), e emite aviso se o loop
não foi fechado.

Uso:
  python loop_closure_validator.py \\
      --colmap-sparse output/<timestamp>/colmap_ws/sparse/0 \\
      --report loop_closure_report.json \\
      [--strict]   # exit 1 se status == warning

Dependência: numpy apenas. Parser images.bin sem PyTorch.
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# TODO(founder): calibrar thresholds (ratio < 5 / < 15, ângulos 15° / 30°) após dataset de 5–10 tours reais.


@dataclass
class ColmapImage:
    image_id: int
    qvec: np.ndarray  # (4,) qw,qx,qy,qz
    tvec: np.ndarray  # (3,) tx,ty,tz
    camera_id: int
    name: str


def read_next_bytes(fid, num_bytes: int, fmt: str) -> tuple:
    data = fid.read(num_bytes)
    if len(data) < num_bytes:
        raise ValueError(f"EOF reading {num_bytes} bytes (got {len(data)})")
    return struct.unpack("<" + fmt, data)


def read_images_bin(path: Path) -> list[ColmapImage]:
    """Lê COLMAP images.bin (little-endian). Ver reconstruction.cc WriteImagesBinary."""
    images: list[ColmapImage] = []
    with path.open("rb") as fid:
        (num_reg,) = read_next_bytes(fid, 8, "Q")
        for _ in range(int(num_reg)):
            props = read_next_bytes(fid, 64, "idddddddi")
            image_id = int(props[0])
            qw, qx, qy, qz = props[1:5]
            tx, ty, tz = props[5:8]
            camera_id = int(props[8])
            name_bytes = bytearray()
            while True:
                ch = fid.read(1)
                if not ch or ch == b"\x00":
                    break
                name_bytes.extend(ch)
            name = name_bytes.decode("utf-8", errors="replace")
            (num_points2d,) = read_next_bytes(fid, 8, "Q")
            skip = int(num_points2d) * 24  # ddq = 8+8+8
            fid.seek(skip, 1)
            images.append(
                ColmapImage(
                    image_id=image_id,
                    qvec=np.array([qw, qx, qy, qz], dtype=np.float64),
                    tvec=np.array([tx, ty, tz], dtype=np.float64),
                    camera_id=camera_id,
                    name=name,
                )
            )
    return images


def quaternion_to_rotation_matrix(qvec: np.ndarray) -> np.ndarray:
    """COLMAP qvec (w,x,y,z) → matriz 3×3 R (world→camera)."""
    q = qvec / (np.linalg.norm(qvec) + 1e-12)
    w, x, y, z = float(q[0]), float(q[1]), float(q[2]), float(q[3])
    return np.array(
        [
            [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * z * w, 2 * x * z + 2 * y * w],
            [2 * x * y + 2 * z * w, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * x * w],
            [2 * x * z - 2 * y * w, 2 * y * z + 2 * x * w, 1 - 2 * x * x - 2 * y * y],
        ],
        dtype=np.float64,
    )


def camera_center(qvec: np.ndarray, tvec: np.ndarray) -> np.ndarray:
    R = quaternion_to_rotation_matrix(qvec)
    return (-R.T @ tvec.reshape(3)).reshape(3)


def camera_forward(qvec: np.ndarray) -> np.ndarray:
    """Direção de visada (COLMAP): R.T @ e_z."""
    R = quaternion_to_rotation_matrix(qvec)
    v = R.T @ np.array([0.0, 0.0, 1.0], dtype=np.float64)
    n = np.linalg.norm(v)
    return v / (n + 1e-12)


def frame_sort_key(name: str) -> tuple[int, str]:
    m = re.search(r"(\d+)", Path(name).name)
    if m:
        return (int(m.group(1)), name.lower())
    return (10**9, name.lower())


def median_step_with_outlier_trim(centers: list[np.ndarray]) -> float:
    """Mediana das distâncias entre consecutivos; remove > 3× mediana antes da mediana final."""
    if len(centers) < 2:
        return 1.0
    dists = [
        float(np.linalg.norm(centers[i + 1] - centers[i]))
        for i in range(len(centers) - 1)
    ]
    arr = np.array(dists, dtype=np.float64)
    med0 = float(np.median(arr))
    if med0 < 1e-12:
        med0 = 1e-12
    kept = arr[arr <= 3.0 * med0]
    if kept.size < 2:
        kept = arr
    return float(np.median(kept))


def angle_between_deg(u: np.ndarray, v: np.ndarray) -> float:
    du = np.linalg.norm(u)
    dv = np.linalg.norm(v)
    if du < 1e-12 or dv < 1e-12:
        return 0.0
    c = float(np.dot(u, v) / (du * dv))
    c = max(-1.0, min(1.0, c))
    return float(np.degrees(np.arccos(c)))


def classify(ratio: float, forward_angle_deg: float) -> tuple[str, str]:
    if ratio < 5 and forward_angle_deg < 15:
        return (
            "excellent",
            "Loop closure: excelente (primeiro e último frame quase coincidem)",
        )
    if ratio < 15 and forward_angle_deg < 30:
        return ("ok", "Loop closure: aceitável")
    return (
        "warning",
        f"Loop closure RUIM: distância normalizada {ratio:.1f}× passo, ângulo "
        f"{forward_angle_deg:.0f}°. Recomendado refazer captura fechando o loop.",
    )


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Valida loop closure a partir de sparse/0/images.bin (COLMAP)."
    )
    ap.add_argument(
        "--colmap-sparse",
        type=Path,
        required=True,
        help="Pasta sparse/0 (contendo images.bin).",
    )
    ap.add_argument(
        "--report",
        type=Path,
        required=True,
        help="JSON de saída.",
    )
    ap.add_argument(
        "--strict",
        action="store_true",
        help="Exit 1 se status == warning.",
    )
    args = ap.parse_args()

    images_path = args.colmap_sparse / "images.bin"
    if not images_path.is_file():
        print(
            f"loop_closure_validator: images.bin não encontrado em {args.colmap_sparse}",
            file=sys.stderr,
        )
        return 0

    try:
        records = read_images_bin(images_path)
    except Exception as e:
        print(f"loop_closure_validator: falha ao ler images.bin: {e}", file=sys.stderr)
        return 0

    n = len(records)
    if n < 2:
        print(
            f"loop_closure_validator: menos de 2 imagens registradas ({n}), ignorando.",
            file=sys.stderr,
        )
        return 0

    ordered = sorted(records, key=lambda r: frame_sort_key(r.name))
    centers = [camera_center(r.qvec, r.tvec) for r in ordered]
    first_c, last_c = centers[0], centers[-1]
    first_fwd = camera_forward(ordered[0].qvec)
    last_fwd = camera_forward(ordered[-1].qvec)

    distance = float(np.linalg.norm(last_c - first_c))
    step_median = median_step_with_outlier_trim(centers)
    ratio = distance / (step_median + 1e-12)
    forward_angle_deg = angle_between_deg(first_fwd, last_fwd)

    status, message = classify(ratio, forward_angle_deg)

    report = {
        "status": status,
        "registered_images": n,
        "first_frame": ordered[0].name,
        "last_frame": ordered[-1].name,
        "first_center": [float(x) for x in first_c],
        "last_center": [float(x) for x in last_c],
        "distance_units": round(distance, 6),
        "step_median_units": round(step_median, 6),
        "ratio": round(ratio, 4),
        "forward_angle_degrees": round(forward_angle_deg, 4),
        "forward_angle_alert_over_30deg": forward_angle_deg > 30.0,
        "message": message,
    }

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(message, flush=True)

    if args.strict and status == "warning":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
