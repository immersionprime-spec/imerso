#!/usr/bin/env python3
"""
sam2_masking.py — Gera máscaras de objetos transientes para COLMAP (Grounded SAM2).

Usa Grounding DINO (texto) + SAM2.1 para segmentar pessoas, animais e telas.
Saída: PNG por frame no formato COLMAP: **preto (0) = sem features / ignorar**,
**branco (255) = manter** (conforme documentação COLMAP ImageReader.mask_path).

Nomes de ficheiro: para imagem `frame_00001.jpg` → máscara `frame_00001.jpg.png`
na pasta --output-dir.

TODO(founder): ativar SAM2 como default quando pipeline migrar para RunPod (item [9] do ROADMAP).
TODO(founder): calibrar box_threshold / text_threshold após vários tours reais.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

# --- COLMAP mask convention (official): black = no SIFT, white = extract ---


def _natural_sort_key(p: Path) -> tuple[int, str]:
    m = re.search(r"(\d+)", p.stem)
    n = int(m.group(1)) if m else 0
    return (n, p.name.lower())


def list_images(input_dir: Path) -> list[Path]:
    paths: list[Path] = []
    for ext in ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"):
        paths.extend(input_dir.glob(ext))
    unique: dict[str, Path] = {}
    for p in paths:
        unique[str(p.resolve())] = p
    return sorted(unique.values(), key=_natural_sort_key)


def default_sam2_yaml() -> Path | None:
    """Localiza configs/sam2.1/sam2.1_hiera_l.yaml dentro do pacote pip sam2."""
    try:
        import sam2  # type: ignore

        root = Path(sam2.__file__).resolve().parent
        cand = root / "configs" / "sam2.1" / "sam2.1_hiera_l.yaml"
        if cand.is_file():
            return cand
    except Exception:
        pass
    return None


def import_grounding_predict():
    try:
        from groundingdino.util.inference import load_image, load_model, predict  # type: ignore

        return load_model, load_image, predict
    except ImportError:
        pass
    try:
        from grounding_dino.groundingdino.util.inference import (  # type: ignore
            load_image,
            load_model,
            predict,
        )

        return load_model, load_image, predict
    except ImportError as e:
        raise ImportError(
            "Grounding DINO não importável. Instale: pip install -r requirements_sam2.txt"
        ) from e


def import_sam2_build():
    try:
        from sam2.build_sam import build_sam2  # type: ignore
        from sam2.sam2_image_predictor import SAM2ImagePredictor  # type: ignore

        return build_sam2, SAM2ImagePredictor
    except ImportError as e:
        raise ImportError(
            "SAM2 não importável. Instale: pip install git+https://github.com/facebookresearch/sam2.git"
        ) from e


def maybe_downscale(
    image_bgr: np.ndarray, max_long_edge: int
) -> tuple[np.ndarray, float]:
    """Retorna (imagem, escala) para re-escalar máscara depois."""
    h, w = image_bgr.shape[:2]
    longe = max(h, w)
    if longe <= max_long_edge:
        return image_bgr, 1.0
    scale = max_long_edge / float(longe)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    small = cv2.resize(image_bgr, (nw, nh), interpolation=cv2.INTER_AREA)
    return small, scale


def upscale_mask(mask_hw: np.ndarray, target_h: int, target_w: int) -> np.ndarray:
    return cv2.resize(
        mask_hw.astype(np.uint8),
        (target_w, target_h),
        interpolation=cv2.INTER_NEAREST,
    )


def union_masks(masks: np.ndarray) -> np.ndarray:
    """masks: (n,H,W) bool or float — união booleana."""
    if masks.size == 0:
        return np.zeros((0, 0), dtype=bool)
    m = np.any(masks.astype(bool), axis=0)
    return m


def transient_to_colmap_mask(union_bool: np.ndarray, h: int, w: int) -> np.ndarray:
    """União de transientes (True) → COLMAP preto (0); fundo False → branco (255)."""
    out = np.full((h, w), 255, dtype=np.uint8)
    out[union_bool] = 0
    return out


def _boxes_nonempty(boxes) -> bool:
    if boxes is None:
        return False
    if hasattr(boxes, "numel"):
        return int(boxes.numel()) > 0
    return len(boxes) > 0


def process_one_frame(
    image_bgr: np.ndarray,
    text_prompt: str,
    box_threshold: float,
    text_threshold: float,
    grounding_model,
    sam2_predictor,
    device: str,
    max_long_edge: int,
    load_image,
    predict,
) -> tuple[np.ndarray, bool, float]:
    """
    Retorna (máscara COLMAP uint8 HxW, teve_objeto?, cobertura_transiente 0..1).
    """
    import torch
    from torchvision.ops import box_convert  # type: ignore

    h0, w0 = image_bgr.shape[:2]
    small, scale = maybe_downscale(image_bgr, max_long_edge)

    fd, tmp_path = tempfile.mkstemp(suffix=".jpg", prefix="sam2_")
    os.close(fd)
    try:
        cv2.imwrite(tmp_path, small)
        image_source, image_tensor = load_image(tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    boxes, confidences, labels = predict(
        model=grounding_model,
        image=image_tensor,
        caption=text_prompt,
        box_threshold=box_threshold,
        text_threshold=text_threshold,
        device=device,
    )

    if not _boxes_nonempty(boxes):
        colmap = np.full((h0, w0), 255, dtype=np.uint8)
        return colmap, False, 0.0

    h, w = image_source.shape[:2]
    boxes = boxes * torch.Tensor([w, h, w, h], device=boxes.device)
    input_boxes = box_convert(boxes=boxes, in_fmt="cxcywh", out_fmt="xyxy").cpu().numpy()

    sam2_predictor.set_image(image_source)

    ctx = (
        torch.autocast(device_type="cuda", dtype=torch.bfloat16)
        if device == "cuda"
        else contextlib.nullcontext()
    )
    with ctx:
        masks, scores, _ = sam2_predictor.predict(
            point_coords=None,
            point_labels=None,
            box=input_boxes,
            multimask_output=False,
        )

    if masks.ndim == 4:
        masks = masks.squeeze(1)
    if masks.ndim == 2:
        masks = masks[np.newaxis, ...]

    union_s = union_masks(masks)
    if scale < 1.0:
        union_full = upscale_mask(union_s.astype(np.uint8), h0, w0) > 0
    else:
        union_full = union_s

    colmap = transient_to_colmap_mask(union_full, h0, w0)
    coverage = float(np.mean(union_full))
    return colmap, True, coverage


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Gera máscaras PNG (COLMAP) com Grounding DINO + SAM2."
    )
    ap.add_argument("--input-dir", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, required=True)
    ap.add_argument("--checkpoint", type=Path, required=True, help="sam2.1_hiera_large.pt")
    ap.add_argument(
        "--sam2-model-config",
        type=Path,
        default=None,
        help="YAML SAM2 (default: dentro do pacote pip sam2).",
    )
    ap.add_argument("--grounding-dino-config", type=Path, required=True)
    ap.add_argument("--grounding-dino-weights", type=Path, required=True)
    ap.add_argument(
        "--prompts",
        type=str,
        default="person. dog. cat. tv screen. monitor screen.",
        help="Texto Grounding DINO (minúsculas, termina com ponto por classe).",
    )
    ap.add_argument("--confidence-threshold", type=float, default=0.35)
    ap.add_argument("--text-threshold", type=float, default=0.25)
    ap.add_argument("--report", type=Path, required=True)
    ap.add_argument("--max-long-edge", type=int, default=1024, help="Downscale OOM guard.")
    args = ap.parse_args()

    if not args.checkpoint.is_file():
        print(f"ERRO: checkpoint SAM2 inexistente: {args.checkpoint}", file=sys.stderr)
        return 1
    if not args.grounding_dino_weights.is_file():
        print(f"ERRO: pesos Grounding DINO inexistentes: {args.grounding_dino_weights}", file=sys.stderr)
        return 1
    if not args.grounding_dino_config.is_file():
        print(f"ERRO: config Grounding DINO inexistente: {args.grounding_dino_config}", file=sys.stderr)
        return 1

    cfg_path = args.sam2_model_config
    if cfg_path is None:
        d = default_sam2_yaml()
        cfg_path = d
    if cfg_path is None or not cfg_path.is_file():
        print(
            "ERRO: --sam2-model-config não definido e YAML embutido do pacote sam2 não encontrado.",
            file=sys.stderr,
        )
        return 1

    try:
        import torch

        load_model, load_image, predict = import_grounding_predict()
        build_sam2, SAM2ImagePredictor = import_sam2_build()
    except ImportError as e:
        print(str(e), file=sys.stderr)
        return 1

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print(
            "AVISO: CUDA indisponível — SAM2/Grounding DINO em CPU será muito lento.",
            file=sys.stderr,
        )

    images = list_images(args.input_dir)
    if not images:
        print("ERRO: nenhuma imagem em --input-dir.", file=sys.stderr)
        return 1

    args.output_dir.mkdir(parents=True, exist_ok=True)

    print("Carregando Grounding DINO...", flush=True)
    grounding_model = load_model(
        model_config_path=str(args.grounding_dino_config),
        model_checkpoint_path=str(args.grounding_dino_weights),
        device=device,
    )

    print("Carregando SAM2...", flush=True)
    sam2_model = build_sam2(str(cfg_path), str(args.checkpoint), device=device)
    sam2_predictor = SAM2ImagePredictor(sam2_model)

    text_prompt = args.prompts.strip().lower()
    if not text_prompt.endswith("."):
        text_prompt = text_prompt + "."

    frames_with_objects = 0
    coverages: list[float] = []
    total = len(images)

    for i, img_path in enumerate(images):
        if i % 10 == 0:
            print(f"{i + 1}/{total}  {img_path.name}", flush=True)

        image_bgr = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
        if image_bgr is None:
            print(f"AVISO: não leu {img_path}, máscara branca.", file=sys.stderr)
            h, w = 1080, 1920
            mask = np.full((h, w), 255, dtype=np.uint8)
        else:
            try:
                mask, has_obj, cov = process_one_frame(
                    image_bgr,
                    text_prompt,
                    args.confidence_threshold,
                    args.text_threshold,
                    grounding_model,
                    sam2_predictor,
                    device,
                    args.max_long_edge,
                    load_image,
                    predict,
                )
                if has_obj:
                    frames_with_objects += 1
                    coverages.append(cov)
            except torch.cuda.OutOfMemoryError:
                print("OOM — a tentar metade da resolução...", file=sys.stderr)
                mask, has_obj, cov = process_one_frame(
                    image_bgr,
                    text_prompt,
                    args.confidence_threshold,
                    args.text_threshold,
                    grounding_model,
                    sam2_predictor,
                    device,
                    max(512, args.max_long_edge // 2),
                    load_image,
                    predict,
                )
                if has_obj:
                    frames_with_objects += 1
                    coverages.append(cov)
            except Exception as e:
                print(f"AVISO frame {img_path.name}: {e} — máscara branca.", file=sys.stderr)
                h, w = image_bgr.shape[:2]
                mask = np.full((h, w), 255, dtype=np.uint8)

        out_name = img_path.name + ".png"
        out_path = args.output_dir / out_name
        cv2.imwrite(str(out_path), mask)

    avg_cov = float(np.mean(coverages)) if coverages else 0.0
    report = {
        "total_frames": total,
        "frames_with_objects": frames_with_objects,
        "avg_mask_coverage": round(avg_cov, 6),
        "confidence_threshold": args.confidence_threshold,
        "text_threshold": args.text_threshold,
        "text_prompt": text_prompt,
        "device": device,
        "notes": (
            "COLMAP: pixel 0 = região ignorada na extração de features; 255 = manter. "
            "Estátuas/manequins podem ser mascarados por engano (aceitar ou desativar SAM2)."
        ),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        f"OK: {total} máscaras em {args.output_dir} | com objetos: {frames_with_objects} | "
        f"cobertura média (transiente): {avg_cov * 100:.2f}%",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
