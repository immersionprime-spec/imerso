# AI Pipeline Advisor — Como usar

## O que faz

Orquestrador inteligente que usa a API do Claude para analisar cada etapa do
pipeline e ajustar parâmetros automaticamente para maximizar qualidade.

### Fluxo de uma execução

```
você chama ai_pipeline_advisor.py
  └─ ITERAÇÃO 1
      ├─ executa run-pipeline.ps1
      ├─ [pós-SfM] Claude avalia: registration ratio, frames, loop closure
      │    └─ se ruim: sugere novos params → re-tenta
      ├─ [pós-treino] Claude avalia: gaussianos, tamanho .ply/.ksplat, mobile readiness
      │    └─ se ruim e --auto-retry: ajusta params → ITERAÇÃO 2
      └─ [aprovado] entrega o melhor resultado
```

---

## Setup (uma vez)

```powershell
# Instalar SDK do Anthropic:
pip install anthropic

# Verificar instalação:
python -c "import anthropic; print('OK')"
```

---

## Como obter a API Key

1. Acesse https://console.anthropic.com
2. Menu lateral → **API Keys** → **Create Key**
3. Copie a key (começa com `sk-ant-api03-...`)
4. Guarde — não aparece novamente

---

## Uso básico

### Tour simples com análise (sem retry automático)

```powershell
python scripts\local-gs\ai_pipeline_advisor.py `
    --video "C:\caminho\video.mp4" `
    --api-key "sk-ant-api03-SUA_KEY_AQUI" `
    --steps 60000
```

O advisor vai rodar o pipeline, analisar e dar diagnóstico e recomendação.
Você decide se quer re-rodar com os params sugeridos.

---

### Com retry automático (recomendado)

```powershell
python scripts\local-gs\ai_pipeline_advisor.py `
    --video "C:\caminho\video.mp4" `
    --api-key "sk-ant-api03-SUA_KEY_AQUI" `
    --steps 60000 `
    --auto-retry `
    --max-iterations 2
```

Se a qualidade for baixa (score < 7/10), o advisor ajusta os params e tenta de novo.
Máximo 2 iterações (economiza tempo). Recomendado para tours importantes.

---

### Com tour-id (faz upload ao final se aprovado)

```powershell
python scripts\local-gs\ai_pipeline_advisor.py `
    --video "C:\caminho\video.mp4" `
    --api-key "sk-ant-api03-SUA_KEY_AQUI" `
    --tour-id "abc123" `
    --steps 60000 `
    --auto-retry
```

---

### Usando variável de ambiente (mais seguro, evita key no histórico do terminal)

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-api03-SUA_KEY_AQUI"
python scripts\local-gs\ai_pipeline_advisor.py --video "..." --steps 60000 --auto-retry
```

---

### GoPro vertical

```powershell
python scripts\local-gs\ai_pipeline_advisor.py `
    --video "C:\caminho\video.mp4" `
    --api-key "sk-ant-api03-..." `
    --steps 60000 `
    --transpose cw `
    --auto-retry
```

---

## O que o Claude analisa

### Checkpoint 1 — Pós-SfM (antes de iniciar o treino)

Evita gastar 20-40min treinando sobre poses ruins.

Claude verifica:
- `registration_ratio` → % de frames com pose calculada
- `total_frames` → se há frames suficientes
- `loop_closure_report` → se o loop foi fechado
- `pipeline.log` → erros e warnings

Se ruim, sugere: `FrameMinSharpness` menor, `FrameTargetCount` maior,
`UseHloc=true` (features neurais), `SkipFrameSelection=true`, etc.

### Checkpoint 2 — Pós-treino (resultado final)

Claude verifica:
- Número de gaussianos no `.ply`
- Tamanho do `.ksplat` para mobile
- Se cabe em 4G brasileiro
- Relação entre ply_mb e ksplat_mb

Se ruim, sugere: mais steps, retry com `ForceColmapMapper`, etc.

---

## Output do advisor

```
====================================================================
  RELATÓRIO DO ADVISOR
====================================================================
  Iterações executadas: 2
  Melhor score: 8/10
  Aprovado para upload: SIM ✅
  Output final: output\20260511_143022_iter2
  PLY:    output\20260511_143022_iter2\splat\scene.ply
  KSPLAT: output\20260511_143022_iter2\splat\scene.ksplat
  Histórico AI: output\20260511_143022_iter2\ai_advisor_history.json
====================================================================
```

O arquivo `ai_advisor_history.json` guarda o raciocínio completo do Claude
em cada iteração — útil para entender o que foi ajustado e por quê.

---

## Custo estimado da API

Cada chamada ao Claude usa ~2000 tokens de input + ~500 output.
Custo por análise: ~US$ 0,003 (menos de R$ 0,02).
Por tour (2 checkpoints × até 3 iterações = 6 chamadas): ~US$ 0,02.

---

## Parâmetros completos

```
--video           Caminho do vídeo MP4
--photos          Pasta de fotos (alternativo ao vídeo)
--api-key         Anthropic API key
--steps           TotalSteps do Brush (default: 60000)
--frame-count     FrameTargetCount (default: 200)
--min-sharpness   FrameMinSharpness (default: 80.0)
--output-dir      Pasta de saída (auto se vazio)
--tour-id         TourId para upload ao sistema
--transpose       Rotação: none, cw, ccw, flip (default: none)
--force-colmap    Força COLMAP em vez de GLOMAP
--skip-frame-selection  Pula filtro de blur/pHash
--skip-upload     Não faz upload mesmo com --tour-id
--max-iterations  Máx de tentativas (default: 3)
--auto-retry      Re-executa automaticamente se qualidade baixa
```

---

## Fix imediato para tours quebrados

Se seus tours estão ruins após as últimas mudanças, rode diretamente
o pipeline com parâmetros seguros (sem usar o advisor):

```powershell
.\scripts\local-gs\run-pipeline.ps1 `
    -VideoPath "C:\caminho\video.mp4" `
    -TotalSteps 60000 `
    -SkipFrameSelection `
    -ForceColmapMapper
```

Isso usa: 60k steps + sem filtro de frames + COLMAP automatic_reconstructor
(o mesmo que produzia tours bons antes das mudanças).
