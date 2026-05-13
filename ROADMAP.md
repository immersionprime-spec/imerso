# Imerso — Roadmap

## Status atual

**Pipeline local validado end-to-end:**
- ffmpeg (5 fps + `frame_selector.py`, ou baseline com `-SkipFrameSelection`) → `frames/` → COLMAP SfM sparse → Brush 3DGS → scene.ply
- Modo vídeo e modo fotos estáticas implementados
- Viewer local funcional (test-viewer.html)
- Resultado validado no SuperSplat

**Auditoria de segurança e infra (2026-05-10) aplicada:**
- Código Luma morto removido (lib + 4 rotas API). Renomeado `mark-ready` → `splat/finalize`
- Proxy `/api/public/tours/[tourId]/splat` com presigned URL R2 (1h) e validação de cookie HMAC para tours privados
- COOP `same-origin` + COEP `credentialless` no `next.config.ts` — SharedArrayBuffer nos workers da lib GS3D exige `crossOriginIsolated` (ver Decisões técnicas → Arquitetura / infra)
- Cookie de acesso a tour privado com flag `Secure` em produção
- Rate-limit em memória nas rotas públicas (leads, track-view, track-whatsapp, verify-password)
- HotspotMarkers refatorado para atualizar via ref+transform, sem re-render por frame
- Documentação CORS R2 criada (`scripts/r2-cors-config.json` + `scripts/R2_CORS_SETUP.md`)

**Pendência mínima da auditoria:**
- Deletar pastas vazias remanescentes: `src/lib/luma/` e `src/app/api/admin/tours/[id]/luma/{submit,status,log-cost,mark-ready}/`
  ```powershell
  Remove-Item -Recurse -Force src\lib\luma
  Remove-Item -Recurse -Force "src\app\api\admin\tours\[id]\luma"
  ```

---

## Próximas sessões — em ordem de execução

A ordem reflete o caminho de **menor risco / maior impacto em receita**, respeitando dependências reais (não dá pra escalar antes de validar qualidade; não dá pra processar em nuvem antes de comprimir o `.ply`).

---

### [1] Validação de qualidade com fotos estáticas (PRÓXIMO)

**Objetivo:** confirmar se fotos estáticas de dia superam vídeo noturno em qualidade de splat.

**Setup:** GoPro Hero 11, 27MP, Linear, 1/250s, ISO 800, luz natural.

**Pipeline:** `npm run gs:local -- -PhotosPath "..." -TotalSteps 60000`

**Critério de sucesso:** `scene.ply > 800k splats`, geometria limpa no SuperSplat.

**Por que primeiro:** sem qualidade visual aceitável o resto não importa — não dá pra vender, não dá pra escalar, não dá pra otimizar. Esta validação trava todo o resto.

---

### [2] Aplicar CORS no R2 (pré-requisito de produção)

**Esforço:** 5 minutos.

**Quando fazer:** antes do primeiro tour real subir pra produção via fluxo `splat/finalize` + viewer público.

**O que fazer:**
1. Cloudflare dashboard → R2 → bucket `splat-viewer` → Settings → CORS Policy
2. Colar conteúdo de `scripts/r2-cors-config.json`
3. Validar abrindo um tour: console do browser não pode mostrar erro CORS

**Por que aqui:** o proxy splat (já implementado) gera presigned URL apontando para o domínio R2. Sem CORS, o browser bloqueia o fetch e o viewer não carrega.

---

### [3] Compressão do `.ply` para `.ksplat` no pipeline ✅ **CONCLUÍDO (2026-05-11)**

**Resultado validado end-to-end:**
- Pipeline gera `scene.ply` (109,3 MB) + `scene.ksplat` (10,9 MB, **10% do .ply** — superou meta de ≤40%) em 86,1 min (RTX 5060 Ti)
- Viewer público (`SplatViewer.tsx`) renderiza `.ksplat` via `/api/public/tours/[tourId]/splat/scene.ksplat`
- Request 302 → presigned URL R2 200, 11.470 kB baixados em ~1,12s
- Visualmente equivalente ao `.ply` no SuperSplat

**Tech debt identificado (não bloqueante):**
- `npm run build` do `gs3d-source` no Windows quebra (script usa `cp` Unix-only). Não afeta o pipeline — `create-ksplat.js` é Node standalone, roda só com `npm install`. Workaround documentado em `scripts/local-gs/README.md`.
- Bug `removeChild` no unmount do `SplatViewer.tsx` (provável Strict Mode + double-mount em dev). Não crítico em produção. Enfileirar como tech debt.

---

### [3] (descrição original abaixo, preservada como referência)

**Objetivo:** reduzir o tamanho do arquivo entregue ao browser em ~60-70% sem perda visual perceptível, viabilizando carregamento em mobile 4G.

**Contexto:** `scene.ply` de 315MB hoje é proibitivo em mobile brasileiro. O `lod.ts` atual só altera `pixelRatio` — não é LOD real, é só preset de qualidade. O ganho real vem da compressão do arquivo na origem.

**Abordagem:**
- Adicionar passo final no `run-pipeline.ps1`: chamar conversor `.ply` → `.ksplat` (formato comprimido nativo do `@mkkellogg/gaussian-splats-3d`)
- Conversor: usar o script `tools/create-ksplat.js` que vem com a biblioteca, ou portar pra Node standalone
- Salvar `scene.ksplat` ao lado de `scene.ply` no diretório de output
- Atualizar `splat/finalize/route.ts` para aceitar `.ksplat` como extensão válida
- Atualizar `SplatViewer.tsx`: a biblioteca já detecta formato pela extensão automaticamente, então não muda nada no viewer

**Alternativa avaliar:** SOGS (Self-Organized Gaussian Splats, do Niantic) — chega a 90% de redução. Mais novo, requer suporte do viewer. **Decisão:** começar com `.ksplat` (suporte garantido), avaliar SOGS se não for suficiente.

**Critério de aceite:**
- `.ksplat` gerado tem ≤40% do tamanho do `.ply` correspondente
- Visualmente indistinguível do `.ply` no SuperSplat (comparação A/B em desktop)
- Carrega em < 30s em conexão 10 Mbps simulada

**Esforço estimado:** 3h (script + integração no pipeline + ajuste finalize).

**Impacto:** Alto — tempo de carregamento do viewer cai pela metade, mobile vira viável.

**Dependências:** [1] concluído (precisa de qualidade base validada para comparar).

---

### [3.5] Câmera FPS + joystick mobile + Y-clamp **(PROPOSTA — A DEBATER)**

> ⚠️ **Status:** Decisão pendente. Inserido aqui em 2026-05-10 a partir de discussão com o founder (Sheik) sobre experiência mobile antes de mostrar pra cliente. Não confirmado se entra na ordem ou se é abordagem certa. Reler antes de decidir.

**Objetivo:** dar ao usuário em mobile uma navegação tipo "andar no ambiente" (joystick virtual + drag pra olhar), substituindo OrbitControls da lib por câmera FPS controlada manualmente.

**Contexto da decisão:**
- O viewer atual usa `viewer.controls` (OrbitControls da própria lib via `useBuiltInControls` default `true`). É **orbital**, não FPS — o que pode parecer FPS hoje é só a câmera começar dentro do bbox do splat após `fitCameraToSplat`.
- Em mobile, OrbitControls com toque dá experiência confusa. Usuário comum (cliente comprando imóvel) não entende.
- Founder pediu: joystick translação + drag câmera no mobile, WASD continua no desktop.
- Founder pediu inicialmente "colisão com paredes". **Não faremos** — splats não têm geometria, mesh COLMAP é o item [7] (alto risco em interiores). Substituir por **Y-clamp + bounding box** já cobre 90% dos casos.

**Abordagem:**
- `SplatViewer.tsx`: passar `useBuiltInControls: false` ao construir o `Viewer` da lib
- Implementar câmera FPS standalone com Three.js puro:
  - `yaw` e `pitch` via `Euler` (clamp pitch em ±80° pra não virar de cabeça pra baixo)
  - Translação: `Vector3.applyEuler(camera.rotation)` na direção forward/right
  - Y-clamp: `position.y = clamp(y, bounds.min[1] + 0.5, bounds.max[1] - 0.3)` (margens de "altura olho humano" + teto)
  - Bounding box clamp: `position.xz` clamped dentro do bbox horizontal (impede sair da cena pro vazio)
- Mobile (detectar via `'ontouchstart' in window` ou breakpoint Tailwind):
  - Joystick virtual no canto inferior esquerdo (lib `nipplejs`, 8kb, MIT, zero dependências)
  - Drag direito da tela (qualquer ponto fora do joystick): rotaciona câmera
- Desktop: WASD + mouse drag (mantém comportamento atual em espírito, mas via FPS, não orbital)
- Coexistir com `pickMode` (editor de hotspots): suspender controles FPS quando `pickMode = true`

**Riscos:**
- Trocar sistema de câmera é a mudança de maior escopo no `SplatViewer.tsx` até hoje
- `pickMode` (admin) usa `pointerdown` no canvas — vai precisar coordenar pra não disparar movimento e pick juntos
- `worldToScreen` (usado por hotspots) e `getCameraState` precisam continuar funcionando com a nova câmera
- Testar em iOS Safari + Android Chrome — touch events têm pegadinhas

**Critério de aceite:**
- Em mobile, joystick funciona pra translação; drag em outra parte da tela rotaciona câmera
- Em desktop, WASD + drag funciona como antes (ou melhor)
- Câmera não atravessa chão, teto, nem sai do bbox horizontal
- `pickMode` continua funcionando (hotspot editor)
- `getCameraState` / `setCameraState` / `resetCamera` continuam funcionando (necessário pro Cinematic Mode + waypoints)
- 30+ fps estável em iPhone 13/Galaxy S22

**Esforço estimado:** 4-6h (alto risco, escopo grande no único arquivo crítico do viewer).

**Impacto:** Alto — sem isso, mobile é ruim de usar. Crítico antes de mostrar pra cliente.

**Dependências:** [3] validado end-to-end. Não conflita com [4]/[5] mas escopo grande pede ordem dedicada.

**TODO(founder) — debater antes de iniciar:**
- Confirmar substituir OrbitControls é aceitável (alternativa: manter OrbitControls e só sobrepor joystick — mais simples, mas joystick + orbital fica estranho)
- Confirmar `nipplejs` como lib (alternativa: implementar joystick manual, +200 linhas, sem dep nova)
- Definir altura olho humano em metros do bbox (precisa medir num tour real após [3] validado)
- Decidir se joystick aparece ao tocar a tela (autohide) ou fixo

---

### [3.6] Waypoints visíveis no viewer (teleporte entre pontos chave) **(PROPOSTA — A DEBATER)**

> ⚠️ **Status:** Decisão pendente. Inserido aqui em 2026-05-10 junto com [3.5]. A ideia é entregar experiência híbrida (joystick livre + atalhos pra pontos chave) pra reduzir desorientação do usuário comum em mobile.

**Objetivo:** renderizar ícones 3D nos `tour_waypoints` que já existem no banco. Tap no ícone teleporta câmera (com animação) pra aquela posição/orientação. Coexiste com o joystick livre do [3.5].

**Contexto da decisão:**
- Tabela `tour_waypoints` já existe (usada pelo Cinematic Mode opcional)
- Sem waypoints visíveis, usuário em mobile fica perdido — tela pequena, sem ponto de referência
- Inspiração: Matterport "dots" e Zillow 3D Home tour points
- **Não substitui o joystick** — complementa. Quem quer explorar livre, usa joystick. Quem quer ver os destaques, toca os pontos.

**Abordagem:**
- Carregar `waypoints` que já vêm em `PublicTourPayload`
- Renderizar marcadores 3D usando padrão de `HotspotMarkers` (refs+transform, já refatorado na auditoria)
- Cada waypoint mostra ícone + label (ex: "Cozinha", "Suíte", "Varanda")
- Tap/click → animar câmera de posição/target atual pra posição/target do waypoint usando `requestAnimationFrame` ou tween (lerp simples ~800ms)
- Esconder waypoints durante animação (visual cleaner)
- Admin: já tem CRUD de waypoints em `/painel/tours/[id]/waypoints` — pode reusar pra essa nova UX

**Critério de aceite:**
- Tour com waypoints renderizados como ícones flutuantes na cena
- Tap teleporta com animação suave (sem cortes bruscos)
- Funciona junto com joystick (não conflita controles)
- Performance: marcadores não derrubam fps em mobile (já validado pelo padrão `HotspotMarkers`)

**Esforço estimado:** 3-4h.

**Impacto:** Médio-Alto — entrega "feel" de produto Matterport sem mesh nem colisão.

**Dependências:** [3.5] (precisa do sistema de câmera FPS pra teleporte fazer sentido) ou [4] (se decidir entregar antes do [3.5]).

**TODO(founder) — debater antes de iniciar:**
- Confirmar que ícone 3D na cena é melhor UX que lista lateral 2D
- Decidir se label do waypoint é texto fixo (`titulo` da tabela?) ou ícone genérico
- Verificar se `tour_waypoints` tem campo de `titulo` ou só posições — se não tem, precisa migration
- Se `[3.5]` for descartado, repensar este (joystick + waypoints é a recomendação atual; só waypoints sem joystick fica restritivo demais)

---

### [4] Upload R2 + finalize automático no fim do pipeline ✅ **CONCLUÍDO (2026-05-11)**

**Implementação:**
- `splatFinalizeSchema` agora aceita union: `{ splatUrl }` (caminho HTTP legado) OU `{ mode: 'r2Key', r2Key, sizeBytes }` (pipeline local)
- Rota finalize aceita auth via `x-pipeline-token` (env `PIPELINE_SERVICE_TOKEN`) como alternativa ao cookie super_admin. Quando autenticado via token, usa `createAdminClient()` (service role) direto.
- Validação do `r2Key`: regex confere prefixo `tours/<uuid>/splat/<nanoid>.<ext>`. UUID case-insensitive (defesa contra UUID colado em maiúsculas no Windows). HEAD no R2 valida existência; `sizeBytes` enviado é descartado em favor do `ContentLength` real do R2 (fonte da verdade).
- Script standalone `scripts/local-gs/upload-and-finalize.mjs`: lê `.env.local`, multipart upload via `@aws-sdk/lib-storage` (queueSize 4, partSize 10MB), POST pro finalize. Nanoid inline sem dep externa.
- Pipeline `run-pipeline.ps1`: novos params `-TourId`, `-ApiBaseUrl` (default `http://localhost:3000`), `-SkipUpload`. Novo passo [5/5] roda só com `-TourId`. Prefere `.ksplat` sobre `.ply`.
- Backward compatible: fluxo antigo (painel → cookie super_admin → `{ splatUrl }`) continua funcionando.

**Pré-requisito operacional:** definir `PIPELINE_SERVICE_TOKEN` no `.env.local` (gerar com `openssl rand -hex 32`); mesmo valor nas env vars do servidor Next.

---

### [4] (descrição original abaixo, preservada como referência)

**Objetivo:** eliminar o passo manual de "subir o .ply pelo painel" depois que o pipeline termina.

**Hoje:** `run-pipeline.ps1` para no `scene.ply` local. Sheik abre o painel e faz upload manual.

**Depois:** pipeline termina, sobe automaticamente pro R2 via `aws s3 cp` (R2 é S3-compatible), e dispara `POST /api/admin/tours/[id]/splat/finalize` com a URL do R2.

**Implementação:**
- Adicionar parâmetros opcionais ao script: `-TourId`, `-AdminToken`, `-R2Key`
- Se `-TourId` presente, ao final do pipeline:
  1. Upload `.ksplat` (preferido) ou `.ply` para `tours/{tourId}/splat/{nanoid}.ksplat` no R2
  2. POST para `https://imerso.com.br/api/admin/tours/{tourId}/splat/finalize` com header de auth admin e body `{ splatUrl: r2PublicUrl }`
- Documentar uso no `scripts/local-gs/README.md`

**Critério de aceite:**
- Comando único processa o tour de ponta a ponta sem abrir o painel
- Erro em qualquer etapa interrompe e loga claramente

**Esforço estimado:** 2h.

**Impacto:** Médio — economiza ~5 min de fricção por tour, importante quando volume crescer.

**Dependências:** [3] concluído (sobe `.ksplat`, não `.ply` cru).

---

### [5] Upload multipart paralelo no painel ✅ **CONCLUÍDO (2026-05-11)**

**Implementação:**
- `useUploadMultipart.ts` refatorado: `for` sequencial → pool de 4 workers concorrentes via `Promise.all`
- Cancelamento via `AbortController` real (substituiu boolean): `abort()` propaga `signal` pros fetches em voo, todos abortam instantaneamente
- Progresso baseado em `completedCount / totalChunks` (chunks completam fora de ordem)
- `completedParts` ordenado por `PartNumber` antes do `complete` (S3/R2 exige ordem ascendente)
- Falha de qualquer worker chama `abortRef.current?.abort()`, cancelando os outros (evita uploads órfãos)
- API pública do hook intacta — `TourUploadClient.tsx` não foi tocado

**Validação E2E (Network tab + painel):**
- T1: vídeo ~50MB → 4 PUTs paralelos confirmados na Network
- T2: vídeo 300MB subiu em <1 min (antes seria ~3-5 min)
- T3: cancelamento meio-upload → PUTs viram `(canceled)`, POST `/upload/abort` 200, mensagem "Upload cancelled" no painel, estado limpo

---

### [5] (descrição original abaixo, preservada como referência)

**Objetivo:** acelerar o upload de vídeos grandes (até 2GB) reduzindo o tempo em ~4x.

**Contexto:** `useUploadMultipart.ts` faz `for` síncrono — chunk por chunk em sequência. Vídeo 2GB com chunks 10MB = 200 PUTs sequenciais. Em 50 Mbps demora ~5 min, podendo cair pra ~1 min com 4 uploads concorrentes.

**Implementação:**
- Substituir `for` sequencial por pool de workers concorrentes (4 paralelos)
- Manter ordem de `parts` final correta (a chamada `complete` exige ordenação)
- Cancelamento via `abortRef` precisa propagar para todos os workers ativos
- Progresso somado de todos os chunks completados, não baseado em índice

**Critério de aceite:**
- Vídeo de 500MB sobe em < 50% do tempo atual
- Cancelamento funciona em qualquer ponto
- Sem condição de corrida em `parts_completed`

**Esforço estimado:** 1h.

**Impacto:** Médio — fricção operacional alta quando vídeos são longos.

**Por que esperar até aqui:** mexer em upload de vídeo grande exige testar com vídeo grande. Faz sentido fazer junto com [4] quando fluxo end-to-end estiver sendo refinado.

---

### [6] Colisão de câmera — versão simples (Y-clamp)

**Objetivo:** impedir o usuário de atravessar o chão e o teto durante o tour. Resolve 80% das queixas potenciais.

**Abordagem:**
- Após `fitCameraToSplat`, expor bounding box Y (`bounds.min[1]`, `bounds.max[1]`) globalmente
- No `OrbitControls.update()` (ou via callback do viewer), aplicar `clamp` na posição Y da câmera
- Margem de segurança: `[bounds.min[1] + 0.5, bounds.max[1] - 0.3]` (em metros aproximados, calibrar)

**Critério de aceite:**
- Câmera não desce abaixo do "chão" do imóvel (definido pelo bbox)
- Câmera não sobe acima do "teto"
- Atravessar paredes laterais ainda funciona (esse é o item [7])

**Esforço estimado:** 2h.

**Impacto:** Médio — primeira queixa em demos é "atravessei o chão e fiquei desorientado".

**Dependências:** nenhuma. Pode fazer paralelo a [3]/[4]/[5] se quiser quebrar o ritmo de pipeline.

---

### [7] Colisão de câmera — versão completa (mesh COLMAP)

**Objetivo:** impedir o usuário de atravessar paredes (não só chão/teto).

**Abordagem original (do roadmap antigo):**
- Open3D (Python) gera mesh convexo a partir de `sparse/0/` do COLMAP → exporta `.glb`
- Viewer carrega `.ply` (visual) + `.glb` (colisão invisível)
- CameraControls com raycasting contra o `.glb`

**Entradas necessárias:** `sparse/0/` do COLMAP (já gerado pelo pipeline atual).

**Complexidade estimada:** ~50 linhas Python no pipeline + ~150 linhas JS no viewer.

**Esforço estimado:** 8h (incluindo calibração de qualidade do mesh — convex hull pode ser ruim em imóveis com formatos complexos; pode precisar Poisson reconstruction).

**Impacto:** Médio — paredes são menos confusas que chão/teto. Útil mas não crítico.

**Dependências:** [6] concluído (o clamp de Y é a base; o mesh substitui ou complementa).

---

### [8] Tornar bucket R2 privado + proxy genérico de assets

**Objetivo:** fechar definitivamente o vazamento de tours privados via URL direta do R2. Hoje, qualquer pessoa com a URL `r2.dev/tours/.../scene.ply` baixa o splat, mesmo sem cookie. O proxy splat só impede de descobrir a URL via API; não impede acesso direto se a URL vazar.

**Prioridade:** Média (vazamento por URL direta exige que alguém conheça a URL exata; defesa em profundidade real, não fix urgente).

**Implementação:**
1. Cloudflare R2 → bucket → desabilitar "Public access"
2. Auditar todos os usos de `r2PublicUrl(...)` no código:
   - `splat_url` — já passa por proxy (✓ feito)
   - `foto_capa_url` (capa de tour) — precisa proxy `/api/public/r2-image/[tourId]/cover`
   - `logo_url` (logo da imobiliária) — precisa proxy `/api/public/r2-image/imobiliaria/[id]/logo`
   - `foto_url` (foto do corretor) — precisa proxy `/api/public/r2-image/corretor/[id]`
3. Criar rota genérica `/api/public/r2-image/[...path]/route.ts` com presigned URL de 24h e cache HTTP `public, max-age=86400`
4. Atualizar `next.config.ts` `images.remotePatterns` para incluir o domínio do proxy

**Critério de aceite:**
- `curl https://{r2-public-url}/tours/.../scene.ply` retorna 403
- Viewer carrega normal (via proxy)
- Imagens de capa carregam normal
- Tempo de primeiro byte das imagens não regride > 100ms

**Esforço estimado:** 4h.

**Impacto:** Médio (defesa em profundidade). Sobe pra Alto se você começar a ter tours de imóveis premium onde vazamento por URL seria embaraçoso comercialmente.

**Dependências:** nenhuma técnica. Pode fazer a qualquer momento.

---

### [9] Pipeline em nuvem — RunPod serverless

**Objetivo:** processar vídeos/fotos de clientes sem depender do PC local. Desbloqueia escala real (10+ tours/semana).

**Contexto econômico:** RTX 4090 serverless no RunPod custa ~$0.69/h. Tour de ~30min de processamento = ~$0.35/tour de GPU. Com overhead (storage, transferência, retries), ~$0.50–0.80/tour. Comparado ao custo Luma estimado anterior (~$25–50/tour), **margem ~50x melhor**.

**Stack:**
- Container Docker base: `nvidia/cuda:12.1.0-devel-ubuntu22.04`
- Instalar: COLMAP 4.1, Brush v0.3.0, ffmpeg, AWS CLI (para R2)
- Entrypoint: script que recebe job (via env vars: `TOUR_ID`, `INPUT_R2_KEY`, `MODE` (video|photos), `ADMIN_TOKEN`)
- Fluxo: download input do R2 → roda pipeline → sobe `.ksplat` pro R2 → POST finalize
- Filas: começar com **Supabase + polling** (cron no RunPod consulta `tours` com status='processing'). Migrar para BullMQ/Redis se volume justificar.

**Implementação por fases:**
- **9a — Imagem Docker funcional (4h):** container roda pipeline localmente em modo dev (montagem de volume), mesmo resultado do `run-pipeline.ps1`
- **9b — Integração R2 + Supabase (3h):** download/upload + status update no banco
- **9c — Deploy RunPod serverless (3h):** template, endpoint, secrets, healthcheck
- **9d — Painel admin: botão "Processar agora" (2h):** dispara job RunPod via API, atualiza status

**Critério de aceite:**
- Tour de 200 fotos processado end-to-end pelo RunPod em < 45 min
- Custo por tour ≤ $0.80
- Falha em qualquer etapa marca status='failed' com mensagem clara no painel
- Sem quebra do fluxo local atual (ambos coexistem)

**Esforço estimado:** 12h (4h + 3h + 3h + 2h).

**Impacto:** Alto — desbloqueia escala. Sem isso, o teto de receita é ~5 tours/semana (limite do PC + tempo do Sheik).

**Dependências:** [3] concluído (sobe `.ksplat`, não `.ply`); [4] concluído (fluxo finalize automatizado funciona).

---

### [10] Qualidade avançada — algoritmos alternativos

**Objetivo:** avaliar se Mip-Splatting ou 2DGS superam o Brush em interiores.

**Contexto:** só faz sentido após pipeline em nuvem estável (sessão [9]) — testar variações de algoritmo precisa de iteração rápida, e iterar local em GPU única é lento.

**Candidatos:**
- **Mip-Splatting** — anti-aliasing melhor, recomendado para vistas próximas (interiores)
- **2DGS** (2D Gaussian Splatting) — geometria mais precisa, melhor para superfícies planas (paredes)
- **ZipNeRF** — qualidade superior, mas radicalmente mais lento e exige NeRF stack diferente; só se Brush+Mip+2DGS não bastarem

**Esforço estimado:** 8h (cada algoritmo) — basicamente trocar o trainer no container Docker e comparar resultados.

**Dependências:** [9] concluído.

---

## Decisões técnicas registradas

### Pipeline / captura
- **[P01] Blur Detection + Smart Frame Selection** — implementado (`scripts/local-gs/frame_selector.py`, integrado ao passo `[1/5]` de `run-pipeline.ps1`). Extração densa a **5 fps** → `frames_raw/` → filtro CPU (Laplaciano + pHash + amostragem + preenchimento de gaps temporais no vídeo) → `frames/` → COLMAP. Modo fotos: `--no-phash-dedupe` (só blur). Parâmetros: `-FrameTargetCount`, `-FrameMinSharpness`, `-FramePhashThreshold`, `-SkipFrameSelection` (baseline legacy). Relatório: `frame_selection_report.json`. Dependências: `requirements_frame_selector.txt`.
- **[P02] Loop Closure — protocolo + detector** — implementado. Protocolo de captura no topo de `scripts/local-gs/README.md`. Validator: `scripts/local-gs/loop_closure_validator.py` (numpy + parser `images.bin`). Integrado em `run-pipeline.ps1` como **`[3.5/5]`** após COLMAP, antes do Brush; relatório `loop_closure_report.json`. Não bloqueia o pipeline; opcional `-LoopClosureStrict` repassa `--strict` ao Python (exit 1 se `warning`, sem abortar o restante do script).
- **[P03] SAM2 + Grounding DINO — mascaramento para COLMAP** — implementado. Script `scripts/local-gs/sam2_masking.py`; dependências `requirements_sam2.txt`; pesos locais em `scripts/local-gs/models/` (gitignore). Integrado em `run-pipeline.ps1` como **`[1.5/5]`** (opcional `-EnableSamMasking`, `-SamConfidence`). Se SAM2 falhar ou faltarem modelos, o pipeline **não** aborta: COLMAP segue com `automatic_reconstructor`. Com máscaras válidas (`masks/*.png` + `sam2_report.json`), etapa **`[2/5]`** usa `feature_extractor` + `sequential_matcher` + `mapper` com `--ImageReader.mask_path` (porque `automatic_reconstructor` não expõe `mask_path`). Documentação: secção “Mascaramento de objetos móveis (SAM2)” em `scripts/local-gs/README.md`.
- **[P04] GLOMAP como triangulator SfM** — implementado. Detecção em runtime via `Test-GlomapAvailable` (`Get-Command glomap`). Quando GLOMAP está no PATH e `-ForceColmapMapper` não foi passado, etapa **`[2/5]`** é `feature_extractor` + `sequential_matcher` + **`glomap mapper`** (drop-in replacement do `colmap mapper`); senão, mantém o legacy (`automatic_reconstructor` ou fluxo manual com `mask_path` quando SAM2 ativo). Fallback automático para `colmap mapper` se GLOMAP retornar exit≠0, `images.bin` ausente, ou `registration_ratio < 0.70`. Mascaramento P03 segue aplicado ao `feature_extractor` independente do mapper. Relatório `mapping_report.json` registra `mapper_used` (`glomap` | `colmap_mapper_fallback` | `colmap_mapper_sam2` | `colmap_automatic_reconstructor`), `mapping_seconds`, `registered_images`, `total_frames`, `registration_ratio`, `glomap_available`, `force_colmap_mapper`, `sam_used`. Instalação manual do GLOMAP é opcional — sem ele, o pipeline roda exatamente como antes. Documentação: seção “SfM: GLOMAP (preferred) com fallback COLMAP” em `scripts/local-gs/README.md`.
- **[P05] hloc + SuperPoint + LightGlue — features neurais para SfM** — implementado. Script `scripts/local-gs/hloc_features.py` (CUDA obrigatório, exit codes mapeados para fallback do pipeline). Dependências `requirements_hloc.txt` em **venv separado** `.venv-hloc`. Em `run-pipeline.ps1`, etapa **`[2/5]`** foi quebrada em duas fases combináveis: **Fase A (features+matching)** = COLMAP SIFT por default, ou hloc com `-UseHloc` (fallback automático para SIFT se python/hloc/CUDA ausentes ou exit≠0); **Fase B (mapper)** = GLOMAP (P04) → fallback `colmap mapper` → `automatic_reconstructor` (legacy) quando nenhuma flag manual está ativa. Modo de pares: `exhaustive` para ≤200 frames, `retrieval` via NetVLAD para tours maiores (com fallback exhaustive). Suporte a P03: como hloc não tem `--ImageReader.mask_path`, o script pré-mascara frames em `hloc/frames_masked/`. Novos parâmetros: `-UseHloc`, `-HlocMaxImageSize` (default 1600), `-HlocPairsPerImage` (default 30), `-HlocMaxKeypoints` (default 4096). Relatório `hloc_report.json` adicional (`features_per_image_median`, `matches_per_pair_median`, `pair_mode`, tempos, `masks_applied`); `mapping_report.json` ganha `features_used` (`hloc_superpoint_lightglue` | `colmap_sift`), `use_hloc`, `hloc_ok`. Mapper recebe sufixos `_hloc` / `_hloc_sam2` em `mapper_used` quando hloc populou o database e GLOMAP não foi usado. **Default = COLMAP SIFT**; hloc só é tentado com `-UseHloc` explícito. Documentação: seção “SfM: Features clássicas vs neurais (hloc, P05)” em `scripts/local-gs/README.md`. TODO(founder): em RunPod Linux + RTX 4090 (item [9]), `-UseHloc` deve virar default.
- **[P06] Mip-Splatting como trainer alternativo** — implementado. Wrapper `scripts/local-gs/run_mipsplatting.py` chama o `train.py` oficial de `autonomousvision/mip-splatting` (3D + 2D Mip filters, anti-aliasing alias-free em rendering multi-escala — Yu et al., CVPR 2024 Best Student Paper). Dependências `requirements_mipsplatting.txt` em **venv separado** `.venv-mip`; repo clonado em `scripts/local-gs/mip-splatting/` (default; overrideável via env `MIPSPLATTING_REPO`); rasterizador CUDA (`diff-gaussian-rasterization`) compilado manualmente. ETAPA `[3/5]` do `run-pipeline.ps1` virou `switch` `-Trainer brush|mipsplatting`; **default mantido como Brush 0.3.0**. Sem fallback automático Mip→Brush (training é caro: ~30–60 min em RTX 4090): em qualquer erro o pipeline aborta e sugere relançar com `-Trainer brush`. Wrapper força `--sh-degree 0` (compat. `create-ksplat.js` com `sphericalHarmonicsLevel=0`) e valida o `.ply` final via `plyfile` (presença de `scale_*, rot_*, f_dc_*, opacity`; warning se houver `f_rest_*`). Novos parâmetros: `-Trainer` (`brush`/`mipsplatting`, default `brush`), `-TrainerIterations` (int, 0 = padrão do trainer: Brush=`-TotalSteps`/20000; Mip=30000), `-MipResolution` (int, default 1600 — reduza para 1024 em GPUs <16 GB para mitigar OOM). Checagem de `brush_app` no PATH agora é condicional a `-Trainer brush`. Saída sempre em `splat/scene.ply` (consumida sem mudança por `create-ksplat.js`, `upload-and-finalize.mjs` e `SplatViewer.tsx`). Relatório `mipsplatting_report.json` (trainer, iterations, training_seconds, ply_path, ply_size_mb, num_gaussians, resolution_used, kernel_size, sh_degree, validation_ok, has_sh_rest, cuda_available). Documentação: seção “Trainers 3DGS (Brush vs Mip-Splatting, P06)” em `scripts/local-gs/README.md`. TODO(founder): (1) clonar repo + compilar rasterizador no Windows (VS Build Tools 2022) **ou** rodar primeiro no RunPod Linux (item [9], compilação trivial); (2) adicionar `/scripts/local-gs/mip-splatting/` ao `.gitignore` (fora do escopo deste P06 por restrição #9); (3) comparar visualmente Brush vs Mip em 3 tours e decidir se Mip vira default no RunPod.
- **[P08] Reordenação PLY + .ksplat lite + carregamento progressivo no viewer** — implementado. Scripts `scripts/local-gs/reorder_ply.py` e `make_lite_ply.py` (numpy + plyfile). `run-pipeline.ps1`: passo `[4.7/5]` opcional com `-EnableReorder` ou junto com `-EnablePruning`; `-GenerateLiteKsplat` + `-LiteKsplatRatio` (default 0.30); upload `upload-and-finalize.mjs` com `--splat-lite-file`; migration `supabase/migrations/20250511000001_tours_splat_lite.sql` (`splat_r2_key_lite`, `splat_size_bytes_lite`); finalize estende payload `r2KeyLite`/`sizeBytesLite`; proxy `GET .../splat/...?variant=lite`; `public-tour.ts` expõe `splat_url_lite` opcional; `SplatViewer.tsx` carrega lite com timeout 5s, full em background, `removeSplatScene(0)` quando disponível; `TourPublicExperience` badge "Carregando detalhes…" + toast se lite falhar. Documentação: `scripts/local-gs/README.md` seção "Reordenação + lite .ksplat (P08)".
- HyperSmooth OFF — distorce pixels de forma inconsistente, quebra SfM
- Trava de horizonte OFF — mesmo motivo do HyperSmooth
- FOV Linear — sem distorção de lente
- Brush v0.3.0 no Windows compila com subsystem GUI — sem output no terminal pai (comportamento esperado, não é travamento)
- `--single_camera 1` no COLMAP — GoPro usa lente única consistente
- `--dense 0` no COLMAP — dense não é necessário para Brush (usa sparse)
- TotalSteps padrão: 60000 (atualizado de 30000 após testes)

### Arquitetura / infra
- Splat servido via `/api/public/tours/[tourId]/splat` (proxy presigned URL R2, expira em 1h) — nunca expor `splat_url` direto do banco para o cliente
- Cookie de tour privado: HMAC-SHA256 com `TOUR_ACCESS_SECRET`, 24h de validade, flag `Secure` em prod
- Rate-limit em memória (não Redis) — suficiente até ~1000 visitantes simultâneos por instância. Migrar para Upstash Redis quando escalar para múltiplas instâncias Vercel
- COOP `same-origin` + COEP `credentialless` habilitados em todas as rotas — a lib `@mkkellogg/gaussian-splats-3d` usa SharedArrayBuffer internamente em web workers (independente dos flags `gpuAcceleratedSort: false` e `enableSIMDInSort: false`), e SAB exige `crossOriginIsolated = true`. Sem esses headers, o worker quebra com `DataCloneError: SharedArrayBuffer transfer requires self.crossOriginIsolated` e o viewer não renderiza.
  - **Histórico:** a auditoria de 2026-05-10 removeu COEP por entender erradamente que o viewer não usava SAB. Em 2026-05-11, durante validação E2E do item [3], o agente IA reintroduziu COEP `require-corp`; depois foi removido novamente por análise estática equivocada; e finalmente reintroduzido como `credentialless` ao confirmar o erro real no browser. **Conclusão:** o viewer DEPENDE de SAB. Não remover.
  - **Por que `credentialless` e não `require-corp`:** `credentialless` permite recursos cross-origin sem exigir header `Cross-Origin-Resource-Policy` explícito em cada um (R2, Vercel Analytics, etc), contanto que carreguem sem credenciais. Para conteúdo público com auth na URL (presigned URLs R2), funciona naturalmente. Suporte: Chrome/Edge 96+, Firefox 110+, Safari 17.4+.
  - **Implicação pro item [8]:** R2 privado via proxy continua funcionando (mesmo origin, sem cross-origin afetada). Embed em iframe de terceiros (corretor/imobiliária) pode precisar ajuste de COOP — avaliar quando o caso aparecer.
- R2 público hoje (privatização documentada no item [8])
- Service role do Supabase usado em todas as rotas API públicas — RLS é defesa em profundidade, não a primeira linha. Nenhum cliente browser bate direto na tabela `tours` ou `imobiliarias`
- Coluna `splat_url` no banco é legado (proxy ignora). Drop em migration futura junto com `luma_*` (capture_slug, status, submitted_at, completed_at, cost_credits, cost_usd) e a tabela `luma_processing_log`
- Validação de `r2Key` no finalize (modo `r2Key`) usa regex case-insensitive `[a-fA-F0-9-]+` no UUID. UUIDs colados em maiúsculas (Windows clipboard) precisam ser aceitos. **Não normalizar pra minúsculas no banco** — o R2 é case-sensitive nas keys; tem que bater exatamente.
- `sizeBytes` enviado pelo cliente do finalize é validado pelo Zod mas **descartado** — usa `ContentLength` retornado pelo `HeadObjectCommand` do R2 como fonte da verdade. Cliente pode mentir, R2 não.
- Finalize valida que `r2Key` pertence ao `tourId` da URL (regex `^tours/<tourId>/splat/<nanoid>.<ext>$`). Sem isso, qualquer um com `PIPELINE_SERVICE_TOKEN` poderia roubar `.ksplat` de outros tours apontando pra key alheia. **Não remover** — não é dupla checagem, é defesa real contra cross-tour key injection.

### Produto
- Tour deve carregar fluido em mobile (critério inegociável do MVP) — qualquer melhoria de qualidade que regrida tempo de carregamento em mobile precisa de A/B antes de subir
- Cinematic Mode é feature paga — manter sempre opcional, nunca padrão
