# Pipeline local de Gaussian Splatting (PoC)

Ferramenta de **prova de conceito** no PC do desenvolvedor (Windows + GPU NVIDIA). Não faz parte do código de produção do Imerso nem de API.

## Protocolo de Captura — Loop Closure

Para obter os melhores resultados de SfM e **reduzir drift** (paredes “tortas” ou rasgos no SuperSplat), feche o loop ao capturar:

1. **Ponto inicial**: pare no **umbral da porta principal**, virado para o **interior** do imóvel. Estabilize a GoPro por **2 segundos** antes de iniciar a gravação.
2. **Percurso**: percorra todos os cômodos seguindo **um só sentido** (horário ou anti-horário). Não desfaça o caminho.
3. **Cômodos isolados** (banheiro, closet, despensa): entre e saia pelo **mesmo umbral**, sem desvios desnecessários.
4. **Ponto final**: **retorne ao ponto inicial**. Posicione a GoPro na **mesma altura** e **mesma orientação** do primeiro frame. Permaneça **parado 3 segundos** com a câmera estática.
5. **Encerre a gravação** somente após esses 3 segundos parados.

### Exemplo de trajetória correta (apartamento)

```
   [Entrada]──────►[Sala]──────►[Cozinha]
       ▲                              │
       │                              ▼
   [Quarto 2]◄───[Corredor]◄───[Quarto 1]
       │
       ▼
   [Banheiro]  ← entra e sai pelo mesmo umbral
```

### Trajetória errada (drift provável)

```
   [Entrada]──►[Sala]──►[Cozinha]──►[Quarto]
   ↑ não voltou ao ponto inicial — drift visível em paredes
```

### Validação automática (P02)

Após o COLMAP, o script `loop_closure_validator.py` lê `colmap_ws/sparse/0/images.bin` e grava `loop_closure_report.json` na pasta de saída. Se `status == "warning"`, **considere refazer** a captura com o protocolo acima. O pipeline **não** é bloqueado: apenas avisos (`Write-Warning`).

---

## O que faz

Fluxo principal:

1. **ffmpeg + seleção de frames (P01)** — no modo padrão, extrai JPG a **5 fps** para `frames_raw/`, depois `frame_selector.py` (nitidez Laplaciano + pHash + cobertura temporal) grava o subconjunto em `frames/` e copia para `colmap_ws/images/`. Com **`-SkipFrameSelection`**, mantém o baseline antigo (FPS automático 0,5–2 no vídeo; fotos direto no COLMAP).
2. **SfM (features + mapper)** — duas fases combinaveis:
   - **Fase A — features + matching**: por padrão, **COLMAP SIFT** (`feature_extractor` + `sequential_matcher`, GPU). Com **`-UseHloc`** (P05), `hloc_features.py` extrai **SuperPoint** + faz matching com **LightGlue** e popula o `database.db` em formato COLMAP. Se hloc falhar (dep ausente, sem CUDA, exit ≠ 0), fallback automático para COLMAP SIFT.
   - **Fase B — mapper**: quando `glomap` está no PATH (P04, padrão), usa **`glomap mapper`** (global SfM). Se `glomap` não estiver instalado, **ou** `-ForceColmapMapper`, **ou** GLOMAP falhar / `registration_ratio < 0.70`, fallback automático para `colmap mapper`. Quando nenhuma flag (`-UseHloc`/`-UseGlomap`/`-EnableSamMasking`) está ativa, o pipeline usa o atalho `automatic_reconstructor --data_type video` (faz features + matcher + mapper em uma só chamada).
   Detalhes em "SfM: GLOMAP (preferred) com fallback COLMAP" e "SfM: Features clássicas vs neurais" mais abaixo.
3. **Validação de loop closure (P02)** — `loop_closure_validator.py` (só **numpy**; parser nativo de `images.bin`). Roda entre COLMAP e Brush; se `python` ou `numpy` faltarem, o passo é ignorado sem falhar o pipeline.
4. **Trainer 3DGS** — por padrão, **Brush 0.3.0** (`brush_app`) treina Gaussian Splatting e exporta `.ply`. Com **`-Trainer mipsplatting`** (P06), o passo é delegado a `run_mipsplatting.py` (trainer oficial do autonomousvision/mip-splatting), que produz um `point_cloud.ply` 3DGS-padrão (SH=0) compatível com `create-ksplat.js`. Mip-Splatting reduz aliasing em rendering multi-escala (mobile vs desktop). Sem fallback automático: em caso de falha do Mip, relance com `-Trainer brush`. Detalhes em "Trainers 3DGS (Brush vs Mip-Splatting, P06)".
5. **LightGaussian Pruning (opcional, P07)** — quando `-EnablePruning` é passado, `prune_gaussians.py` lê `splat/scene.ply` + `colmap_ws/sparse/0/`, calcula significância global por gaussiana (projetando o centro em cada câmera; peso = `opacity * volume_proxy * view_count`), remove as menos significativas e grava `splat/scene_pruned.ply`. A ETAPA 4 (`create-ksplat.js`) passa a consumir o `.ply` pruned, produzindo `.ksplat` típicamente **50–70 % menor**. Em qualquer erro (python/dep ausente, COLMAP corrompido, exit ≠ 0) o pipeline **mantém o `.ply` original** automaticamente. Detalhes em "Compressão: LightGaussian Pruning (P07)".

Dependências Python:

- **Passo 1 (P01)** — `pip install -r scripts\local-gs\requirements_frame_selector.txt` (modo padrão, sem `-SkipFrameSelection`).
- **Passo 2 (P03, opcional)** — `pip install -r scripts\local-gs\requirements_sam2.txt` + pesos em `scripts/local-gs/models/` (ver secção SAM2 abaixo).
- **Passo 3 (P02)** — `pip install numpy` (validação de loop closure; opcional).
- **Passo 4 (P05, opcional)** — `pip install -r scripts\local-gs\requirements_hloc.txt` (preferencialmente em **venv separado** `.venv-hloc`, requer CUDA; ver seção "SfM: Features clássicas vs neurais (hloc)" abaixo).
- **Passo 5 (P06, opcional)** — `pip install -r scripts\local-gs\requirements_mipsplatting.txt` + repo clonado em `scripts/local-gs/mip-splatting/` + rasterizador CUDA compilado (ver seção "Trainers 3DGS (Brush vs Mip-Splatting)").
- **Passo 6 (P07, opcional)** — `pip install -r scripts\local-gs\requirements_lightgaussian.txt` (apenas `numpy` + `plyfile`; `scikit-learn` só se usar `-EnableQuantization`). CPU-friendly, sem CUDA.

Se o `frame_selector.py` falhar (exit diferente de zero, dependência ausente, ou menos de 20 frames após filtro com entrada ≥ 20), o pipeline **registra aviso** e copia `frames_raw` → `frames` antes de alimentar o COLMAP.

Resultado típico: `output/<timestamp>/splat/scene.ply` (cópia do último `export_<iter>.ply` gerado pelo Brush).

## Pré-requisitos

Instalados **globalmente** e disponíveis no `PATH` do PowerShell:

| Ferramenta              | Obrigatório            | Como validar (PowerShell)                                  |
| ----------------------- | :--------------------: | ---------------------------------------------------------- |
| ffmpeg                  | sim                    | `ffmpeg -version`                                          |
| colmap                  | sim                    | `colmap -h`                                                |
| brush_app               | sim para `-Trainer brush` (default) | `Get-Command brush_app`                       |
| glomap (P04)            | não                    | `glomap --help`                                            |
| hloc + PyTorch CUDA (P05) | não                  | `python scripts\local-gs\hloc_features.py --help` no venv  |
| Mip-Splatting + PyTorch CUDA (P06) | sim para `-Trainer mipsplatting` | `python scripts\local-gs\run_mipsplatting.py --help` no venv `.venv-mip` |
| numpy + plyfile (P07/P08) | sim para `-EnablePruning` ou `-EnableReorder`/`-GenerateLiteKsplat` | `pip install -r scripts\local-gs\requirements_lightgaussian.txt` |
| scikit-learn (P07)      | só com `-EnableQuantization` | mesmo arquivo `requirements_lightgaussian.txt` (ou omita e não use quantize) |

Versões usadas na especificação: ffmpeg 8.x, COLMAP 4.1 CUDA, Brush 0.3.0 (`brush_app.exe`). Para GLOMAP, ver seção “SfM: GLOMAP (preferred) com fallback COLMAP”. Para hloc, ver "SfM: Features clássicas vs neurais (hloc)" e `requirements_hloc.txt`. Para Mip-Splatting, ver "Trainers 3DGS (Brush vs Mip-Splatting, P06)" e `requirements_mipsplatting.txt`. Para LightGaussian Pruning, reorder/lite P08, ver "Compressão: LightGaussian Pruning (P07)" e `requirements_lightgaussian.txt`. Se nenhuma dessas opções estiver disponível, o pipeline usa Brush + COLMAP exatamente como antes — todos os P04/P05/P06/P07/P08 são **opt-in** por flag.

## Como usar

Na raiz do repositório Imerso:

```powershell
cd C:\Users\pc\Desktop\Projetos\imerso
npm run gs:local -- -VideoPath "C:\caminho\para\video.mp4"
```

Parâmetros opcionais do script:

- `-OutputDir` — pasta de saída (default: `.\output\<yyyyMMdd_HHmmss>` na **pasta atual** do processo; ao usar `npm run`, costuma ser a raiz do projeto).
- `-FrameRate` — só com **`-SkipFrameSelection`**: FPS de extração manual; com `0`, calcula a partir de `-MaxFrames` e da duração do vídeo (entre 0,5 e 2 fps).
- `-MaxFrames` — só com **`-SkipFrameSelection`**: teto usado para calcular o FPS automático no vídeo (default `350`).
- `-TotalSteps` — passos do Brush (default `20000` no script).
- `-Quality` — qualidade COLMAP: `low` | `medium` | `high` | `extreme` (default `medium`).
- `-Transpose` — `none` | `cw` | `ccw` | `flip` (GoPro vertical costuma ser `cw`).
- **`-SkipFrameSelection`** — desliga extração 5 fps + Python; reproduz o comportamento **baseline** antigo (útil para comparar qualidade/tempo ou contornar falha do seletor).
- **`-LoopClosureStrict`** — repassa `--strict` ao `loop_closure_validator.py` (processo Python termina com código 1 se `status == warning`). O pipeline **continua** até o fim; use para CI ou scripts que leem `$LASTEXITCODE` só do Python.
- **`-EnableSamMasking`** — após copiar imagens para COLMAP, tenta gerar máscaras com `sam2_masking.py` (Grounding DINO + SAM2.1). Se `python`, modelos ou o script falharem, o pipeline **continua sem máscaras** (aviso no log).
- **`-SamConfidence`** (double, default `0.35`) — limiar de confiança passado ao `sam2_masking.py` quando SAM2 está ativo.
- **`-FrameTargetCount`** (int, default `300`) — alvo de frames após filtros (vídeo). O **cap real de saída** é `ceil(target * 1.25)` (~375), para impedir explosão pelo gap-fill.
- **`-FrameMinSharpness`** (double, default `35`) — variância mínima do Laplaciano. `35` cobre vídeo em movimento (GoPro andando). Para foto parada com tripé, use `80+`. O `frame_selector.py` faz **auto-tune** se >70% for descartado: recalcula o threshold como percentil-25 da distribuição real (floor em `15.0`).
- **`-FramePhashThreshold`** (int, default `6`) — distância de Hamming mínima entre pHashes consecutivos aceitos (menor = mais agressivo na deduplicação).
- **`-AbortOnLowRegistration`** (switch) — se o COLMAP registrar **menos que `-LowRegistrationThreshold`** (default `0.50` = 50%) dos frames, **aborta antes do Brush** com exit code `2`. Útil para evitar gastar 15+ min de GPU em cena já condenada. Sem essa flag, o pipeline só emite warning e segue.
- **`-LowRegistrationThreshold`** (double, default `0.50`) — usado pelo `-AbortOnLowRegistration`. Faixa típica: `0.40`–`0.70`.
- **`-MaxImageSize`** (int, default `0` = sem resize) — **anti-VRAM-overflow**. Quando `> 0`, redimensiona as imagens em `colmap_ws/images/` (in-place via ffmpeg) limitando o lado maior antes do COLMAP. Para GoPro vertical 5312×2988 + GPU com ≤ 8 GB VRAM, recomenda-se `-MaxImageSize 2400`. O Brush 3DGS treina com a mesma resolução; 2400 px ainda gera splat de altíssima qualidade. Se a primeira imagem detectada tiver lado maior > `4000 px` e a flag não estiver setada, o pipeline emite warning recomendando o valor.
- **`-ForceCpuMatcher`** (switch) — força pipeline manual (`feature_extractor` + `sequential_matcher` + `mapper`) com `--SiftMatching.use_gpu 0`. Indicado quando o `automatic_reconstructor` ou o matcher GPU crashar com `STATUS_STACK_BUFFER_OVERRUN` (`0xC0000409` / exit `-1073740791`) mesmo com `-MaxImageSize`. Mais estável, **5–10× mais lento** no matching. O extractor continua na GPU (rápido); só o matcher vai pra CPU.
- **`-ForceColmapMapper`** — bypass do GLOMAP. Mesmo que `glomap` esteja no PATH, força o pipeline a usar `automatic_reconstructor` (sem SAM2) ou `colmap mapper` (com SAM2). Útil para A/B testing GLOMAP vs COLMAP no mesmo vídeo, ou para fugir de regressões do GLOMAP em corredores longos simétricos (limitação documentada do paper).
- **`-UseHloc`** (P05) — substitui o feature extraction + matching do COLMAP por **SuperPoint + LightGlue** via `hloc_features.py`. Indicado para tours com paredes lisas, gesso, vidro, mármore (baixa textura) onde o SIFT clássico perde frames. Exige CUDA e Python venv com `requirements_hloc.txt`. Se hloc falhar (sem dep / sem GPU / exit ≠ 0), fallback automático para COLMAP SIFT.
- **`-HlocMaxImageSize`** (int, default `1600`) — lado maior máximo para resize antes do SuperPoint. Não aumente além disso — SuperPoint não ganha em 4K real.
- **`-HlocPairsPerImage`** (int, default `30`) — só usado para tours > 200 frames (modo `retrieval` via NetVLAD). Em tours menores, o script usa `exhaustive`.
- **`-HlocMaxKeypoints`** (int, default `4096`) — sweet spot para SuperPoint; não aumente em tours pequenos (gera ruído).
- **`-Trainer`** (P06, `brush` | `mipsplatting`, default `brush`) — escolhe o trainer 3DGS. `brush` mantém o pipeline atual (Brush 0.3.0). `mipsplatting` ativa o trainer alternativo com filtros 3D + 2D Mip (anti-aliasing); exige Python + CUDA + repo clonado (ver seção dedicada).
- **`-TrainerIterations`** (int, default `0` = padrão do trainer) — quando `> 0`, sobrescreve `-TotalSteps` no Brush **e** `--iterations` no Mip. Default zero preserva o comportamento atual (Brush usa `-TotalSteps`; Mip usa `30000`).
- **`-MipResolution`** (int, default `1600`) — lado maior usado no training do Mip-Splatting. Reduza para `1024` em GPUs com <16 GB se houver OOM (Plano B do P06).
- **`-EnablePruning`** (switch, P07) — após o trainer (passo `[3.7/5]`), roda `prune_gaussians.py` para remover gaussianas de baixa significância antes do `create-ksplat.js`. Em falha, mantém o `.ply` original automaticamente.
- **`-PruneRatio`** (double, default `0.6`, range `0..0.85`) — fração de gaussianas removidas. `0.5–0.7` é o sweet spot do paper LightGaussian; acima de `0.85` o `prune_gaussians.py` aborta por restrição #8 do P07.
- **`-EnableQuantization`** (switch, P07) — adiciona k-means (k=256) sobre `scale_*` e `rot_*` após o pruning. Default OFF — quantização dupla com `create-ksplat.js` pode degradar.
- **`-PruneViewSample`** (int, default `0` = usar todas as views) — Plano B do P07 para tours grandes (>500k gaussianas / >200 views): amostra esse número de views ao invés de iterar por todas.
- **`-EnableReorder`** (switch, P08) — após pruning (ou sozinho com pruning off), roda `reorder_ply.py` para ordenar gaussianas por `sigmoid(opacity) * exp(scale)` (mesma filosofia do P07) antes do `create-ksplat.js`, melhorando TTR com `progressiveLoad` no viewer.
- **`-GenerateLiteKsplat`** (switch, P08) — após `scene.ksplat` full, gera `scene_lite.ply` (~`LiteKsplatRatio` das primeiras linhas já reordenadas) + `scene.lite.ksplat`. Upload com `-TourId` envia ambos; finalize grava `splat_r2_key_lite` + `splat_size_bytes_lite`. Viewer público carrega lite primeiro (timeout 5s) e depois o full em background.
- **`-LiteKsplatRatio`** (double, default `0.30`) — fração de gaussianas mantidas no `.ply` lite antes do segundo `create-ksplat.js`.
- **`-GenerateYupPly`** (switch, P10) — após o trainer (passo `[4.6/5]`), roda `rotate_ply_yup.py` para gerar `splat/scene.yup.ply`, **paralelo** ao `scene.ply` original. Aplica `R_x(180°)` (positions: `y'=-y, z'=-z`; quaternions: `(w,x,y,z) → (-x, w, -z, y)`; SH `l≥1`: sign flip por coeficiente conforme Wigner-D em base real). Use o `.yup.ply` quando for abrir o splat em **SuperSplat / Blender / Unity / Polycam** — convenção Y-up (OpenGL). O `scene.ply` original continua Y-down (COLMAP/CV) para o viewer Imerso, que já compensa com `cameraUp=[0,-1,0]`. Custo: ~3–5 s para 300 k gaussianas; dobra o espaço em disco.

Exemplo:

```powershell
npm run gs:local -- -VideoPath "D:\capturas\imovel.mp4" -FrameRate 3 -TotalSteps 20000
```

### Receitas comuns

**GoPro vertical 4K (5312×2988) em RTX 5060 Ti 8 GB ou similar** — evita crash `STATUS_STACK_BUFFER_OVERRUN`:

```powershell
npm run gs:local -- `
  -VideoPath "C:\caminho\video.mp4" `
  -Transpose cw `
  -TotalSteps 20000 `
  -MaxImageSize 2400
```

**Mesmo cenário, último recurso se ainda crashar** (mais lento mas estável):

```powershell
npm run gs:local -- `
  -VideoPath "C:\caminho\video.mp4" `
  -Transpose cw `
  -TotalSteps 20000 `
  -MaxImageSize 2400 `
  -ForceCpuMatcher
```

**CI/automação que quer abortar cedo em casos perdidos:**

```powershell
npm run gs:local -- `
  -VideoPath "C:\caminho\video.mp4" `
  -AbortOnLowRegistration `
  -LowRegistrationThreshold 0.60
```

**Quero auditar o splat no SuperSplat (Y-up correto):**

```powershell
npm run gs:local -- `
  -VideoPath "C:\caminho\video.mp4" `
  -Transpose cw `
  -TotalSteps 20000 `
  -MaxImageSize 2400 `
  -GenerateYupPly
```

Saída adicional: `output/<timestamp>/splat/scene.yup.ply` — arraste em [https://superspl.at/editor](https://superspl.at/editor) e a cena já abre com o chão embaixo.

**Já rodei o pipeline sem `-GenerateYupPly`, posso gerar agora sem refazer tudo?** Sim. Direto no script Python:

```powershell
python scripts\local-gs\rotate_ply_yup.py `
  --input  "output\<timestamp>\splat\scene.ply" `
  --output "output\<timestamp>\splat\scene.yup.ply" `
  --report "output\<timestamp>\rotate_yup_report.json"
```

## Estrutura criada em `output/<timestamp>/`

| Pasta / arquivo   | Conteúdo |
| ----------------- | -------- |
| `frames_raw/`     | (Modo padrão) JPGs densos a 5 fps antes da seleção. Com `-SkipFrameSelection`, não é usada. |
| `frames/`         | (Modo padrão) Subconjunto escolhido por `frame_selector.py`. Com `-SkipFrameSelection`, JPGs do ffmpeg (vídeo) como no baseline. |
| `frame_selection_report.json` | (Modo padrão) Métricas da seleção — ver abaixo. |
| `loop_closure_report.json` | (Se `numpy` + `images.bin` disponíveis) Métricas P02 — `status`, `ratio`, `forward_angle_degrees`, `message`. |
| `mapping_report.json` | (P04/P05) Auditoria do passo de SfM — `features_used`, `mapper_used`, `mapping_seconds`, `registered_images`, `total_frames`, `registration_ratio`, `glomap_available`, `force_colmap_mapper`, `use_hloc`, `hloc_ok`, `sam_used`. |
| `masks/`          | (Opcional, P03) PNGs de máscara por frame (`frame_00001.jpg.png`, …) — convenção COLMAP: **0 = ignorar features**, **255 = extrair**. |
| `sam2_report.json` | (Opcional, P03) Resumo do passo SAM2 (`total_frames`, `frames_with_objects`, `avg_mask_coverage`, …). |
| `hloc/`           | (Opcional, P05) Cache do hloc — `feats-*.h5`, `matches-*.h5`, `pairs.txt`, e (se P03 ativo) `frames_masked/`. |
| `hloc_report.json` | (Opcional, P05) Resumo do passo hloc — `total_frames`, `features_per_image_median`, `matches_per_pair_median`, `pair_mode`, `extraction_seconds`, `matching_seconds`, `masks_applied`. |
| `colmap_ws/`      | Workspace COLMAP (`images/` + `sparse/0/` após SfM). |
| `splat/`          | Saída do trainer 3DGS — sempre contém `scene.ply` (consumido por `create-ksplat.js`). Com `-Trainer brush`, também guarda `export_*.ply` intermediários do Brush. Com `-EnablePruning` (P07), guarda também `scene_pruned.ply` — é esse que vira `scene.ksplat`. Com `-EnableReorder`/pruning (P08), pode existir `scene_reordered.ply` e `reorder_report.json`. Com `-GenerateLiteKsplat` (P08), também `scene_lite.ply` + `scene.lite.ksplat`. Com `-GenerateYupPly` (P10), inclui `scene.yup.ply` paralelo (Y-up para SuperSplat/Blender/Unity). |
| `mipsplatting/`   | (Opcional, P06) Workspace do trainer Mip-Splatting — `point_cloud/iteration_<N>/point_cloud.ply` + logs internos do `train.py`. |
| `mipsplatting_report.json` | (Opcional, P06) Auditoria do passo Mip — `trainer`, `iterations`, `training_seconds`, `ply_path`, `ply_size_mb`, `num_gaussians`, `resolution_used`, `kernel_size`, `sh_degree`, `validation_ok`, `has_sh_rest`, `cuda_available`. |
| `prune_report.json` | (Opcional, P07) Auditoria do pruning — `input_gaussians`, `output_gaussians`, `reduction_ratio`, `input_ply_mb`, `output_ply_mb`, `ply_reduction`, `prune_ratio_requested`, `quantize_applied`, `significance_seconds`, `pruning_seconds`, `views_used`, `significance_stats`. |
| `reorder_report.json` | (Opcional, P08) Estatísticas de `reorder_ply.py` — `total_gaussians`, `top_10pct_avg_importance`, `bottom_10pct_avg_importance`, `reorder_seconds`. |
| `rotate_yup_report.json` | (Opcional, P10) Estatísticas de `rotate_ply_yup.py` — `input_gaussians`, `output_gaussians`, `transform`, `quaternions_recomposed`, `sh_coefficients_total`, `sh_coefficients_flipped`, `duration_seconds`. |
| `pipeline.log`    | Log com timestamp de cada linha (stdout/stderr das ferramentas). |

### `frame_selection_report.json`

Gerado na raiz do `OutputDir` quando o seletor roda. Campos principais:

- `input_count` / `output_count` — antes e depois da seleção.
- `output_cap` — limite máximo (`ceil(target_count * output_cap_ratio)`, default `1.25 × target`).
- `discarded_blur` — removidos por baixa nitidez (Laplaciano).
- `discarded_redundant` — removidos por pHash semelhante ao último aceito (vídeo).
- `discarded_sampling` — removidos para respeitar `target_count`.
- `discarded_gap_reinjected` — quantos frames foram **reinseridos** para limitar buracos temporais (vídeo).
- `discarded_gap_rejected_by_floor` — reinjeções recusadas porque a janela inteira estava abaixo do floor de nitidez (`0.5 × working_min_sharpness`). Sinaliza trecho da captura inteiramente borrado.
- `discarded_by_output_cap` — quantos reinjetados foram **truncados** ao final para respeitar `output_cap` (os de menor nitidez saem primeiro; originais do uniform-sample são preservados).
- `auto_tuned_min_sharpness` — se `null`, default original foi mantido; se número, é o novo threshold (p25) aplicado depois do disparo do auto-tune.
- `working_min_sharpness` — threshold efetivamente usado (igual ao `min_sharpness` ou ao auto-tune).
- `min_sharpness_seen` / `max_sharpness_seen` / `median_sharpness_kept` — estatísticas de nitidez.
- `params` — eco dos parâmetros efetivos (inclui `output_cap_ratio`, `auto_tune_threshold`, `auto_tune_floor`, `gap_fill_floor_ratio`).
- `duration_seconds` — tempo de CPU do script.

**Interpretação:**
- `discarded_blur / input_count > 0,30` ⇒ aviso em stderr; captura com muito movimento ou luz fraca.
- `discarded_blur / input_count > 0,70` ⇒ auto-tune dispara e ajusta o threshold. Veja `auto_tuned_min_sharpness` no relatório para confirmar.
- `discarded_gap_rejected_by_floor > 0` ⇒ regiões da captura foram **completamente ignoradas** por estarem todas borradas — pode refletir em loop closure ruim depois.
- `discarded_by_output_cap > 0` ⇒ o gap-fill quis subir além do cap; relatório agora bloqueia. Se quiser mais frames, suba `-FrameTargetCount`.

### `mapping_report.json` (P04/P05, atualizado P09)

Campos novos: `low_registration_warning` (boolean — true se `< 70%` registrado) e `low_registration_threshold` (double — usado pelo `-AbortOnLowRegistration`).

### `loop_closure_report.json` (P02)

Campos principais: `status` (`excellent` | `ok` | `warning`), `ratio` (distância primeiro–último / mediana do passo entre vizinhos), `forward_angle_degrees`, `registered_images`, `first_frame`, `last_frame`, `message`.

Teste manual em um `sparse/0` já existente:

```powershell
pip install numpy
python scripts\local-gs\loop_closure_validator.py `
  --colmap-sparse "C:\caminho\output\20260101_120000\colmap_ws\sparse\0" `
  --report "C:\caminho\output\20260101_120000\loop_closure_report.json"
```

Opção `--strict`: o processo Python retorna código de saída `1` se `status == warning` (útil para automação que só consulta o exit code).

## Mascaramento de objetos móveis (SAM2, P03)

Objetivo: reduzir pontos 3D em **pessoas, animais ou telas** que se movem entre frames (fantasmas no splat). O passo **`[1.5/5]`** chama `sam2_masking.py` (Grounding DINO + SAM2.1) e grava PNGs em `masks/` com o mesmo basename que as imagens em `colmap_ws/images/` (ex.: `frame_00012.jpg` → `frame_00012.jpg.png`).

**Quando usar:** vídeos com pessoas/pets passando ou monitores refletindo. **Quando não usar:** cenas estáticas vazias (overhead GPU/tempo); se os pesos não estiverem instalados, o pipeline ignora SAM2 automaticamente.

**Instalação Python:**

```powershell
pip install -r scripts\local-gs\requirements_sam2.txt
```

**Modelos** (coloque em `scripts/local-gs/models/`, não versionados — veja `.gitignore`):

| Ficheiro | Origem (exemplo) |
| -------- | ----------------- |
| `sam2.1_hiera_large.pt` | [SAM2 releases / Meta](https://github.com/facebookresearch/sam2) — checkpoint **large** compatível com `sam2.1_hiera_l.yaml`. |
| `groundingdino_swint_ogc.py` | Copiar de `GroundingDINO/groundingdino/config/GroundingDINO_SwinT_OGC.py` (repo IDEA-Research/GroundingDINO) para `models/` com este nome, **ou** ajustar o caminho no `run-pipeline.ps1` se preferir symlink. |
| `groundingdino_swint_ogc.pth` | Pesos pré-treinados Swin-T OGC do mesmo repositório. |

Exemplo com `curl` (na pasta `scripts\local-gs\models`):

```powershell
cd scripts\local-gs\models
curl -L -o sam2.1_hiera_large.pt "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt"
curl -L -o groundingdino_swint_ogc.pth "https://github.com/IDEA-Research/GroundingDINO/releases/download/v0.1.0-alpha/groundingdino_swint_ogc.pth"
curl -L -o groundingdino_swint_ogc.py "https://raw.githubusercontent.com/IDEA-Research/GroundingDINO/main/groundingdino/config/GroundingDINO_SwinT_OGC.py"
```

**Execução do pipeline:**

```powershell
npm run gs:local -- -VideoPath "C:\capturas\imovel.mp4" -EnableSamMasking -SamConfidence 0.35
```

**Validação:** após uma corrida com SAM2 ativo, confira `masks/*.png` (deve haver pelo menos um PNG) e `sam2_report.json`. Se o passo Python falhar ou não houver PNGs, o log mostra aviso e o COLMAP corre **sem** `mask_path` (fluxo `automatic_reconstructor`).

Teste manual só do script:

```powershell
python scripts\local-gs\sam2_masking.py --help
```

## SfM: GLOMAP (preferred) com fallback COLMAP

O pipeline tenta usar **GLOMAP** (Global SfM, ETH Zurich 2024) sempre que o binário estiver disponível no `PATH`. GLOMAP otimiza todas as poses simultaneamente em vez de uma a uma como o COLMAP incremental — costuma ser ~3× mais rápido no benchmark ETH3D e reduzir o **drift global** em loops fechados (paredes “tortas” / rasgos visíveis no SuperSplat em apartamentos circulares).

Se `glomap` **não** estiver no PATH, **ou** se `-ForceColmapMapper` for passado, **ou** se o GLOMAP falhar / registrar < 70% dos frames, o pipeline cai automaticamente no fluxo COLMAP legacy. Nenhuma instalação extra é exigida para a operação básica.

### Instalação do GLOMAP (manual)

#### Windows

1. Baixar o binário Windows mais recente em **https://github.com/colmap/glomap/releases** (procure o `.zip` Windows x64).
2. Extrair para `C:\Program Files\GLOMAP\` (ou outra pasta de sua escolha).
3. Adicionar essa pasta ao **PATH do sistema**: *Painel de Controle → Sistema → Variáveis de Ambiente → Path → Adicionar*.
4. Abrir um novo PowerShell e validar:

```powershell
glomap --help
# deve listar comandos disponiveis (mapper, etc.)
```

#### Linux / RunPod (futuro)

```bash
apt update && apt install -y libceres-dev
git clone https://github.com/colmap/glomap.git
cd glomap && cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(nproc)
sudo cmake --install build
glomap --help
```

Em caso de falha de compilação no RunPod, alternativa é a imagem Docker oficial `ghcr.io/colmap/glomap:latest`.

### Como o pipeline decide o mapper

Logo no início do `run-pipeline.ps1`:

```text
if (-not $ForceColmapMapper) -and (glomap no PATH):
    feature_extractor (COLMAP)
    sequential_matcher (COLMAP)
    glomap mapper
    -> se exit != 0 OU sparse/0/images.bin ausente OU registration_ratio < 0.70
       fallback automatico: colmap mapper (incremental)
else:
    fluxo legacy (automatic_reconstructor OU mapper+masks quando SAM2 ativo)
```

O passo `feature_extractor` recebe `--ImageReader.mask_path` quando `-EnableSamMasking` produz máscaras válidas (P03) — **independente** do mapper escolhido. SAM2 e GLOMAP coexistem.

### Fallback automático

O GLOMAP é o autor declarado da fragilidade em **corredores longos simétricos** (limitação conhecida do paper). Quando isso acontece, o registration ratio costuma cair drasticamente e o pipeline reverte para o `colmap mapper` automaticamente — você verá no log:

```text
[2/5] Registration ratio < 70% (xx.x%). Fallback automatico para COLMAP mapper.
[2/5] (c') Fallback: COLMAP mapper (incremental)...
[2/5] (c') COLMAP mapper OK em yyy s | registrados: N/M
```

O `mapping_report.json` registra qual mapper foi efetivamente usado (`glomap`, `colmap_mapper_fallback`, `colmap_mapper_sam2` ou `colmap_automatic_reconstructor`).

### A/B testing manual

Rode o mesmo vídeo duas vezes, uma com GLOMAP e outra forçando COLMAP:

```powershell
# Comportamento padrao (GLOMAP se disponivel):
npm run gs:local -- -VideoPath "C:\capturas\imovel.mp4" -OutputDir ".\output\teste_glomap"

# Bypass GLOMAP (COLMAP legacy):
npm run gs:local -- -VideoPath "C:\capturas\imovel.mp4" -OutputDir ".\output\teste_colmap" -ForceColmapMapper
```

Depois compare `mapping_report.json` dos dois (campo `mapping_seconds`) e a qualidade visual do `scene.ply` no SuperSplat.

### Diferenças observadas (referência do paper + comunidade)

| Métrica | COLMAP incremental | GLOMAP |
|---|---|---|
| Tempo SfM | 100% (baseline) | 30–50% |
| Drift em loop fechado | 5–15 cm | 2–6 cm |
| Imóvel circular | rasgos visíveis | sem rasgo |
| Corredor longo simétrico | raro falhar | pode falhar (fallback) |

> Números são indicativos; calibre com seus tours reais.

## SfM: Features clássicas vs neurais (hloc, P05)

Por padrão a Fase A do `[2/5]` usa **COLMAP SIFT** (clássico, robusto, sempre disponível, CPU OK). Para tours com **paredes brancas, gesso, vidro, mármore, porcelanato** (baixa textura) o SIFT perde frames e o `registration_ratio` cai. Nesses casos, ative features neurais com `-UseHloc`:

```powershell
npm run gs:local -- -VideoPath "C:\capturas\imovel.mp4" -UseHloc
```

O passo `[2/5] (a+b)` é substituído pelo script `hloc_features.py` (SuperPoint + LightGlue, ETH Zurich / cvg), que popula o `database.db` no formato COLMAP padrão. Em seguida o mapper (GLOMAP se disponível, senão `colmap mapper`) consome esse database sem qualquer alteração — `-UseHloc` é compatível com `-UseGlomap` (default quando GLOMAP instalado) e com `-EnableSamMasking` (P03).

### Quando usar

- Tours com superfícies lisas (gesso, vidro, mármore, porcelanato).
- Tours noturnos ou de baixa iluminação.
- Tours onde COLMAP perde imagens (`registration_ratio` < 0.80 no `mapping_report.json` do baseline).

### Quando NÃO usar

- Tours com muita textura visível (madeira aparente, tijolos, plantas, papel de parede).
- Máquina sem CUDA (hloc + LightGlue em CPU é impraticável).
- Quando velocidade é prioridade absoluta (hloc adiciona 5–20 min em RTX 5060 Ti).

### Instalação (manual, **em venv separado**)

> O hloc + PyTorch ocupa ~3 GB e tem deps pesadas; vale isolar do venv do Brush.

```powershell
# 1. Criar venv dedicado:
python -m venv .venv-hloc
.venv-hloc\Scripts\activate

# 2. Instalar PyTorch CUDA. AJUSTE a versao do CUDA conforme seu driver:
#    https://pytorch.org/get-started/locally/
# Para GPUs NVIDIA Ada/Hopper (sm_80-sm_90): cu121 estavel basta.
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
# Para GPUs Blackwell (RTX 50xx, sm_120): cu121 NAO RODA kernels. Precisa nightly + cu128:
#   pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128

# 3. Instalar hloc + LightGlue + deps (em DUAS etapas pra evitar conflito de versao do LightGlue):
pip install numpy opencv-python h5py tqdm "pycolmap>=0.6.0"
pip install "git+https://github.com/cvg/Hierarchical-Localization.git"

# 4. CRITICO: clonar SuperGluePretrainedNetwork como submodule esperado pelo hloc.
#    Sem isso, o hloc.extractors.superpoint falha com "No module named 'SuperGluePretrainedNetwork'".
#    Esse repo tem licenca restrita (nao-comercial) - por isso nao vem como dep automatica.
$tp = ".venv-hloc\Lib\site-packages\third_party"
if (-not (Test-Path $tp)) { New-Item -ItemType Directory -Path $tp | Out-Null }
git clone --depth 1 https://github.com/magicleap/SuperGluePretrainedNetwork.git "$tp\SuperGluePretrainedNetwork"

# 5. Validar (deve imprimir keypoints + descriptors com shape > 0):
.\.venv-hloc\Scripts\python.exe -c "from hloc.extractors.superpoint import SuperPoint as SP; import torch; m = SP({'max_keypoints': 4096, 'name': 'superpoint', 'nms_radius': 3}).eval().to('cuda'); out = m({'image': torch.randn(1, 1, 256, 256, device='cuda')}); print('OK | keypoints:', tuple(out['keypoints'][0].shape))"
```

O `run-pipeline.ps1` **detecta automaticamente** o `.venv-hloc\Scripts\python.exe` quando existe, usando-o no lugar do `python` global. Se o venv não existir, ele cai pro `python` do PATH com warning. Procure no log:
```
[2/5] (a+b) Features+matches via hloc (SuperPoint + LightGlue, P05)...
  Usando python do .venv-hloc: ...\.venv-hloc\Scripts\python.exe
```

**Pegadinhas comuns:**

- **`No module named 'SuperGluePretrainedNetwork'`** — falta o passo 4 acima. O `pip install git+...` do hloc NÃO clona submódulos.
- **`CUDA error: no kernel image is available`** em GPU Blackwell (5060 Ti, 5070, 5080, 5090) — torch estável até 2.5 não tem sm_120; use o nightly cu128 do passo 2.
- **`h5py` falha de build no Windows com Python 3.12** — Python 3.10 ou WSL2 contornam. Python 3.12 funciona quando o pip acha wheels pré-compiladas (caso atual no Windows x64 com h5py 3.16+).
- Sem GPU NVIDIA / driver CUDA incompatível: o script sai com `exit 4` e o pipeline cai automaticamente no fallback COLMAP SIFT (sem quebrar).
- Em **RunPod Linux + RTX 4090** (item [9] do ROADMAP), `-UseHloc` deve virar default quando a integração com nuvem chegar.

### Como o script decide o modo de pares

- `<= 200 frames` → **exhaustive** (todas as combinações; precisão máxima).
- `> 200 frames` → **retrieval** via NetVLAD (top-K vizinhos com `--num-pairs-per-image`, default 30). Se a NetVLAD falhar, volta para exhaustive automaticamente.

### Suporte a máscaras P03

hloc **não** tem suporte nativo a `--ImageReader.mask_path`. Quando `-UseHloc` + `-EnableSamMasking` estão ativos juntos, o script pré-mascara os frames em `hloc/frames_masked/` (zera pixels onde a mask P03 é 0, mantém o restante) e roda o SuperPoint sobre essa pasta. Os pixels mascarados ficam pretos e geram zero keypoints — efeito desejado.

### Esperado

| Métrica | COLMAP SIFT | hloc (SuperPoint + LightGlue) |
|---|---|---|
| Tempo features + matching (~200 frames, RTX 5060 Ti) | 3–8 min | 10–25 min |
| Features por imagem (mediana) | 500–1500 | 3000–4000 |
| `registration_ratio` em interior de baixa textura | 70–90% | 90–99% |
| Hardware mínimo | CPU OK | CUDA obrigatório |

> Números são indicativos; calibre com seus tours reais. Use `mapping_report.json` (`features_used` + `registration_ratio`) e `hloc_report.json` (`features_per_image_median` + tempos) para comparar A/B.

### A/B testing

```powershell
# Baseline (COLMAP SIFT):
npm run gs:local -- -VideoPath "..." -OutputDir ".\output\baseline"

# Com hloc:
npm run gs:local -- -VideoPath "..." -OutputDir ".\output\hloc" -UseHloc

# Comparar:
Get-Content .\output\baseline\mapping_report.json
Get-Content .\output\hloc\mapping_report.json
Get-Content .\output\hloc\hloc_report.json
```

Foque em `registration_ratio` (deve subir) e `mapping_seconds` (deve aumentar). Inspecione visualmente o `scene.ply` no SuperSplat — paredes lisas devem estar mais limpas com hloc.

## Trainers 3DGS (Brush vs Mip-Splatting, P06)

O passo de training pode usar dois backends. A escolha é feita com `-Trainer`; o resto do pipeline (frames, SfM, compressão `.ksplat`, upload) não muda.

| Trainer        | Default | Hardware típico          | Anti-aliasing | Tempo (estimado para tour padrão) |
| -------------- | :-----: | ------------------------ | :-----------: | --------------------------------- |
| Brush 0.3.0    | ✅       | RTX 5060 Ti / 4060+      | não           | 25–45 min                          |
| Mip-Splatting  |         | RTX 4090 ideal (RunPod)  | sim           | 30–60 min (mais lento em 5060 Ti) |

### Quando usar cada um

**Brush 0.3.0 (default)** — estável, rápido, formato `.ply` 3DGS-padrão. Bom para a maioria dos casos. Mantenha como default no Windows local até validar Mip-Splatting em produção.

**Mip-Splatting** — adiciona filtros 3D + 2D Mip que suavizam gaussianas grandes vistas de longe. Use quando:

- O cliente reportou "flickering" em paredes ou serrilhado em telas pequenas (iPhone 6.1").
- O imóvel tem muitos detalhes finos (cortinas, lustres, plantas, persianas).
- Você está rodando no **RunPod (RTX 4090)** — performance e VRAM ideais (ROADMAP item [9]).

O paper original (Yu et al., CVPR 2024 — Best Student Paper) reporta **+13–66 % de PSNR em rendering multi-escala** vs 3DGS vanilla. Em viewer mobile pequeno, isso costuma se traduzir em paredes mais limpas e menos cintilação durante movimento.

### Setup do Mip-Splatting (uma vez, manual)

> Não rode automaticamente: compilar `diff-gaussian-rasterization` exige Visual Studio Build Tools 2022 no Windows (ou gcc + CUDA toolkit no Linux). O founder deve executar:

```powershell
# 1. Clone do repo + submodulos (rasterizador CUDA):
git clone --recursive https://github.com/autonomousvision/mip-splatting.git scripts\local-gs\mip-splatting

# 2. Venv dedicado (recomendado para isolar do .venv-hloc):
python -m venv .venv-mip
.venv-mip\Scripts\Activate.ps1

# 3. PyTorch com CUDA 12.1:
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# 4. Deps Python do repo + as do nosso wrapper:
pip install -r scripts\local-gs\mip-splatting\requirements.txt
pip install -r scripts\local-gs\requirements_mipsplatting.txt

# 5. Compilar rasterizador CUDA (exige VS Build Tools "Desktop development with C++"):
pip install scripts\local-gs\mip-splatting\submodules\diff-gaussian-rasterization

# 6. (Opcional) Apontar para um clone fora da pasta padrao:
$env:MIPSPLATTING_REPO = "D:\repos\mip-splatting"
```

**Setup Linux/RunPod** (mais simples — toolchain CUDA já presente):

```bash
git clone --recursive https://github.com/autonomousvision/mip-splatting.git
cd mip-splatting
pip install -r requirements.txt
pip install submodules/diff-gaussian-rasterization
```

### Como o pipeline encontra o repo

`run_mipsplatting.py` resolve o caminho do `train.py` na seguinte ordem:

1. `--repo <path>` (CLI override; não exposto no PowerShell).
2. Variável de ambiente `MIPSPLATTING_REPO`.
3. `scripts/local-gs/mip-splatting/` (default ao lado do script).

Se nenhum funcionar, o wrapper sai com **exit 2** e instrução para clonar.

### Como rodar

```powershell
# Brush (default):
npm run gs:local -- -VideoPath "C:\capturas\imovel.mp4"

# Mip-Splatting (mesmo source-path; o pipeline copia o .ply final para splat/scene.ply):
npm run gs:local -- -VideoPath "C:\capturas\imovel.mp4" -Trainer mipsplatting

# Mip-Splatting com mais iteracoes e resolucao mais baixa (Plano B p/ <16 GB VRAM):
npm run gs:local -- -VideoPath "..." -Trainer mipsplatting -TrainerIterations 30000 -MipResolution 1024
```

O `.ply` final fica em `splat/scene.ply` (mesmo lugar que o Brush escreve), então:

- `create-ksplat.js` consome sem modificação (SH=0, igual ao Brush).
- `upload-and-finalize.mjs` envia exatamente o mesmo arquivo.
- `SplatViewer.tsx` no app abre normalmente o `.ksplat` resultante.

### Comportamento em caso de falha

Por design (restrição #8 do P06), **não há fallback automático** Mip → Brush: o training é caro (~30–60 min) e a decisão de relançar deve ser explícita. Em qualquer erro do wrapper:

| Exit Code | Causa típica | Ação |
| :-------: | ------------ | ---- |
| 1 | `--source-path` inválido (faltam `sparse/0/*.bin` ou `images/`) | Confirme que a ETAPA 2 (SfM) terminou com sucesso. |
| 2 | Repo Mip-Splatting não encontrado | Clone manualmente (ver Setup acima) ou defina `MIPSPLATTING_REPO`. |
| 3 | `train.py` falhou em runtime (CUDA OOM, rasterizador não compila, etc.) | Veja o log; tente `-MipResolution 1024`; valide drivers NVIDIA / `nvidia-smi`. |

O pipeline aborta com `exit 1` na ETAPA 3 e imprime no log a sugestão de relançar com `-Trainer brush`.

### Validação do `.ply` (automática)

Após o training, `run_mipsplatting.py` abre o `point_cloud.ply` com `plyfile` e checa:

- Presença dos campos 3DGS obrigatórios: `x, y, z, scale_*, rot_*, f_dc_*, opacity`.
- Ausência de `f_rest_*` (SH ordem > 0). Se houver (porque alguém passou `--sh-degree > 0`), o wrapper imprime **aviso** — `create-ksplat.js` aceita, mas o `.ksplat` final fica 3–15× maior.

A flag `--sh-degree` é forçada para `0` no comando construído pelo `run-pipeline.ps1`. Para experimentos com SH > 0, edite manualmente ou abra o PR; **não mude o default**.

### A/B testing Brush vs Mip

```powershell
# Brush (baseline):
npm run gs:local -- -VideoPath "..." -OutputDir ".\output\brush"

# Mip-Splatting (mesma captura, mesmo SfM):
npm run gs:local -- -VideoPath "..." -OutputDir ".\output\mip" -Trainer mipsplatting

# Comparar metadados:
Get-Content .\output\mip\mipsplatting_report.json

# Inspecao visual: abrir ambos os .ply em superspl.at/editor lado a lado, ou
# carregar os respectivos .ksplat no SplatViewer e gravar tela.
```

> **TODO(founder)**: depois de 3 tours comparados visualmente, decidir se Mip-Splatting vira default no fluxo RunPod (item [9] do `ROADMAP.md`). Manter Brush como default Windows local até o resultado A/B fechar.

## Tempo estimado

Em GPU tipo **RTX 5060 Ti**, para um quarto típico: **~45–90 minutos** (depende de duração do vídeo, número de frames, qualidade COLMAP e `TotalSteps` do Brush).

## Testar o `.ply` gerado

1. **HTML local (mesma stack que o Imerso no browser)**  
   - Suba a **raiz do repo** com um servidor HTTP, por exemplo: `npx serve` (ou outra porta livre).  
   - Abra `scripts/local-gs/test-viewer.html` com query apontando para o PLY **em URL relativa ao servidor**, por exemplo:  
     `http://localhost:3000/scripts/local-gs/test-viewer.html?ply=/output/20260108_143000/splat/scene.ply`  
   - **Não use `file://`** para `?ply=` — o navegador bloqueia leitura arbitrária de disco.  
   - Alternativa: **arrastar e soltar** o arquivo `.ply` na página (funciona melhor com HTTP; em `file://` o drop ainda pode funcionar para arquivo local).

2. **Editor online**  
   - https://superspl.at/editor — envie o `.ply` gerado.

## Compressão: LightGaussian Pruning (P07)

Por padrão, o `.ply` do trainer pesa 100–200 MB e o `.ksplat` final 10–20 MB. No 4G brasileiro de Balneário Camboriú isso são 4–8 s de tela preta no celular do cliente antes do tour aparecer. LightGaussian (Fan et al., NeurIPS 2024 Spotlight, arXiv:2311.17245) remove **gaussianas de baixa significância** — calculando, para cada gaussiana, sua contribuição visual integrada sobre todas as views do training. O paper documenta **15× de compressão** com perda < 0,5 dB PSNR no Mip-NeRF360.

A nossa implementação (`scripts/local-gs/prune_gaussians.py`) é uma adaptação **CPU-friendly** do paper (restrição #10 do P07): não exige `diff-gaussian-rasterization` nem CUDA; usa numpy para projetar o **centro** de cada gaussiana em cada câmera COLMAP e contar em quantas views ela é visível. A significância final é:

```
significance(g) = sigmoid(opacity) * (exp(scale_0) * exp(scale_1) * exp(scale_2)) * view_count
```

Onde `opacity` e `scale_*` são lidos do `.ply` na forma logit/log (formato 3DGS-padrão Inria/Brush/Mip).

### Como ativar

```powershell
# Default (sem pruning) — comportamento idêntico ao baseline:
npm run gs:local -- -VideoPath "C:\capturas\imovel.mp4"

# Com pruning (recomendado a partir do tour piloto validado):
npm run gs:local -- -VideoPath "C:\capturas\imovel.mp4" -EnablePruning

# Mais agressivo (mobile 3G / conexão fraca):
npm run gs:local -- -VideoPath "..." -EnablePruning -PruneRatio 0.75

# Com quantização extra (validar visualmente, default OFF):
npm run gs:local -- -VideoPath "..." -EnablePruning -EnableQuantization
```

### Parâmetros (já listados acima)

| Flag                   | Default | Faixa útil | Quando mexer |
| ---------------------- | :-----: | :--------: | ------------ |
| `-EnablePruning`       | off     | on/off     | Sempre que o tour for distribuído por WhatsApp / Instagram. |
| `-PruneRatio`          | 0.6     | 0.0 – 0.85 | Ver tabela abaixo. Acima de 0.85 o script aborta. |
| `-EnableQuantization`  | off     | on/off     | Só para A/B; quantização dupla com `create-ksplat.js` pode degradar. |
| `-PruneViewSample`     | 0 (todas) | 20 – 60  | Plano B para tours com >500k gaussianas e >200 views (acelera). |

### Tabela de impacto (estimativa do paper LightGaussian)

| `PruneRatio` | `.ksplat` típico | Perda PSNR | Indicado para |
| :----------: | :--------------: | :--------: | --------------- |
| 0.0 (off)    | 10–20 MB         | 0 (baseline) | Desktop, demos premium, primeira entrega ao cliente para aprovação |
| 0.5          | 7–8 MB           | -0.2 dB    | Mobile com Wi-Fi |
| **0.6 (default)** | **5–6 MB**  | **-0.4 dB** | **Mobile 4G — caso padrão Imerso** |
| 0.75         | 3–4 MB           | -0.7 dB    | Mobile 3G ou áreas de cobertura ruim |
| 0.85         | 2–3 MB           | -1.2 dB    | Tour de prospecção rápida; perda visível |

> **TODO(founder):** calibrar `PruneRatio = 0.6` após A/B em 3–5 tours reais (paredes lisas, lustres, plantas) antes de promover a default no fluxo de produção.

### Quando NÃO usar

- **Tours de alto padrão** onde detalhe fino é argumento de venda (alvenaria aparente, mármore, marcenaria).
- **Primeira entrega** ao cliente novo: mande primeiro a versão completa para ele aprovar visualmente; depois libere a versão pruned no link público.
- **Lustres / janelas com cortina translúcida**: gaussianas pequenas e de baixa opacidade nessas regiões podem ser cortadas. Visualize o resultado no SuperSplat antes de publicar.

### O que o pipeline faz em caso de falha

Em qualquer um dos cenários abaixo, o pipeline **mantém o `.ply` original** e segue para `create-ksplat.js` sem abortar (restrição #6 do P07):

- `python` não está no PATH.
- `prune_gaussians.py` ausente.
- `colmap_ws/sparse/0/` não existe (SfM falhou).
- `prune_gaussians.py` retornou exit ≠ 0 (validação, runtime, deps faltando).
- `scene_pruned.ply` não foi gerado.

A linha `AVISO [3.7/5]: ...` no log diz exatamente qual condição disparou. Você ainda pode rodar manualmente:

```powershell
python scripts\local-gs\prune_gaussians.py `
  --ply           "C:\caminho\output\<ts>\splat\scene.ply" `
  --output        "C:\caminho\output\<ts>\splat\scene_pruned.ply" `
  --colmap-sparse "C:\caminho\output\<ts>\colmap_ws\sparse\0" `
  --prune-ratio   0.6 `
  --report        "C:\caminho\output\<ts>\prune_report.json"
```

### Saídas

- `splat/scene_pruned.ply` — `.ply` reduzido (mesmo schema do `scene.ply`, número menor de vértices).
- `prune_report.json` — diagnóstico estruturado para auditoria.
- ETAPA 4 (`create-ksplat.js`) consome `scene_pruned.ply` quando o pruning sucedeu; senão consome `scene.ply` como sempre.

## Reordenação + lite .ksplat (P08)

Objetivo: reduzir **time-to-first-frame** no viewer público. O `progressiveLoad` da `@mkkellogg/gaussian-splats-3d` lê o `.ksplat` **sequencialmente**; splats mais importantes no início do buffer aparecem primeiro. Scripts:

- `reorder_ply.py` — ordena gaussianas por `sigmoid(opacity) * exp(scale_0) * exp(scale_1) * exp(scale_2)` (alinhado ao P07), grava `scene_reordered.ply` + JSON opcional `--report`.
- `make_lite_ply.py` — mantém as primeiras `ceil(N * ratio)` linhas de um `.ply` já ordenado; saída `scene_lite.ply`.

No `run-pipeline.ps1`, o passo **`[4.7/5]`** roda quando `-EnableReorder` **ou** `-EnablePruning` está ativo (pruning já reduz gaussianas; reorder ajuda o progressive mesmo sem prune). `-GenerateLiteKsplat` gera `scene.lite.ksplat` após o full. Com `-TourId`, `upload-and-finalize.mjs` aceita `--splat-lite-file` e o finalize grava `splat_r2_key_lite` / `splat_size_bytes_lite` no Supabase (migration `20250511000001_tours_splat_lite.sql`). O proxy `/api/public/tours/[id]/splat/scene.ksplat?variant=lite` redireciona para a key lite. O `SplatViewer` tenta o lite (timeout 5s), depois carrega o full em background e remove a cena 0 quando possível.

> **TODO(founder):** aplicar migration no Supabase antes de usar finalize com lite em produção.

## Compressão .ksplat (one-time setup)

O pipeline gera `scene.ply` (formato bruto) e `scene.ksplat` (formato comprimido, ~60-70% menor) lado a lado. O `.ksplat` é o que vai pra produção; o `.ply` fica pra debug no SuperSplat.

O conversor `create-ksplat.js` **não** vem no pacote npm da biblioteca. Precisa clonar o repo oficial uma única vez:

```powershell
# A partir da raiz do projeto Imerso
git clone --depth 1 --branch v0.4.7 https://github.com/mkkellogg/GaussianSplats3D.git tools/gs3d-source
cd tools/gs3d-source
npm install
cd ../..
```

**Pegadinha Windows:** o `package.json` do `gs3d-source` chama `cp` Unix-only no script `build` para copiar `node_modules/three/build/three.module.js` para o build gerado. No PowerShell o `npm run build` quebra com "cp: command not found" ou similar. Não é obrigatório rodar o build do `gs3d-source` para o pipeline funcionar — o conversor `util/create-ksplat.js` é um script Node standalone que roda só com `npm install`. Se em algum momento for necessário rodar o build (provavelmente nunca para o nosso caso), use Git Bash, WSL, ou copie manualmente:

```powershell
# Equivalente PowerShell do `cp` do build script
Copy-Item tools\gs3d-source\node_modules\three\build\three.module.js tools\gs3d-source\build\three.module.js
```

Validação: o arquivo `tools/gs3d-source/util/create-ksplat.js` deve existir.

Parâmetros usados pelo pipeline (definidos em `run-pipeline.ps1`, não editar a menos que saiba o que está fazendo):

- `compressionLevel = 1` — recomendado pra "general viewing"
- `alphaThreshold = 5` — remove splats quase transparentes (de 0 a 255)
- `sceneCenter = "0,0,0"` — default
- `blockSize = 5.0` — default
- `bucketSize = 256` — default
- `sphericalHarmonicsLevel = 0` — sem SH, economiza espaço (interiores)

Para tunar qualidade vs. tamanho depois, edite o bloco `[4/4] Compressão .ksplat` no `run-pipeline.ps1`.

## Upload R2 + finalize automático (opcional)

Por padrão, o pipeline para no `scene.ksplat` local. Para automatizar o resto (upload pro R2 + marcar tour como `ready`), passe parâmetros adicionais:

```powershell
npm run gs:local -- `
  -VideoPath "C:\caminho\video.mp4" `
  -TourId "00ca9805-39c5-4b5d-8548-3e127269009f" `
  -ApiBaseUrl "http://localhost:3000"
```

Pré-requisitos no `.env.local` da raiz do projeto:

- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — já configurados
- `PIPELINE_SERVICE_TOKEN` — gere um valor secreto longo (ex.: `openssl rand -hex 32`) e coloque no `.env.local`. **A mesma string** deve estar na env do servidor Next (Vercel ou localhost).

O tour já precisa existir no banco antes (criar pelo painel `/painel/tours/novo`). O `TourId` é o UUID na URL `/painel/tours/<id>`.

Com `-GenerateLiteKsplat` e upload ativo, o script Node envia `scene.ksplat` + `scene.lite.ksplat` num único finalize (campos `r2KeyLite` / `sizeBytesLite`). Exige migration P08 aplicada no Supabase.

Para produção, use `-ApiBaseUrl https://imerso.com.br` (ou o domínio final).

Para debug (só gerar arquivos locais, sem subir), use `-SkipUpload`.

## Notas

- O COLMAP está limitado aos parâmetros acordados (`automatic_reconstructor` com `--dense 0`, etc.; ou fluxo manual com máscaras P03). Não adicionamos flags extras sem revisão.
- O `test-viewer.html` usa **CDN** (ESM) para Three.js e `@mkkellogg/gaussian-splats-3d`; não depende de `node_modules`.
