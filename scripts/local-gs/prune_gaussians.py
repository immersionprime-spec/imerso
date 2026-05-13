#!/usr/bin/env python3
"""prune_gaussians.py - LightGaussian pruning + (opcional) quantizacao (P07).

Adaptacao CPU-friendly do paper "LightGaussian" (Fan et al., NeurIPS 2024
Spotlight, arXiv:2311.17245). Le um .ply 3DGS-padrao produzido por Brush
(0.3.0) ou Mip-Splatting (P06), calcula uma significancia global por
gaussiana contra as views do COLMAP (sparse/0/{cameras,images}.bin) e
remove as menos significantes.

Aproximacao usada (vide restricao #10 do prompt P07): "global significance"
e calculada via projecao do CENTRO de cada gaussiana em cada camera; uma
gaussiana e considerada visivel em uma view quando esta a frente da camera
E sua projecao cai dentro do retangulo da imagem. A significancia final
combina opacidade, volume (proxy: scale_x * scale_y * scale_z) e numero
de views que veem a gaussiana (Eq. 1 do paper, sem o termo de hit-prob
exato que dependeria do diff-gaussian-rasterization).

Quantizacao (opcional, default OFF): k-means (k=256) sobre escalas e
rotacoes. Mantida como opcao avancada — `create-ksplat.js` ja comprime;
quantizacao dupla pode degradar. Validar empiricamente.

Distilacao de SH NAO e aplicada porque o pipeline atual usa
sphericalHarmonicsLevel=0 (so DC coefficient). Se um dia o .ply trouxer
f_rest_*, esses campos sao preservados como esta.

Exit codes:
  0  ok
  1  argumentos / arquivos invalidos
  2  dependencia ausente (plyfile, numpy)
  3  runtime: falha de parse COLMAP, PLY corrompido, escrita do output

Uso:
  python prune_gaussians.py \
      --ply scene.ply \
      --output scene_pruned.ply \
      --colmap-sparse colmap_ws/sparse/0 \
      --prune-ratio 0.6 \
      --report prune_report.json
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


PRUNE_RATIO_MAX = 0.85  # restricao #8 do prompt: aceitavel ate 0.85
PRUNE_RATIO_MIN = 0.0
DEFAULT_PRUNE_RATIO = 0.6


def _eprint(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _log(msg: str) -> None:
    print(msg, flush=True)


# ─── Dependencias defensivas ────────────────────────────────────────────────
try:
    import numpy as np
except ImportError as exc:
    _eprint(f"[prune_gaussians] ERRO: numpy nao instalado ({exc}). pip install numpy")
    sys.exit(2)

try:
    from plyfile import PlyData, PlyElement
except ImportError as exc:
    _eprint(f"[prune_gaussians] ERRO: plyfile nao instalado ({exc}). pip install plyfile")
    sys.exit(2)


# ─── Parser COLMAP cameras.bin ──────────────────────────────────────────────
# Tabela (model_id -> params_count). Para detalhes, ver
# colmap/src/colmap/sensor/models.h
COLMAP_CAMERA_MODELS = {
    0: ("SIMPLE_PINHOLE", 3),       # f, cx, cy
    1: ("PINHOLE", 4),              # fx, fy, cx, cy
    2: ("SIMPLE_RADIAL", 4),        # f, cx, cy, k
    3: ("RADIAL", 5),               # f, cx, cy, k1, k2
    4: ("OPENCV", 8),               # fx, fy, cx, cy, k1, k2, p1, p2
    5: ("OPENCV_FISHEYE", 8),
    6: ("FULL_OPENCV", 12),
    7: ("FOV", 5),
    8: ("SIMPLE_RADIAL_FISHEYE", 4),
    9: ("RADIAL_FISHEYE", 5),
    10: ("THIN_PRISM_FISHEYE", 12),
}


@dataclass
class ColmapCamera:
    """Intrinsecos de uma camera. fx/fy/cx/cy em pixels; distorcao ignorada."""
    camera_id: int
    model_id: int
    width: int
    height: int
    fx: float
    fy: float
    cx: float
    cy: float


@dataclass
class ColmapImage:
    """Pose: world->camera (qvec, tvec)."""
    image_id: int
    qvec: np.ndarray  # (4,) w,x,y,z
    tvec: np.ndarray  # (3,)
    camera_id: int
    name: str


def _read_bytes(fid, n: int, fmt: str) -> tuple:
    data = fid.read(n)
    if len(data) < n:
        raise ValueError(f"EOF lendo {n} bytes (recebi {len(data)})")
    return struct.unpack("<" + fmt, data)


def _extract_intrinsics(model_id: int, params: list[float]) -> tuple[float, float, float, float]:
    """Extrai (fx, fy, cx, cy) ignorando distorcao (boa aproximacao p/ visibilidade)."""
    info = COLMAP_CAMERA_MODELS.get(model_id)
    if info is None:
        # Modelo desconhecido: tentar heuristica (assume formato pinhole simples)
        if len(params) >= 4:
            return float(params[0]), float(params[1]), float(params[2]), float(params[3])
        if len(params) == 3:
            f, cx, cy = params
            return float(f), float(f), float(cx), float(cy)
        raise ValueError(f"modelo de camera desconhecido (id={model_id}) com {len(params)} params")

    name, _ = info
    if name in ("SIMPLE_PINHOLE",):
        f, cx, cy = params[:3]
        return float(f), float(f), float(cx), float(cy)
    if name in ("PINHOLE",):
        fx, fy, cx, cy = params[:4]
        return float(fx), float(fy), float(cx), float(cy)
    if name in ("SIMPLE_RADIAL", "SIMPLE_RADIAL_FISHEYE"):
        f, cx, cy = params[:3]
        return float(f), float(f), float(cx), float(cy)
    if name in ("RADIAL", "RADIAL_FISHEYE", "FOV"):
        f, cx, cy = params[:3]
        return float(f), float(f), float(cx), float(cy)
    if name in ("OPENCV", "OPENCV_FISHEYE", "FULL_OPENCV", "THIN_PRISM_FISHEYE"):
        fx, fy, cx, cy = params[:4]
        return float(fx), float(fy), float(cx), float(cy)
    raise ValueError(f"modelo {name} sem mapeamento explicito")


def read_cameras_bin(path: Path) -> dict[int, ColmapCamera]:
    cameras: dict[int, ColmapCamera] = {}
    with path.open("rb") as fid:
        (num,) = _read_bytes(fid, 8, "Q")
        for _ in range(int(num)):
            # camera_id: uint32 (4 bytes), model_id: int32 (4), width: uint64 (8), height: uint64 (8)
            cid, mid, w, h = _read_bytes(fid, 24, "iiQQ")
            info = COLMAP_CAMERA_MODELS.get(int(mid))
            params_count = info[1] if info is not None else None
            if params_count is None:
                # Fallback: leitura defensiva — sem saber, paramos
                raise ValueError(
                    f"camera_id={cid}: modelo {mid} desconhecido (sem params_count na tabela)"
                )
            params = _read_bytes(fid, 8 * params_count, "d" * params_count)
            fx, fy, cx_, cy_ = _extract_intrinsics(int(mid), list(params))
            cameras[int(cid)] = ColmapCamera(
                camera_id=int(cid),
                model_id=int(mid),
                width=int(w),
                height=int(h),
                fx=fx, fy=fy, cx=cx_, cy=cy_,
            )
    return cameras


def read_images_bin(path: Path) -> list[ColmapImage]:
    """Compativel com loop_closure_validator.read_images_bin (mesmo schema)."""
    images: list[ColmapImage] = []
    with path.open("rb") as fid:
        (num,) = _read_bytes(fid, 8, "Q")
        for _ in range(int(num)):
            props = _read_bytes(fid, 64, "idddddddi")
            image_id = int(props[0])
            qw, qx, qy, qz = props[1:5]
            tx, ty, tz = props[5:8]
            cam_id = int(props[8])
            name_bytes = bytearray()
            while True:
                ch = fid.read(1)
                if not ch or ch == b"\x00":
                    break
                name_bytes.extend(ch)
            name = name_bytes.decode("utf-8", errors="replace")
            (num_pts,) = _read_bytes(fid, 8, "Q")
            fid.seek(int(num_pts) * 24, 1)  # skip points2d
            images.append(
                ColmapImage(
                    image_id=image_id,
                    qvec=np.array([qw, qx, qy, qz], dtype=np.float64),
                    tvec=np.array([tx, ty, tz], dtype=np.float64),
                    camera_id=cam_id,
                    name=name,
                )
            )
    return images


def quaternion_to_R(qvec: np.ndarray) -> np.ndarray:
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


# ─── PLY I/O ────────────────────────────────────────────────────────────────
REQUIRED_3DGS_FIELDS = (
    "x", "y", "z",
    "scale_0", "scale_1", "scale_2",
    "rot_0", "rot_1", "rot_2", "rot_3",
    "f_dc_0", "f_dc_1", "f_dc_2",
    "opacity",
)


def load_3dgs_ply(path: Path) -> tuple[np.ndarray, list[str]]:
    """Retorna (structured array de vertices, lista de campos)."""
    ply = PlyData.read(str(path))
    if "vertex" not in {el.name for el in ply.elements}:
        raise ValueError(f"PLY sem elemento 'vertex': {path}")
    v = ply["vertex"]
    fields = list(v.data.dtype.names or ())
    missing = [f for f in REQUIRED_3DGS_FIELDS if f not in fields]
    if missing:
        raise ValueError(
            f"PLY sem campos 3DGS obrigatorios: {missing}. Campos presentes: {fields}"
        )
    return v.data, fields


def save_3dgs_ply(out_path: Path, vertex_data: np.ndarray) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    el = PlyElement.describe(vertex_data, "vertex")
    PlyData([el], text=False).write(str(out_path))


# ─── Algoritmo de significancia + pruning ──────────────────────────────────
def compute_visibility_counts(
    centers: np.ndarray,
    images: list[ColmapImage],
    cameras: dict[int, ColmapCamera],
    sample_size: Optional[int] = None,
    rng_seed: int = 42,
) -> tuple[np.ndarray, int]:
    """Para cada gaussiana, conta em quantas views ela esta visivel.

    Retorna (counts, num_views_used).
    """
    N = centers.shape[0]
    counts = np.zeros(N, dtype=np.int32)

    # Plano B do prompt P07: amostragem de views para cenas grandes
    selected = list(images)
    if sample_size is not None and len(images) > sample_size > 0:
        rng = np.random.default_rng(rng_seed)
        idx = rng.choice(len(images), size=sample_size, replace=False)
        selected = [images[i] for i in idx]

    for img in selected:
        cam = cameras.get(img.camera_id)
        if cam is None:
            continue  # pose orfa (sem intrinseco)
        R = quaternion_to_R(img.qvec)  # world->cam
        t = img.tvec.reshape(3)
        # cam_coords (N,3) = centers @ R.T + t
        cam_coords = centers @ R.T + t
        z = cam_coords[:, 2]
        in_front = z > 0
        # Para evitar divisao por zero, mascara z onde in_front=False
        z_safe = np.where(in_front, z, 1.0)
        u = cam.fx * (cam_coords[:, 0] / z_safe) + cam.cx
        v = cam.fy * (cam_coords[:, 1] / z_safe) + cam.cy
        visible = in_front & (u >= 0.0) & (u < cam.width) & (v >= 0.0) & (v < cam.height)
        counts += visible.astype(np.int32)
    return counts, len(selected)


def opacity_sigmoid(raw: np.ndarray) -> np.ndarray:
    """Brush/Inria 3DGS armazena opacidade em logit; sigmoid devolve [0,1]."""
    # numericamente seguro
    return 1.0 / (1.0 + np.exp(-raw.astype(np.float64)))


def scale_to_linear(raw: np.ndarray) -> np.ndarray:
    """scale_* sao logs no .ply 3DGS-padrao; exp devolve escala linear positiva."""
    return np.exp(raw.astype(np.float64))


def compute_significance(
    vertex_data: np.ndarray,
    images: list[ColmapImage],
    cameras: dict[int, ColmapCamera],
    sample_size: Optional[int] = None,
) -> tuple[np.ndarray, dict]:
    """Calcula significancia = opacity * volume * view_count para cada gaussiana."""
    centers = np.stack(
        [vertex_data["x"], vertex_data["y"], vertex_data["z"]], axis=1
    ).astype(np.float64)

    opacity_logit = vertex_data["opacity"].astype(np.float64)
    opacity = opacity_sigmoid(opacity_logit)

    s0 = scale_to_linear(vertex_data["scale_0"])
    s1 = scale_to_linear(vertex_data["scale_1"])
    s2 = scale_to_linear(vertex_data["scale_2"])
    volume_proxy = s0 * s1 * s2  # det(Sigma)^0.5 proxy

    counts, views_used = compute_visibility_counts(
        centers, images, cameras, sample_size=sample_size
    )

    # Significancia conforme paper (Eq. 1, simplificada sem hit-prob exata).
    # Termo "view_count" entra como contribuicao integrada nas views.
    significance = opacity * volume_proxy * counts.astype(np.float64)

    stats = {
        "views_used": int(views_used),
        "min_count": int(counts.min()) if counts.size else 0,
        "max_count": int(counts.max()) if counts.size else 0,
        "median_count": float(np.median(counts)) if counts.size else 0.0,
        "min_sig": float(significance.min()) if significance.size else 0.0,
        "max_sig": float(significance.max()) if significance.size else 0.0,
        "zero_count_gaussians": int(np.sum(counts == 0)),
    }
    return significance, stats


def prune_by_significance(
    vertex_data: np.ndarray, significance: np.ndarray, prune_ratio: float
) -> tuple[np.ndarray, int]:
    """Mantem top (1 - prune_ratio) * N gaussianas. Retorna (data_pruned, kept)."""
    N = vertex_data.shape[0]
    kept = max(1, int(round((1.0 - prune_ratio) * N)))
    if kept >= N:
        return vertex_data, N
    # argsort decrescente: indices dos top-`kept`
    # np.argpartition e O(N), suficiente para nosso caso
    top_idx = np.argpartition(-significance, kept - 1)[:kept]
    # Ordenar os top para um output determinístico (significancia desc)
    top_idx = top_idx[np.argsort(-significance[top_idx])]
    return vertex_data[top_idx], kept


# ─── Quantizacao opcional ──────────────────────────────────────────────────
def quantize_columns(vertex_data: np.ndarray, columns: list[str], k: int = 256, seed: int = 0) -> int:
    """Substitui linhas das colunas por centroides k-means. Retorna numero de clusters reais."""
    try:
        from sklearn.cluster import KMeans
    except ImportError:
        _eprint(
            "[prune_gaussians] AVISO: --quantize ativo mas scikit-learn nao instalado; "
            "pip install scikit-learn. Pulando quantizacao."
        )
        return 0
    if not columns:
        return 0
    matrix = np.stack([vertex_data[c].astype(np.float32) for c in columns], axis=1)
    n_samples = matrix.shape[0]
    effective_k = min(k, n_samples)
    if effective_k <= 1:
        return 0
    km = KMeans(n_clusters=effective_k, n_init=4, random_state=seed)
    labels = km.fit_predict(matrix)
    centroids = km.cluster_centers_.astype(np.float32)
    for ci, col in enumerate(columns):
        vertex_data[col] = centroids[labels, ci].astype(vertex_data[col].dtype, copy=False)
    return int(effective_k)


# ─── Main ──────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(
        description="LightGaussian pruning + (opcional) quantizacao (P07)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--ply", required=True, type=Path,
                    help="Caminho do .ply 3DGS de entrada (saida do Brush/Mip-Splatting).")
    ap.add_argument("--output", required=True, type=Path,
                    help="Caminho do .ply pruned a gravar.")
    ap.add_argument("--colmap-sparse", required=True, type=Path,
                    help="Pasta sparse/0/ com cameras.bin + images.bin.")
    ap.add_argument("--prune-ratio", type=float, default=DEFAULT_PRUNE_RATIO,
                    help=f"Fracao removida ({PRUNE_RATIO_MIN}..{PRUNE_RATIO_MAX}).")
    ap.add_argument("--quantize", action="store_true",
                    help="Aplica k-means (k=256) em scale_* e rot_*.")
    ap.add_argument("--quantize-k", type=int, default=256,
                    help="Numero de clusters da quantizacao (so com --quantize).")
    ap.add_argument("--view-sample", type=int, default=0,
                    help="Plano B: amostragem de views (0 = usar todas).")
    ap.add_argument("--report", type=Path, default=None,
                    help="Caminho do JSON de relatorio (sera criado).")
    args = ap.parse_args()

    # ─── Validacao dos argumentos ─────────────────────────────────────────
    if not args.ply.is_file():
        _eprint(f"[prune_gaussians] ERRO: --ply nao existe: {args.ply}")
        return 1
    if not args.colmap_sparse.is_dir():
        _eprint(f"[prune_gaussians] ERRO: --colmap-sparse nao existe: {args.colmap_sparse}")
        return 1
    cameras_bin = args.colmap_sparse / "cameras.bin"
    images_bin = args.colmap_sparse / "images.bin"
    for required in (cameras_bin, images_bin):
        if not required.is_file():
            _eprint(f"[prune_gaussians] ERRO: arquivo COLMAP ausente: {required}")
            return 1

    pr = float(args.prune_ratio)
    if pr < PRUNE_RATIO_MIN or pr > PRUNE_RATIO_MAX:
        _eprint(
            f"[prune_gaussians] ERRO: --prune-ratio={pr} fora de "
            f"[{PRUNE_RATIO_MIN}, {PRUNE_RATIO_MAX}]. Restricao #8 do P07."
        )
        return 1

    t_start = time.perf_counter()

    # ─── Carregar PLY ─────────────────────────────────────────────────────
    try:
        vertex_data, fields = load_3dgs_ply(args.ply)
    except Exception as exc:  # noqa: BLE001
        _eprint(f"[prune_gaussians] ERRO ao ler PLY: {exc}")
        return 3
    input_count = int(vertex_data.shape[0])
    input_size_bytes = args.ply.stat().st_size
    input_size_mb = round(input_size_bytes / (1024 * 1024), 2)
    _log(f"[prune_gaussians] PLY entrada: {args.ply} | gaussianas={input_count} | {input_size_mb} MB")

    if pr <= 0.0:
        _log("[prune_gaussians] prune-ratio=0: nada a podar. Copiando schema.")
    # ─── Parse COLMAP ─────────────────────────────────────────────────────
    try:
        cameras = read_cameras_bin(cameras_bin)
        images = read_images_bin(images_bin)
    except Exception as exc:  # noqa: BLE001
        _eprint(f"[prune_gaussians] ERRO ao ler COLMAP sparse: {exc}")
        return 3
    if not cameras:
        _eprint("[prune_gaussians] ERRO: cameras.bin sem cameras (reconstrucao invalida)")
        return 3
    if not images:
        _eprint("[prune_gaussians] ERRO: images.bin sem registros (reconstrucao invalida)")
        return 3
    _log(f"[prune_gaussians] COLMAP: {len(cameras)} cameras / {len(images)} views")

    # ─── Significancia global ─────────────────────────────────────────────
    sample = args.view_sample if args.view_sample > 0 else None
    t_sig0 = time.perf_counter()
    try:
        significance, sig_stats = compute_significance(
            vertex_data, images, cameras, sample_size=sample
        )
    except Exception as exc:  # noqa: BLE001
        _eprint(f"[prune_gaussians] ERRO no calculo de significancia: {exc}")
        return 3
    significance_seconds = round(time.perf_counter() - t_sig0, 2)
    _log(
        f"[prune_gaussians] significancia: {significance_seconds}s | "
        f"views_used={sig_stats['views_used']} | "
        f"zero_count={sig_stats['zero_count_gaussians']}"
    )

    # ─── Pruning ──────────────────────────────────────────────────────────
    t_prune0 = time.perf_counter()
    pruned_data, kept = prune_by_significance(vertex_data, significance, pr)
    pruning_seconds = round(time.perf_counter() - t_prune0, 2)
    _log(
        f"[prune_gaussians] prune ratio={pr}: {input_count} -> {kept} "
        f"({pruning_seconds}s)"
    )

    if kept == 0 or kept >= input_count and pr > 0.0:
        _eprint(
            f"[prune_gaussians] ERRO: pruning produziu {kept} gaussianas (esperado <{input_count})"
        )
        return 3

    # ─── Quantizacao opcional ─────────────────────────────────────────────
    quantize_applied = False
    quantize_clusters = 0
    if args.quantize:
        try:
            # Mutar uma copia para nao tocar no buffer original
            pruned_data = pruned_data.copy()
            scale_cols = [c for c in ("scale_0", "scale_1", "scale_2") if c in fields]
            rot_cols = [c for c in ("rot_0", "rot_1", "rot_2", "rot_3") if c in fields]
            n1 = quantize_columns(pruned_data, scale_cols, k=args.quantize_k)
            n2 = quantize_columns(pruned_data, rot_cols, k=args.quantize_k)
            quantize_clusters = max(n1, n2)
            quantize_applied = quantize_clusters > 0
            _log(f"[prune_gaussians] quantizacao: k_efetivo={quantize_clusters}")
        except Exception as exc:  # noqa: BLE001
            _eprint(f"[prune_gaussians] AVISO: quantizacao falhou ({exc}); seguindo sem quantizar.")
            quantize_applied = False

    # ─── Escrita do PLY ───────────────────────────────────────────────────
    try:
        save_3dgs_ply(args.output, pruned_data)
    except Exception as exc:  # noqa: BLE001
        _eprint(f"[prune_gaussians] ERRO ao gravar PLY: {exc}")
        return 3

    output_size_bytes = args.output.stat().st_size
    output_size_mb = round(output_size_bytes / (1024 * 1024), 2)

    # ─── Validacao pos-pruning (restricao #5) ─────────────────────────────
    if output_size_bytes >= input_size_bytes and pr > 0.0:
        _eprint(
            f"[prune_gaussians] AVISO: PLY de saida ({output_size_mb} MB) >= "
            f"PLY de entrada ({input_size_mb} MB). Verifique --prune-ratio."
        )

    elapsed_total = round(time.perf_counter() - t_start, 2)
    reduction = round(1.0 - (kept / max(input_count, 1)), 4)
    ply_reduction = round(1.0 - (output_size_bytes / max(input_size_bytes, 1)), 4)

    report = {
        "input_ply": str(args.ply),
        "output_ply": str(args.output),
        "input_gaussians": input_count,
        "output_gaussians": kept,
        "reduction_ratio": reduction,
        "input_ply_mb": input_size_mb,
        "output_ply_mb": output_size_mb,
        "ply_reduction": ply_reduction,
        "prune_ratio_requested": pr,
        "quantize_applied": quantize_applied,
        "quantize_clusters": quantize_clusters,
        "significance_seconds": significance_seconds,
        "pruning_seconds": pruning_seconds,
        "total_seconds": elapsed_total,
        "views_used": sig_stats["views_used"],
        "views_total": len(images),
        "view_sample_size": sample if sample is not None else len(images),
        "significance_stats": sig_stats,
    }
    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
        _log(f"[prune_gaussians] relatorio: {args.report}")

    _log(
        f"[prune_gaussians] OK | gaussianas={input_count}->{kept} "
        f"({reduction*100:.1f}% removidas) | "
        f"ply={input_size_mb}->{output_size_mb} MB "
        f"({ply_reduction*100:.1f}% menor) | total={elapsed_total}s"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
