"""
batch_advisor.py — Processa multiplos videos pelo AI Advisor e elege o melhor.

Fluxo:
  1. Lista todos os .MP4 na pasta informada
  2. Para cada video: roda SfM -> Claude avalia -> se aprovado treina -> Claude avalia
  3. Coleta scores de todos os videos
  4. Claude compara todos os resultados e elege o melhor tour
  5. Copia o melhor .ksplat para a pasta de output raiz

Uso:
  python batch_advisor.py ^
      --folder "C:\\Users\\pc\\Desktop\\Projetos\\imerso\\teste\\velha" ^
      --api-key "sk-ant-api03-..." ^
      --steps 60000 ^
      --force-colmap ^
      --skip-frame-selection

Flags uteis:
  --steps 30000          Mais rapido para comparacao rapida (sacrifica um pouco de qualidade)
  --skip-sfm-rejects     Pula treino de videos com SfM ruim (economiza tempo)
  --max-videos N         Processa apenas os primeiros N videos (para teste)

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
ADVISOR_PY   = Path(__file__).parent / "ai_pipeline_advisor.py"

def read_json_safe(path):
    """Le JSON com seguranca — retorna {} se arquivo ausente, vazio ou invalido."""
    try:
        p = Path(path)
        if p.exists() and p.stat().st_size > 0:
            return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}

RANKING_PROMPT = """\
Voce e um especialista em 3D Gaussian Splatting para tours virtuais de imoveis.

Abaixo estao os resultados de {n} videos processados pelo pipeline Imerso.
Cada entrada contem o nome do video, score de qualidade, dados de SfM e resultado do treino.

RESULTADOS:
{data}

Analise todos os resultados e eleja o MELHOR tour para uso em producao.

Criterios de julgamento (em ordem de prioridade):
  1. Qualidade do SfM (registration_ratio alto, loop closure fechado, sem fragmentacao)
  2. Score geral de qualidade (quality_score do post_training)
  3. Tamanho adequado para mobile (ksplat_mb entre 3-15 MB)
  4. Numero de gaussianos (mais e geralmente melhor, ate certo limite)
  5. Se nenhum foi aprovado, escolha o menos ruim

Responda com JSON exatamente neste formato (sem texto fora do JSON):
{{
  "winner": "<nome_do_arquivo.MP4>",
  "winner_score": <quality_score do vencedor>,
  "winner_output_dir": "<output_dir do vencedor>",
  "winner_ksplat": "<caminho completo do .ksplat do vencedor>",
  "ranking": [
    {{"video": "<arquivo.MP4>", "score": <score>, "reason": "<motivo em PT-BR>"}},
    ...
  ],
  "assessment": "<analise geral dos 9 videos em PT-BR, max 3 frases>",
  "recommendation": "<o que fazer para melhorar os proximos videos, max 2 frases>"
}}
"""


def run_advisor(video_path: Path, output_dir: Path, args) -> dict:
    """Roda o ai_pipeline_advisor.py para um video. Retorna resumo do resultado."""
    cmd = [sys.executable, str(ADVISOR_PY),
        "--video", str(video_path),
        "--output-dir", str(output_dir),
        "--steps", str(args.steps),
        "--frame-count", str(args.frame_count),
        "--min-sharpness", str(args.min_sharpness),
        "--max-iterations", "1",
    ]
    if args.api_key:              cmd += ["--api-key", args.api_key]
    if args.force_colmap:         cmd.append("--force-colmap")
    if args.skip_frame_selection: cmd.append("--skip-frame-selection")
    if args.max_image_size > 0:   cmd += ["--max-image-size", str(args.max_image_size)]
    # --skip-upload removido do advisor (upload nunca ocorre no batch)

    print(f"\n  Executando: {' '.join(cmd[-6:])}")  # mostra so os ultimos args
    result = subprocess.run(cmd, text=True)

    # Ler historico gerado pelo advisor
    history_path = output_dir / "ai_advisor_history.json"
    history = []
    if history_path.exists():
        try:
            history = json.loads(history_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Extrair scores do historico
    sfm_eval      = next((h["eval"] for h in history if h["checkpoint"] == "post_sfm"),      {})
    training_eval = next((h["eval"] for h in history if h["checkpoint"] == "post_training"), {})

    ksplat_path = output_dir / "splat" / "scene.ksplat"
    ply_path    = output_dir / "splat" / "scene.ply"

    return {
        "video":          video_path.name,
        "output_dir":     str(output_dir),
        "pipeline_ok":    result.returncode in (0, 2),  # 2 = rodou mas score < 5
        "sfm_score":      sfm_eval.get("quality_score", 0),
        "sfm_approved":   sfm_eval.get("proceed_to_training", False),
        "sfm_assessment": sfm_eval.get("assessment", ""),
        "sfm_issues":     sfm_eval.get("issues", []),
        "final_score":    training_eval.get("quality_score", 0),
        "approved":       training_eval.get("approve_for_upload", False),
        "mobile":         training_eval.get("mobile_readiness", "?"),
        "assessment":     training_eval.get("assessment", ""),
        "ksplat_path":    str(ksplat_path) if ksplat_path.exists() else None,
        "ksplat_mb":      round(ksplat_path.stat().st_size / 1_048_576, 1) if ksplat_path.exists() else 0,
        "ply_mb":         round(ply_path.stat().st_size    / 1_048_576, 1) if ply_path.exists()    else 0,
        "mapping_report": read_json_safe(output_dir / "mapping_report.json"),
        "loop_closure":    read_json_safe(output_dir / "loop_closure_report.json"),
    }


def elect_winner(client, results: list) -> dict:
    """Pede ao Claude para comparar todos os resultados e eleger o melhor."""
    prompt = RANKING_PROMPT.format(
        n=len(results),
        data=json.dumps(results, indent=2, ensure_ascii=False)
    )
    try:
        msg = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"  [ERRO na eleicao do vencedor] {e}")
        # Fallback: elege por score mais alto
        best = max(results, key=lambda r: r.get("final_score", 0))
        return {
            "winner": best["video"],
            "winner_score": best.get("final_score", 0),
            "winner_output_dir": best["output_dir"],
            "winner_ksplat": best.get("ksplat_path"),
            "ranking": [],
            "assessment": "Eleicao automatica por score (API indisponivel).",
            "recommendation": ""
        }


def run_batch(args):
    api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERRO: use --api-key ou defina ANTHROPIC_API_KEY")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # Listar videos
    folder = Path(args.folder)
    videos = sorted(folder.glob("*.MP4")) + sorted(folder.glob("*.mp4"))
    videos = list(dict.fromkeys(videos))  # dedup mantendo ordem

    if args.max_videos:
        videos = videos[:args.max_videos]

    if not videos:
        print(f"Nenhum .MP4 encontrado em: {folder}")
        sys.exit(1)

    # Pasta de saida do batch
    ts        = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_dir = Path(args.output_root) / f"batch_{ts}"
    batch_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  BATCH ADVISOR — {len(videos)} videos")
    print(f"  Pasta: {folder}")
    print(f"  Output: {batch_dir}")
    print(f"  Steps: {args.steps:,} | ForceColmap: {args.force_colmap}")
    print(f"{'='*60}")

    results      = []
    skipped_sfm  = 0

    for idx, video in enumerate(videos, 1):
        print(f"\n{'~'*60}")
        print(f"  VIDEO {idx}/{len(videos)}: {video.name}")
        print(f"{'~'*60}")

        out_dir = batch_dir / video.stem
        out_dir.mkdir(parents=True, exist_ok=True)

        result = run_advisor(video, out_dir, args)
        results.append(result)

        # Linha de resumo imediato
        sfm_ok = "OK" if result["sfm_approved"] else "RUIM"
        trained = "treinado" if result["ply_mb"] > 0 else "pulado"
        print(f"\n  >> {video.name}: SfM={sfm_ok} | Final score={result['final_score']}/10 | {trained} | ksplat={result['ksplat_mb']} MB")

        if not result["sfm_approved"]:
            skipped_sfm += 1

        # Salva resultado parcial (util se o batch for interrompido)
        partial = batch_dir / "results_partial.json"
        partial.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    # Eleicao do vencedor
    print(f"\n{'='*60}")
    print(f"  ELEICAO DO MELHOR TOUR")
    print(f"  Consultando Claude com {len(results)} resultados...")
    print(f"{'='*60}")

    election = elect_winner(client, results)

    # Imprime ranking
    print(f"\n  VENCEDOR: {election.get('winner')} (score {election.get('winner_score')}/10)")
    print(f"\n  RANKING:")
    for i, r in enumerate(election.get("ranking", []), 1):
        print(f"    {i}. {r.get('video')} — {r.get('score')}/10 — {r.get('reason','')}")

    print(f"\n  ANALISE GERAL:")
    print(f"  {election.get('assessment','')}")
    print(f"\n  RECOMENDACAO:")
    print(f"  {election.get('recommendation','')}")

    # Copia melhor .ksplat para raiz do batch
    winner_ksplat = election.get("winner_ksplat")
    if winner_ksplat and Path(winner_ksplat).exists():
        best_ksplat_dest = batch_dir / "MELHOR_TOUR.ksplat"
        import shutil
        shutil.copy2(winner_ksplat, best_ksplat_dest)
        print(f"\n  Melhor .ksplat copiado para:")
        print(f"  {best_ksplat_dest}")

    # Salva relatorio completo
    final_report = {
        "batch_timestamp": ts,
        "folder": str(folder),
        "total_videos": len(videos),
        "skipped_bad_sfm": skipped_sfm,
        "results": results,
        "election": election,
    }
    report_path = batch_dir / "batch_report.json"
    report_path.write_text(json.dumps(final_report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n  Relatorio completo: {report_path}")
    print(f"{'='*60}\n")


def main():
    p = argparse.ArgumentParser(description="Batch Advisor — processa multiplos videos e elege o melhor")
    p.add_argument("--folder",    required=True,  help="Pasta com os videos .MP4")
    p.add_argument("--api-key",   default="",     help="Anthropic API key")
    p.add_argument("--steps",     type=int,   default=60000, help="TotalSteps do Brush")
    p.add_argument("--frame-count", type=int, default=200)
    p.add_argument("--min-sharpness", type=float, default=80.0)
    p.add_argument("--output-root", default="output", help="Pasta raiz dos outputs")
    p.add_argument("--force-colmap",         action="store_true")
    p.add_argument("--skip-frame-selection", action="store_true")
    p.add_argument("--skip-upload",          action="store_true", default=True)
    p.add_argument("--max-image-size", type=int, default=2400, help="Resolucao maxima para COLMAP (default: 2400 — estabilidade GoPro HERO11)")
    p.add_argument("--max-videos", type=int, default=0, help="Limitar a N videos (0 = todos)")
    run_batch(p.parse_args())

if __name__ == "__main__":
    main()
