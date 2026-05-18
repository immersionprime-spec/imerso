"""
ai_pipeline_advisor.py — Orquestrador inteligente do pipeline 3DGS com Claude API.

Roda o pipeline completo (SfM + treino) e pede ao Claude para avaliar o resultado.
Com --auto-retry, ajusta parametros e repete ate max-iterations se qualidade baixa.

Uso:
  # Defina a key como variavel de ambiente (mais seguro — nao aparece em logs):
  $env:ANTHROPIC_API_KEY = "sk-ant-api03-SUA_KEY"
  python ai_pipeline_advisor.py --video "C:\\caminho\\video.mp4" --steps 60000 --force-colmap

  # Ou passe via flag (key aparece no log — evitar):
  python ai_pipeline_advisor.py --video "..." --api-key "sk-ant-..." --steps 60000

Dependencias:
  pip install anthropic
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

try:
    import anthropic
except ImportError:
    print("ERRO: pip install anthropic")
    sys.exit(1)

CLAUDE_MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS   = 2000
PIPELINE_PS1 = Path(__file__).parent / "run-pipeline.ps1"

SYSTEM_PROMPT = """\
Voce e um especialista em pipelines de 3D Gaussian Splatting do projeto Imerso
(tours virtuais de imoveis residenciais brasileiros).

CONTEXTO:
- Input: video GoPro HERO11 de interiores residenciais (30s a 5min)
- SfM: COLMAP 3.11.1 ou GLOMAP
- Trainer: Brush 0.3.0 (30k-90k steps)
- Output: .ksplat para browser mobile / iPhone 4G brasileiro

THRESHOLDS:
  registration_ratio < 0.70  -> RUIM (poses invalidas, treino vai gerar caos visual)
  registration_ratio 0.70-0.85 -> ACEITAVEL
  registration_ratio > 0.85  -> BOM / > 0.95 -> EXCELENTE
  loop_closure ratio > 15    -> LOOP NAO FECHADO (drift grave)
  loop_closure ratio < 5     -> LOOP FECHADO (excelente)
  forward_angle > 30 graus   -> ALERTA de orientacao
  total_frames < 60          -> INSUFICIENTE
  total_frames 60-150        -> OK para apto pequeno
  total_frames > 200         -> IDEAL
  n_gaussians < 200k         -> sub-treinado
  n_gaussians 400k-900k      -> normal
  ksplat_mb > 20             -> PESADO para mobile
  ksplat_mb 5-15             -> IDEAL

PARAMETROS TUNAVEIS:
  TotalSteps: 20000-40000 (base: 30000; HARD CAP 40000 — acima disso, sem ganho)
  FrameTargetCount: 100-350
  FrameMinSharpness: 30.0-150.0
  SkipFrameSelection: true/false
  ForceColmapMapper: true/false (HARDCODED true no advisor; só desative com --no-force-colmap em testes A/B)
  UseHloc: true/false (features neurais, melhor para paredes lisas, +20min)

CAUSA MAIS COMUM DE TOUR RUIM:
  Loop closure nao fechado (operador nao voltou ao ponto inicial).
  Quando ratio > 15, o problema e de captura — nao de parametros de pipeline.
  Neste caso, recomende refazer o video fechando o loop fisicamente.

RESPONDA APENAS COM JSON VALIDO. SEM TEXTO FORA DO JSON.
"""

POST_TRAINING_PROMPT = """\
Avalie o resultado final do tour 3DGS e decida se esta pronto para upload.

DADOS ITERACAO {iteration}:
{data}

REGRAS DE RETRY:
- NUNCA sugira TotalSteps > 40000 (hard cap do projeto, sem ganho acima)
- Se n_gaussians < 100k apos > 30k steps: o problema e SfM, nao steps; sugira refazer captura
- Se sparse fragmentou (mapping_report.largest_component_selected=true): sugira refazer captura

JSON de resposta (sem texto extra):
{{
  "checkpoint": "post_training",
  "quality_score": <0-10>,
  "assessment": "<diagnostico PT-BR, max 2 frases>",
  "issues": ["<issue1>"],
  "approve_for_upload": <true/false>,
  "should_retry": <true/false>,
  "retry_params": {{"<Param>": <valor>}},
  "mobile_readiness": "<ok/warning/fail>",
  "recommendation": "<acao PT-BR, max 1 frase>"
}}
"""

def read_json_safe(path):
    try:
        p = Path(path)
        if p.exists() and p.stat().st_size > 0:
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}

def read_log_tail(path, n=40):
    try:
        p = Path(path)
        if p.exists():
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
            return "\n".join(lines[-n:])
    except Exception:
        pass
    return "(log indisponivel)"

def call_claude(client, prompt):
    try:
        msg = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except json.JSONDecodeError as e:
        print(f"  [AVISO] JSON invalido da API: {e}")
        return {"error": str(e)}
    except Exception as e:
        print(f"  [ERRO API Claude] {e}")
        return {"error": str(e)}

def build_args(params):
    args = []
    for k, v in params.items():
        if isinstance(v, bool):
            if v:
                args.append(f"-{k}")
        elif isinstance(v, (int, float)):
            args.extend([f"-{k}", str(v)])
        elif isinstance(v, str) and v:
            args.extend([f"-{k}", v])
    return args

def run_ps1(params):
    cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
           "-File", str(PIPELINE_PS1)]
    cmd += build_args(params)
    return subprocess.run(cmd, text=True).returncode

def collect_training(out_dir, iteration, params):
    out_dir = Path(out_dir)
    splat   = out_dir / "splat"
    ply_mb = ksplat_mb = n_gauss = 0

    ply = splat / "scene.ply"
    if ply.exists():
        ply_mb = round(ply.stat().st_size / 1_048_576, 1)
        try:
            with open(ply, "rb") as f:
                hdr = b""
                for _ in range(50):
                    ln = f.readline(); hdr += ln
                    if b"end_header" in ln: break
            for ln in hdr.decode("ascii", errors="ignore").splitlines():
                if ln.startswith("element vertex"):
                    n_gauss = int(ln.split()[-1]); break
        except Exception:
            pass

    ks = splat / "scene.ksplat"
    if ks.exists():
        ksplat_mb = round(ks.stat().st_size / 1_048_576, 1)

    return {
        "iteration": iteration,
        "params_used": params,
        "mapping_report":         read_json_safe(out_dir / "mapping_report.json"),
        "frame_selection_report": read_json_safe(out_dir / "frame_selection_report.json"),
        "loop_closure_report":    read_json_safe(out_dir / "loop_closure_report.json"),
        "pipeline_log_tail":      read_log_tail(out_dir / "pipeline.log"),
        "training_results": {
            "ply_mb": ply_mb,
            "ksplat_mb": ksplat_mb,
            "n_gaussians": n_gauss,
        },
    }

def print_eval(label, ev):
    score = ev.get("quality_score", "?")
    print(f"\n  +-- {label} | Score {score}/10")
    if "mobile_readiness" in ev:
        print(f"  |   Mobile: {ev['mobile_readiness']}")
    print(f"  |   {ev.get('assessment', ev.get('error', ''))}")
    for i in ev.get("issues", []):
        print(f"  |   ! {i}")
    print(f"  +-- {ev.get('recommendation', '')}")

def run_advisor(args):
    max_iters = args.max_iterations
    api_key   = args.api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERRO: use --api-key ou defina ANTHROPIC_API_KEY")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    params = {
        "TotalSteps":        args.steps,
        "FrameTargetCount":  args.frame_count,
        "FrameMinSharpness": args.min_sharpness,
        "ForceColmapMapper": args.force_colmap,
        "SkipUpload":        True,
    }
    if args.video:                  params["VideoPath"]          = args.video
    if args.photos:                 params["PhotosPath"]         = args.photos
    if args.transpose != "none":    params["Transpose"]          = args.transpose
    if args.skip_frame_selection:   params["SkipFrameSelection"] = True
    if args.output_dir:             params["OutputDir"]          = args.output_dir
    if args.max_image_size > 0:     params["MaxImageSize"]       = args.max_image_size
    # Repassa MaxFrames para o PS1 quando SkipFrameSelection ativo
    # (sem isso o PS1 usa o default hardcoded de 350)
    params["MaxFrames"] = args.frame_count

    history    = []
    best_dir   = None
    best_score = -1
    approved   = False

    for iteration in range(1, max_iters + 1):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_dir = Path(params.get("OutputDir") or f"output/{ts}_iter{iteration}")
        params["OutputDir"] = str(out_dir)

        skip_display = ("OutputDir","VideoPath","PhotosPath","TourId","ApiBaseUrl")
        print(f"\n{'#'*60}")
        print(f"#  ITERACAO {iteration} / {max_iters}")
        print(f"{'#'*60}")
        print(f"  Params: { {k:v for k,v in params.items() if k not in skip_display} }")

        rc = run_ps1(params)
        if rc != 0:
            print(f"\n  [!] Pipeline falhou (exit {rc}).")
            break
        best_dir = out_dir

        print("\n  [AI] Consultando Claude sobre resultado...")
        tr_eval = call_claude(client, POST_TRAINING_PROMPT.format(
            iteration=iteration,
            data=json.dumps(collect_training(out_dir, iteration, params.copy()),
                            indent=2, ensure_ascii=False)
        ))
        score = tr_eval.get("quality_score", 0)
        print_eval(f"RESULTADO iter {iteration}", tr_eval)
        history.append({"iteration": iteration, "eval": tr_eval, "params": params.copy()})

        if score > best_score:
            best_score = score

        if tr_eval.get("approve_for_upload"):
            approved = True
            print(f"\n  OK APROVADO! Score {score}/10")
            break

        if tr_eval.get("should_retry") and args.auto_retry and iteration < max_iters:
            rp = tr_eval.get("retry_params", {})
            print(f"\n  [AI] Ajustando params: {rp}")
            params.update(rp)
            params.pop("OutputDir", None)
        else:
            print(f"\n  [AI] Score {score}/10. Encerrando.")
            break

    print(f"\n{'='*60}")
    print(f"  RELATORIO FINAL")
    print(f"  Score: {best_score}/10 | Aprovado: {'SIM' if approved else 'NAO'}")
    if best_dir:
        print(f"  PLY:    {Path(best_dir) / 'splat' / 'scene.ply'}")
        print(f"  KSPLAT: {Path(best_dir) / 'splat' / 'scene.ksplat'}")
        hp = Path(best_dir) / "ai_advisor_history.json"
        try:
            hp.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"  Log AI: {hp}")
        except Exception:
            pass
    print(f"{'='*60}\n")
    sys.exit(0 if (approved or best_score >= 5) else 2)

def main():
    p = argparse.ArgumentParser(description="AI Advisor — pipeline 3DGS Imerso")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--video",  help="Video MP4")
    src.add_argument("--photos", help="Pasta de fotos")
    p.add_argument("--api-key",              default="",    help="Anthropic API key (prefira ANTHROPIC_API_KEY env var)")
    p.add_argument("--steps",                type=int,   default=30000,
                   help="DEFAULT 30000. Acima de 40000 e clamped (Brush 0.3.0 nao ganha qualidade alem disso).")
    p.add_argument("--frame-count",          type=int,   default=500)
    p.add_argument("--min-sharpness",        type=float, default=80.0)
    p.add_argument("--output-dir",           default="")
    p.add_argument("--transpose",            default="none")
    p.add_argument("--force-colmap",         action="store_true", default=True,
                   help="DEFAULT True. Use --no-force-colmap apenas para A/B testing.")
    p.add_argument("--no-force-colmap",      dest="force_colmap", action="store_false",
                   help="Desativa o force-colmap (NÃO recomendado).")
    p.add_argument("--skip-frame-selection", action="store_true")
    p.add_argument("--max-iterations",       type=int, default=3)
    p.add_argument("--auto-retry",           action="store_true")
    p.add_argument("--max-image-size",       type=int, default=0, help="Resolucao maxima para COLMAP (0 = sem limite)")
    run_advisor(p.parse_args())

if __name__ == "__main__":
    main()
