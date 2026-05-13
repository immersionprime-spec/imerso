#!/usr/bin/env python3
"""run_mipsplatting.py - Wrapper do trainer Mip-Splatting (P06).

Le sparse/0 + images/ produzidos por COLMAP/GLOMAP (compativeis com o
formato padrao do Inria 3DGS) e executa o train.py oficial do repo
autonomousvision/mip-splatting. Exporta point_cloud.ply ao fim do
treinamento (formato 3DGS padrao com SH degree 0 por default, mantendo
compatibilidade com create-ksplat.js que usa sphericalHarmonicsLevel=0).

Uso (chamado pelo run-pipeline.ps1, ETAPA 3):

  python run_mipsplatting.py \
      --source-path <colmap_ws/> \
      --model-path  <output/<tour>/mipsplatting/> \
      --iterations  30000 \
      --resolution  1600 \
      --kernel-size 0.1 \
      --sh-degree   0 \
      --report      mipsplatting_report.json

Requisitos (founder instala manualmente; ver README seccao 'Trainers 3DGS'):
- Repo clonado em ./mip-splatting (ou MIPSPLATTING_REPO env var).
- PyTorch 2.x + CUDA + diff-gaussian-rasterization compilado.

Exit codes:
  0  ok
  1  argumento/source-path invalido
  2  repo Mip-Splatting nao encontrado (founder precisa clonar)
  3  train.py falhou em runtime (CUDA OOM, build do rasterizador, etc.)
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional


DEFAULT_REPO_NAME = "mip-splatting"
ENV_REPO_VAR = "MIPSPLATTING_REPO"


def _eprint(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _log(msg: str) -> None:
    print(msg, flush=True)


def find_repo(script_dir: Path, override: Optional[Path]) -> Optional[Path]:
    """Resolve o caminho do repositorio Mip-Splatting.

    Ordem de preferencia:
      1. --repo (CLI override)
      2. variavel de ambiente MIPSPLATTING_REPO
      3. ./mip-splatting ao lado deste script
    """
    if override is not None:
        if (override / "train.py").is_file():
            return override
        return None

    env_path = os.environ.get(ENV_REPO_VAR)
    if env_path:
        p = Path(env_path).expanduser()
        if (p / "train.py").is_file():
            return p

    p = script_dir / DEFAULT_REPO_NAME
    if (p / "train.py").is_file():
        return p
    return None


def validate_source_path(source_path: Path) -> None:
    """Verifica a estrutura esperada (sparse/0 + images/)."""
    if not source_path.is_dir():
        raise FileNotFoundError(f"--source-path nao existe: {source_path}")

    required_files = [
        Path("sparse") / "0" / "cameras.bin",
        Path("sparse") / "0" / "images.bin",
        Path("sparse") / "0" / "points3D.bin",
    ]
    for rel in required_files:
        full = source_path / rel
        if not full.is_file():
            raise FileNotFoundError(
                f"Esperado em source-path: {rel} (procurado em {full})"
            )

    images_dir = source_path / "images"
    if not images_dir.is_dir():
        raise FileNotFoundError(
            f"Esperado em source-path: images/ (procurado em {images_dir})"
        )


def validate_ply(ply_path: Path) -> dict:
    """Le o .ply final e valida os campos 3DGS padrao.

    Returns dict com chaves:
      ok            : bool
      reason        : str (se !ok)
      num_gaussians : int
      has_sh_rest   : bool   (True quando f_rest_* existem; warning)
      sh_rest_count : int
      fields        : sorted list (debug)
    """
    if not ply_path.is_file():
        return {"ok": False, "reason": f".ply nao existe: {ply_path}"}

    try:
        from plyfile import PlyData  # type: ignore
    except ImportError:
        return {
            "ok": False,
            "reason": "plyfile nao instalado; instale via 'pip install plyfile'",
        }

    try:
        ply = PlyData.read(str(ply_path))
    except Exception as exc:
        return {"ok": False, "reason": f"falha ao ler .ply ({type(exc).__name__}): {exc}"}

    element_names = {el.name for el in ply.elements}
    if "vertex" not in element_names:
        return {"ok": False, "reason": "elemento 'vertex' ausente no .ply"}

    vertex = ply["vertex"]
    dtype_names = vertex.data.dtype.names or ()
    fields = set(dtype_names)

    required = {
        "x", "y", "z",
        "scale_0", "scale_1", "scale_2",
        "rot_0", "rot_1", "rot_2", "rot_3",
        "f_dc_0", "f_dc_1", "f_dc_2",
        "opacity",
    }
    missing = required - fields
    if missing:
        return {
            "ok": False,
            "reason": f"campos 3DGS obrigatorios ausentes: {sorted(missing)}",
            "fields": sorted(fields),
        }

    rest_fields = sorted(f for f in fields if f.startswith("f_rest_"))
    return {
        "ok": True,
        "num_gaussians": int(len(vertex.data)),
        "has_sh_rest": len(rest_fields) > 0,
        "sh_rest_count": len(rest_fields),
        "fields": sorted(fields),
    }


def has_torch_cuda() -> Optional[bool]:
    """Retorna True/False se conseguir importar torch e checar CUDA; None se torch ausente."""
    try:
        import torch  # type: ignore
    except ImportError:
        return None
    try:
        return bool(torch.cuda.is_available())
    except Exception:
        return None


def locate_final_ply(model_path: Path, iterations: int) -> Optional[Path]:
    """Localiza o .ply final exportado pelo trainer.

    Estrutura esperada do Mip-Splatting / Inria 3DGS:
      <model_path>/point_cloud/iteration_<N>/point_cloud.ply
    """
    primary = model_path / "point_cloud" / f"iteration_{iterations}" / "point_cloud.ply"
    if primary.is_file():
        return primary

    candidates = sorted(model_path.glob("point_cloud/iteration_*/point_cloud.ply"))
    if not candidates:
        return None

    def _iter_num(p: Path) -> int:
        name = p.parent.name  # iteration_<N>
        try:
            return int(name.split("_", 1)[1])
        except (IndexError, ValueError):
            return -1

    candidates.sort(key=_iter_num)
    return candidates[-1]


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Wrapper do trainer Mip-Splatting (P06)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--source-path", required=True, type=Path,
                    help="Diretorio com sparse/0/ + images/ (saida do COLMAP/GLOMAP).")
    ap.add_argument("--model-path", required=True, type=Path,
                    help="Diretorio de saida do trainer (recebe point_cloud/iteration_*/).")
    ap.add_argument("--iterations", type=int, default=30000,
                    help="Numero total de iteracoes de training.")
    ap.add_argument("--resolution", type=int, default=1600,
                    help="Resolucao maxima de imagem usada no treino (downscale automatico).")
    ap.add_argument("--kernel-size", type=float, default=0.1,
                    help="Tamanho do filtro 3D Mip (smoothing). Default do paper: 0.1.")
    ap.add_argument("--sh-degree", type=int, default=0,
                    help="Grau de SH. 0 = somente DC (compativel com create-ksplat.js atual).")
    ap.add_argument("--repo", type=Path, default=None,
                    help=f"Caminho do repo Mip-Splatting (override de {ENV_REPO_VAR} e do default).")
    ap.add_argument("--python-exe", type=str, default=None,
                    help="Python que executa train.py (default: sys.executable).")
    ap.add_argument("--report", type=Path, default=None,
                    help="Caminho do JSON de relatorio (sera criado).")
    ap.add_argument("--dry-run", action="store_true",
                    help="So imprime o comando e sai (nao executa train.py).")
    args = ap.parse_args()

    script_dir = Path(__file__).resolve().parent

    # 1) Localizar repo
    repo = find_repo(script_dir, args.repo)
    if repo is None:
        _eprint(
            "[run_mipsplatting] ERRO: repositorio Mip-Splatting nao encontrado.\n"
            f"Tentei (em ordem): --repo, env {ENV_REPO_VAR}, ./{DEFAULT_REPO_NAME} ao lado deste script.\n"
            "Clone com:\n"
            "  git clone --recursive https://github.com/autonomousvision/mip-splatting.git "
            f"{script_dir / DEFAULT_REPO_NAME}\n"
            "Ou defina a variavel de ambiente MIPSPLATTING_REPO apontando para o repo."
        )
        return 2

    train_py = repo / "train.py"
    _log(f"[run_mipsplatting] repo: {repo}")
    _log(f"[run_mipsplatting] train.py: {train_py}")

    # 2) Validar source-path
    try:
        validate_source_path(args.source_path)
    except FileNotFoundError as exc:
        _eprint(f"[run_mipsplatting] ERRO: estrutura source invalida: {exc}")
        return 1

    # 3) CUDA disponivel?
    cuda_state = has_torch_cuda()
    if cuda_state is False:
        _eprint(
            "[run_mipsplatting] AVISO: torch.cuda.is_available() == False.\n"
            "Mip-Splatting REQUER GPU NVIDIA com CUDA. O treino vai falhar logo no inicio.\n"
            "Verifique drivers/instalacao do PyTorch CUDA antes de prosseguir."
        )
    elif cuda_state is None:
        _eprint(
            "[run_mipsplatting] AVISO: nao foi possivel importar torch (pulei check CUDA).\n"
            "Confira o venv do Mip-Splatting (.venv-mip)."
        )

    # 4) Preparar model-path
    args.model_path.mkdir(parents=True, exist_ok=True)

    # 5) Avisos sobre SH degree > 0
    if args.sh_degree != 0:
        _eprint(
            f"[run_mipsplatting] AVISO: --sh-degree={args.sh_degree} (esperado 0).\n"
            "O pipeline atual chama create-ksplat.js com sphericalHarmonicsLevel=0;\n"
            "f_rest_* serao ignorados, mas o .ply vai pesar 3-15x mais e ocupar VRAM extra."
        )

    # 6) Montar comando para train.py
    python_exe = args.python_exe or sys.executable
    cmd = [
        python_exe, str(train_py),
        "-s", str(args.source_path),
        "-m", str(args.model_path),
        "--iterations", str(args.iterations),
        "--resolution", str(args.resolution),
        "--kernel_size", f"{args.kernel_size:g}",
        "--sh_degree", str(args.sh_degree),
        "--checkpoint_iterations", str(args.iterations),
    ]
    _log(f"[run_mipsplatting] cwd: {repo}")
    _log("[run_mipsplatting] cmd: " + " ".join(cmd))

    if args.dry_run:
        _log("[run_mipsplatting] dry-run; encerrando antes de executar.")
        return 0

    # 7) Executar
    t0 = time.perf_counter()
    try:
        result = subprocess.run(cmd, cwd=str(repo), check=False)
    except FileNotFoundError as exc:
        _eprint(f"[run_mipsplatting] ERRO ao executar train.py: {exc}")
        return 3
    elapsed = time.perf_counter() - t0

    if result.returncode != 0:
        _eprint(
            f"[run_mipsplatting] ERRO: train.py exit {result.returncode} apos "
            f"{elapsed:.1f}s. Verifique log do trainer."
        )
        return 3

    # 8) Localizar .ply final
    final_ply = locate_final_ply(args.model_path, args.iterations)
    if final_ply is None:
        _eprint(
            f"[run_mipsplatting] ERRO: .ply final nao encontrado em "
            f"{args.model_path}/point_cloud/iteration_*/point_cloud.ply"
        )
        return 3

    # 9) Validar .ply
    validation = validate_ply(final_ply)
    if not validation.get("ok"):
        _eprint(
            f"[run_mipsplatting] AVISO: validacao do .ply falhou ({validation.get('reason')}).\n"
            "create-ksplat.js pode rejeitar este arquivo."
        )
    if validation.get("has_sh_rest"):
        _eprint(
            f"[run_mipsplatting] AVISO: .ply contem f_rest_* ({validation.get('sh_rest_count')} campos).\n"
            "create-ksplat.js (sphericalHarmonicsLevel=0) ignora, mas o .ply vai estar inchado.\n"
            "Confira se --sh-degree foi 0 ou rode um strip de SH antes da compressao."
        )

    ply_size_mb = round(final_ply.stat().st_size / (1024 * 1024), 2)
    report = {
        "trainer": "mipsplatting",
        "iterations": int(args.iterations),
        "training_seconds": round(elapsed, 2),
        "ply_path": str(final_ply),
        "ply_size_mb": ply_size_mb,
        "num_gaussians": int(validation.get("num_gaussians", -1)),
        "resolution_used": int(args.resolution),
        "kernel_size": float(args.kernel_size),
        "sh_degree": int(args.sh_degree),
        "validation_ok": bool(validation.get("ok", False)),
        "has_sh_rest": bool(validation.get("has_sh_rest", False)),
        "sh_rest_count": int(validation.get("sh_rest_count", 0)),
        "repo_used": str(repo),
        "cuda_available": cuda_state,
    }

    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
        _log(f"[run_mipsplatting] relatorio: {args.report}")

    _log(
        f"[run_mipsplatting] OK | treino={elapsed:.1f}s | "
        f"gaussianas={report['num_gaussians']} | "
        f"ply={ply_size_mb} MB | sh_degree={args.sh_degree}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
