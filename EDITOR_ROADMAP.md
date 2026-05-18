# EDITOR DE TOUR — ROADMAP E ESPECIFICAÇÃO COMPLETA
# Imerso — documento vivo, atualizado em 2026-05-18

> Este documento é a especificação definitiva do Editor de Tour do Imerso.
> Todo agente que tocar neste módulo deve ler este documento inteiro antes de escrever uma linha.
> Qualquer dúvida não coberta aqui deve ser resolvida com o founder antes de implementar.
> Nunca invente comportamento. Nunca assuma. Pergunte ou marque com // TODO(founder):

---

## ÍNDICE

1. [Visão geral e contexto](#1-visão-geral-e-contexto)
2. [Arquitetura e arquivos existentes](#2-arquitetura-e-arquivos-existentes)
3. [Experiência do visitante — o que deve sentir](#3-experiência-do-visitante)
4. [Comportamento da transição](#4-comportamento-da-transição)
5. [Indicadores visuais](#5-indicadores-visuais)
6. [Tipos de transição por caso de uso](#6-tipos-de-transição-por-caso-de-uso)
7. [Fluxo de configuração no editor admin](#7-fluxo-de-configuração-no-editor-admin)
8. [Parâmetros configuráveis por waypoint](#8-parâmetros-configuráveis-por-waypoint)
9. [Controles do editor](#9-controles-do-editor)
10. [Casos extremos e como tratar](#10-casos-extremos-e-como-tratar)
11. [O que muda na implementação atual](#11-o-que-muda-na-implementação-atual)
12. [Restrições operacionais](#12-restrições-operacionais)
13. [Prioridade de implementação — ordem de execução](#13-prioridade-de-implementação)
14. [Critério de aceite final](#14-critério-de-aceite-final)
15. [Status atual de implementação](#15-status-atual-de-implementação)
16. [Prompts de implementação por item](#16-prompts-de-implementação-por-item)

---

## 1. VISÃO GERAL E CONTEXTO

### O que é o Editor

O Editor é o painel central de configuração de um tour no Imerso. É uma aba dentro de
`/painel/tours/[id]` que substitui completamente a rota `/painel/tours/[id]/portas`.

O admin (founder) navega dentro do splat 3D do tour exatamente como um visitante faria,
mas com ferramentas de configuração sobrepostas — similar ao SuperSplat em filosofia de UX:
ferramentas contextuais disponíveis enquanto navega, sem sair do viewer.

### Por que existe

Cada imóvel de alto padrão pode ter 50+ waypoints conectando cômodos diferentes.
Configurar isso de forma fragmentada (tela separada, UX ruim, sem feedback visual imediato)
não escala. O editor precisa ser fluido o suficiente para configurar um imóvel completo
em uma única sessão sem fricção.

### Diferencial central do produto

A transição entre cômodos — atravessar uma porta e ser transportado para o próximo ambiente
como em um jogo — é o diferencial master do Imerso. Não existe referência no mercado hoje.
O editor é o que torna isso configurável com precisão cirúrgica.

### Quem usa

Apenas o founder (operação one-man). Não é self-service para o cliente final.
O cliente final só vê o resultado no viewer público.

---

## 2. ARQUITETURA E ARQUIVOS EXISTENTES

### Arquivos do editor (criados no Prompt 1)

```
src/
  components/
    admin/
      tour-editor/
        TourEditor.tsx          ← componente principal do editor (viewer + overlay de ferramentas)
        WaypointList.tsx        ← listagem lateral de conexões com badge de pendências
        WaypointPanel.tsx       ← painel de edição individual por waypoint
        WaypointPins.tsx        ← pins 3D no viewer do editor
        types.ts                ← tipos compartilhados do editor
  app/
    [locale]/
      painel/
        (shell)/
          tours/
            [id]/
              TourDetailClient.tsx   ← aba "Editor" adicionada aqui
              portas/
                page.tsx             ← redireciona para ?tab=editor
```

### Arquivos do viewer público (referência — não quebrar)

```
src/
  components/
    viewer/
      SplatViewer.tsx                ← NUNCA quebrar; pode alterar se gerar ganho real
      TourPublicExperience.tsx       ← orquestra todos os componentes do viewer público
      ProximityPortaTransition.tsx   ← lógica de trigger por proximidade (plano de cruzamento)
      PortaButtons.tsx               ← fallback de botões manuais (manter)
      WaypointLabels.tsx             ← legenda 3D com opacidade por distância
      LoadingScreen.tsx              ← tela de loading com logo e progress bar
      ElevationSlider.tsx            ← controle de altura da câmera
      CinematicPlayer.tsx            ← modo cinematic automático
      HotspotMarkers.tsx             ← pins de hotspots no viewer
      MiniMap.tsx                    ← minimapa 2D
      ViewerControls.tsx             ← controles flutuantes do viewer
      WhatsAppFloating.tsx           ← botão WhatsApp
      InfoPanel.tsx                  ← drawer de informações do imóvel
      ShareTourDialog.tsx            ← modal de compartilhamento
```

### Schema de banco relevante

Tabela `tour_waypoints`:
```
id                  uuid PK
tour_id             uuid FK → tours
label               text          ← nome do cômodo (vem do nome do tour de destino automaticamente)
position_x          float8        ← posição do trigger no espaço 3D
position_y          float8
position_z          float8
target_x            float8        ← câmera do lado A (câmera ao chegar vindo do tour de destino)
target_y            float8
target_z            float8
next_tour_id        uuid FK → tours nullable
next_tour_href      text nullable ← URL pública do tour de destino
next_cam_position   jsonb nullable ← {x,y,z} câmera de entrada no tour de destino (lado B)
next_cam_target     jsonb nullable ← {x,y,z} alvo da câmera de entrada no tour de destino
proximity_threshold float8 default 1.8   ← distância 3D que dispara a transição
label_distance      float8 default 3.0   ← distância em que a legenda começa a aparecer
duration_ms         int4 nullable        ← não usado no MVP de portas
```

### Tabela `tours` — campos relevantes para o editor

```
camera_up_inverted   boolean       ← obrigatório passar para SplatViewer
splat_rotation_deg   float8        ← obrigatório passar para SplatViewer
splat_url            text          ← URL do splat (proxy via /api/public/tours/[id]/splat)
camera_start_position jsonb        ← {x,y,z} posição inicial da câmera
camera_start_target   jsonb        ← {x,y,z} alvo inicial da câmera
```

### CORS e proxy do splat

**ATENÇÃO CRÍTICA:** O splat_url pode ser uma URL do R2 direta ou uma URL de proxy
`/api/public/tours/[tourId]/splat`. No contexto do painel admin (autenticado), o
SplatViewer pode falhar silenciosamente ao carregar o splat se houver problema de CORS
ou autenticação na URL. Sempre verificar no DevTools → Network se a requisição do splat
retorna 200 antes de assumir problema no código.

Se o splat não renderizar no editor:
1. Abrir DevTools → Network → filtrar por ".ksplat" ou ".ply"
2. Verificar status HTTP da requisição
3. Se 403/CORS: o editor precisa usar a URL de proxy com token admin, não a URL direta do R2
4. Se a requisição nem aparece: o splatUrl está chegando vazio no TourEditor

---

## 3. EXPERIÊNCIA DO VISITANTE

O visitante navega livremente pelo tour como em um jogo em primeira pessoa.

**Ao se aproximar de uma porta:**
- Aparece flutuando no espaço 3D um card semitransparente com o nome do cômodo à frente
- A opacidade do card aumenta gradualmente conforme o visitante se aproxima
- O card está ancorado na posição 3D do waypoint — se o visitante olhar para longe, some

**Ao cruzar o waypoint:**
- A tela faz fade gradual de 0 a 100% preto
- Se o loading ultrapassar um threshold de tempo: aparece logo do Imerso + "Carregando [Nome do Cômodo]..."
- Se o loading for rápido (abaixo do threshold): apenas o fade, sem mensagem

**Ao chegar no destino:**
- A câmera aparece em preto e revela o ambiente com fade-in controlado
- O fade-in é explícito — não depende apenas do carregamento natural dos frames do splat
- A câmera inicia na posição e ângulo exatos configurados pelo admin para aquele waypoint

**Sensação desejada:** atravessar uma porta de verdade, como em um jogo.
Não é teleporte brusco. Não é corte seco. É transição suave com senso de continuidade.

---

## 4. COMPORTAMENTO DA TRANSIÇÃO

### Modelo bidirecional

Cada waypoint é um ponto de travessia bidirecional. Não existe "entrada" ou "saída" —
existe um ponto no espaço com dois lados, cada lado com sua câmera configurada independentemente.

```
Tour A  ←→  [Waypoint]  ←→  Tour B
           /           \
    Câmera lado A    Câmera lado B
    (posição ao        (posição ao
     chegar vindo       chegar vindo
     do tour B)         do tour A)
```

### Trigger

- Detectado via cruzamento de plano (plane-crossing), não por distância simples
- O plano é perpendicular à direção do waypoint, posicionado em position_x/y/z
- `proximity_threshold` é individual por waypoint (padrão: 1.8 unidades)
- O ponto de trigger deve ser posicionado dentro do vão da porta, fora da área navegável principal
- Isso garante que o visitante precise intencionalmente atravessar, sem trigger acidental

### Anti-trigger duplo

- Cooldown de 3 segundos após carregamento do tour — impede trigger imediato se ponto de
  entrada estiver próximo de outro waypoint
- `triggeredRef` — flag que impede re-trigger na mesma sessão
- Distância de partida entre waypoint de trigger e câmera de chegada deve ser maior que
  o threshold, para que ao chegar no destino não acione imediatamente o retorno

### Decisão de arquitetura — câmera de entrada pós-waypoint (2026-05-18)

O `next_cam_position` e `next_cam_target` de um waypoint definem a câmera de entrada
**do próprio tour onde esse waypoint está**, não do tour de destino.

Ao atravessar um waypoint (ex: Quarto→Sala), o sistema passa `?from=<quarto_id>` na URL.
O tour de destino (Sala) lê seu próprio payload, busca o waypoint que tem
`next_tour_id = quarto_id`, e usa o `next_cam_position` desse waypoint como câmera inicial.

Isso garante que cada editor só configura a câmera do seu próprio espaço 3D —
coordenadas de um splat não são válidas em outro splat.

### Fallback

- Waypoint sem câmera de destino configurada: transição dispara normalmente, câmera cai
  na posição inicial padrão do splat (camera_start_position)
- Sem mensagem de erro para o visitante — experiência degradada silenciosamente

---

## 5. INDICADORES VISUAIS

### Legenda 3D (card flutuante)

- Card semitransparente flutuando no espaço 3D na posição exata do waypoint
- Conteúdo: apenas o nome do cômodo de destino (texto simples, sem ícones ou setas)
- Nome vem automaticamente do campo `titulo` do tour de destino — não é configurado separadamente
- Ancorado no espaço 3D: se o visitante olhar para longe da porta, o card some ou fica invisível
- Implementação: projeção 3D→2D usando `api.worldToScreen()`, posicionamento CSS absoluto

### Opacidade por distância

```
dist > label_distance         → opacity: 0 (invisível)
dist entre label_distance e 0 → opacity: lerp(0, 1, 1 - dist/label_distance)
```

- Múltiplos waypoints: cada um tem sua própria opacidade calculada independentemente
- O mais próximo fica mais visível; os distantes ficam mais transparentes
- `label_distance` é configurável individualmente por waypoint (separado do `proximity_threshold`)

### Fade de transição

- Overlay monta com opacity-0 e transição CSS declarada
- Após 1 frame (requestAnimationFrame): classList adiciona opacity-100
- Isso garante que o browser registre o estado inicial antes de animar
- Navegação só ocorre após FADE_DURATION_MS (600ms)

### Loading screen na transição

- Aparece APENAS se o loading ultrapassar 1500ms após onReady ser chamado
- Conteúdo: logo do Imerso (animate-pulse-soft) + "Carregando [data.tour.titulo]..."
- z-index: 9999 — acima de tudo, incluindo o overlay preto
- Timer iniciado no useLayoutEffect quando ?from= está presente
- Timer cancelado se onReady for chamado antes dos 1500ms

### Fade-in de entrada

- Ao chegar via ?from=: tela começa em preto (entryOverlayVisible = true via useLayoutEffect)
- Após onReady: setTimeout 200ms → setEntryOverlayVisible(false)
- CSS transition: opacity 600ms ease-out
- Sem ?from=: nenhum overlay de entrada (loadingOverlay normal com progress bar)

---

## 6. TIPOS DE TRANSIÇÃO POR CASO DE USO

| Situação | Comportamento |
|---|---|
| Visitante cruza o waypoint | Transição automática dispara |
| Waypoint sem câmera destino configurada | Transição dispara, câmera cai no fallback do splat |
| Waypoint visível mas não cruzado | Legenda aparece com opacidade por distância |
| Dois waypoints próximos simultaneamente | Ambas as legendas aparecem, cada uma no seu ponto 3D |
| Visitante oscila no limiar do trigger | triggeredRef impede re-trigger na mesma sessão |
| Loading < 1500ms | Apenas fade preto → reveal, sem logo de loading |
| Loading > 1500ms | Logo Imerso + "Carregando [Nome do Cômodo]..." sobre o preto |
| Acesso direto ao tour (sem ?from=) | LoadingScreen padrão com progress bar — sem overlay preto inicial |
| PortaButtons | Fallback temporário — manter até transição automática estar perfeita |

---

## 7. FLUXO DE CONFIGURAÇÃO NO EDITOR ADMIN

### Princípio geral

O admin navega dentro do splat como um visitante. As ferramentas ficam disponíveis
em overlay sobre o viewer. Tudo é configurado sem sair do viewer. Salva individualmente
em tempo real. O resultado é imediatamente visível na navegação.

### Passo a passo de configuração de um waypoint

```
TOUR A — configurando o waypoint de saída:

1. Admin abre o Editor do tour A
2. Navega até a posição exata dentro do vão da porta (onde quer o trigger)
3. Pressiona Ctrl+Click no viewer OU clica no botão "Adicionar waypoint" na interface
4. O sistema captura: posição atual da câmera (position x/y/z) E ângulo atual (target x/y/z)
5. Um painel de edição abre automaticamente com os campos do waypoint
6. Admin seleciona o tour de destino no dropdown
7. Confirma — waypoint salvo com status INCOMPLETO (falta câmera lado B)
8. Pin aparece no viewer do editor com indicador visual de INCOMPLETO

TOUR B — configurando a câmera de entrada:

9. Admin abre o Editor do tour B
10. Aparece badge de pendências no topo (WaypointList mostra pendingCount)
11. Admin clica no pin INCOMPLETO para abrir o painel daquele waypoint
12. Admin navega até a posição e ângulo EXATOS que o visitante deve ver ao chegar
13. Clica "Definir câmera de entrada aqui" — captura posição + ângulo atuais
14. Waypoint marcado como COMPLETO nos dois tours
```

### Listagem lateral de conexões

- Painel lateral no editor mostra todas as conexões configuradas do tour atual
- Status visual: COMPLETO (verde) / INCOMPLETO (laranja com badge de contagem)
- Badge de pendências desaparece quando todos os waypoints estiverem completos

---

## 8. PARÂMETROS CONFIGURÁVEIS POR WAYPOINT

| Parâmetro | Descrição | Padrão | Campo no banco |
|---|---|---|---|
| Posição do trigger | X/Y/Z capturado no Ctrl+Click | Posição ao marcar | position_x/y/z |
| Tour de destino | Dropdown de seleção | Obrigatório | next_tour_id |
| Câmera lado A | Posição+ângulo ao chegar vindo do tour B | Obrigatório p/ completo | target_x/y/z |
| Câmera lado B | Posição+ângulo ao chegar vindo do tour A | Obrigatório p/ completo | next_cam_position/target |
| Threshold de trigger | Distância 3D que dispara a transição | 1.8 unidades | proximity_threshold |
| Distância de legenda | Distância em que o card começa a aparecer | 3.0 unidades | label_distance |
| Nome da legenda | Automático — vem do titulo do tour de destino | Automático | label (gerado) |

---

## 9. CONTROLES DO EDITOR

### Navegação

| Controle | Ação |
|---|---|
| WASD | Movimento horizontal (desktop) |
| Mouse drag | Rotação da câmera |
| Scroll | Zoom / movimento para frente |
| Shift + Scroll | Controle preciso de altura da câmera |
| Joystick virtual (mobile) | Translação |

### Ações do editor

| Controle | Ação |
|---|---|
| Ctrl + Click no viewer | Marca posição+ângulo atual como waypoint |
| Click no pin do waypoint | Abre painel de edição daquele waypoint |

### Display em tempo real

- Coordenadas X/Y/Z da câmera: visíveis no canto inferior esquerdo do viewer
- Formato: `X: 0.000 Y: 0.000 Z: 0.000` (fonte monospace, fundo semitransparente)
- Atualização: a cada 200ms via setInterval lendo `api.getCameraState()`

---

## 10. CASOS EXTREMOS E COMO TRATAR

| Situação | Tratamento |
|---|---|
| Waypoint sem câmera configurada | Transição dispara, fallback natural do splat, sem erro para visitante |
| Visitante oscila no limiar do trigger | triggeredRef impede re-trigger na mesma sessão |
| Múltiplas legendas simultâneas | Cada uma no seu ponto, opacidade proporcional à distância |
| Loading abaixo do threshold de tempo | Fade acontece, mensagem de loading não aparece |
| Loading acima do threshold de tempo | Fade + logo Imerso + "Carregando [Nome do Cômodo]..." |
| splatUrl vazia no editor | Mensagem "Nenhum splat disponível. Faça o upload na aba Mídia." |
| CORS/403 ao carregar splat no editor | Ver seção 2 — diagnóstico de CORS |
| Tour de destino arquivado/deletado | Waypoint fica INCOMPLETO, dropdown de destino mostra aviso |

---

## 11. O QUE MUDA NA IMPLEMENTAÇÃO ATUAL

### Substituído completamente

- `/painel/tours/[id]/portas` — rota existe mas redireciona para `?tab=editor`

### Intocado (não mexer sem justificativa)

- Lógica de navegação do SplatViewer (WASD, joystick, drag) — qualquer alteração aqui
  requer testes extensivos em mobile
- Sistema de hotspots — não conflita com waypoints mas cuidado ao compartilhar overlay
- Sistema de analytics (track-view, track-whatsapp) — não relacionado

---

## 12. RESTRIÇÕES OPERACIONAIS

- **Agente não executa comandos** — todos entregues ao founder para rodar manualmente no PowerShell
- **Agente lê cada arquivo antes de editar** — sem exceção, sem suposição sobre conteúdo
- **Migrations de banco** — founder roda manualmente no Supabase SQL Editor
- **Novas dependências** — listar e aguardar aprovação do founder antes de adicionar ao package.json
- **PortaButtons.tsx** — manter como fallback até transição automática estar perfeita
- **NUNCA usar `any` em TypeScript** — usar `unknown` + type guard se necessário
- **NUNCA usar `dangerouslySetInnerHTML`** sem necessidade absoluta
- **Código em EN, comentários em PT-BR**

---

## 13. PRIORIDADE DE IMPLEMENTAÇÃO

Todas as fases abaixo estão concluídas. Ver seção 15 para status detalhado.

### FASE 1 — Editor base ✅ CONCLUÍDA

- Aba "Editor" em `/painel/tours/[id]`
- Viewer 3D navegável dentro do painel admin
- Coordenadas X/Y/Z em tempo real
- Redirect de `/portas` para `?tab=editor`

### FASE 2 — Ferramentas de waypoint no editor ✅ CONCLUÍDA

- Ctrl+Click para marcar waypoint + Shift+Scroll para altura
- Painel de edição por waypoint
- Listagem lateral de conexões
- Indicador COMPLETO/INCOMPLETO
- Aviso persistente de waypoints pendentes

### FASE 3 — Viewer público aprimorado ✅ CONCLUÍDA

- Legenda 3D com opacidade por distância (WaypointLabels)
- Threshold individual por waypoint (ProximityPortaTransition)
- Fade de saída suave ao cruzar waypoint
- Fade-in de entrada no destino (?from=)
- LoadingScreen suprimido em transições
- Loading condicional com logo + nome do cômodo após 1500ms

---

## 14. CRITÉRIO DE ACEITE FINAL ✅ TODOS ATENDIDOS

**Editor:**
- Admin navega dentro do splat no painel admin ✅
- Ctrl+Click marca o ponto exato ✅
- Shift+Scroll controla altura ✅
- Coordenadas X/Y/Z em tempo real ✅
- Pins de waypoints visíveis simultaneamente ✅
- Clicar em pin abre painel de edição ✅
- Listagem lateral com status COMPLETO/INCOMPLETO ✅
- Aviso de pendências aparece e some ao concluir ✅
- Salvar waypoint é imediato ✅

**Viewer público:**
- Legenda 3D com opacidade por distância ✅
- Fade suave ao cruzar waypoint ✅
- Loading condicional com logo + nome do cômodo ✅
- Fade-in de entrada na posição configurada ✅
- Sensação de atravessar uma porta ✅

---

## 15. STATUS ATUAL DE IMPLEMENTAÇÃO

Última atualização: 2026-05-18

> **ATENÇÃO AGENTE:** Tudo marcado como ✅ já está implementado e commitado no repositório.
> Não reimplementar. Não sugerir reescrever. Ler o código antes de qualquer afirmação.

| Item | Status | Observação |
|---|---|---|
| Aba Editor em /painel/tours/[id] | ✅ CONCLUÍDO | |
| Coordenadas em tempo real | ✅ CONCLUÍDO | |
| Redirect /portas → ?tab=editor | ✅ CONCLUÍDO | |
| Splat renderizando no editor | ✅ CONCLUÍDO | Bug de URL resolvido |
| Ctrl+Click para marcar waypoint | ✅ CONCLUÍDO | |
| Shift+Scroll para altura | ✅ CONCLUÍDO | |
| Painel de edição por waypoint | ✅ CONCLUÍDO | |
| Listagem lateral de conexões | ✅ CONCLUÍDO | |
| Indicador COMPLETO/INCOMPLETO | ✅ CONCLUÍDO | |
| Câmera de entrada configurável | ✅ CONCLUÍDO | Botão "Definir câmera de entrada aqui" no editor |
| Display de coordenadas da câmera de entrada | ✅ CONCLUÍDO | Mostra X/Y/Z no painel após salvar |
| Upsert de waypoint (evita duplicata) | ✅ CONCLUÍDO | Atualiza se já existe waypoint entre os dois tours |
| Transição automática entre tours (plane-crossing) | ✅ CONCLUÍDO | ProximityPortaTransition com detecção de plano |
| Legenda 3D com opacidade por distância | ✅ CONCLUÍDO | WaypointLabels com label_distance por waypoint |
| Threshold individual por waypoint | ✅ CONCLUÍDO | proximity_threshold no banco por waypoint |
| Câmera de entrada aplicada corretamente no destino | ✅ CONCLUÍDO | next_cam_position do waypoint do tour de destino via ?from= |
| Aviso de pendências por tour | ✅ CONCLUÍDO | Badge laranja com contagem em WaypointList; pendingCount calculado no TourEditor |
| FPS overlay de diagnóstico | ✅ REMOVIDO | Era visível em produção; removido de SplatViewer.tsx em 2026-05-18 |
| Pastas Luma mortas | ✅ REMOVIDO | src/app/api/admin/tours/[id]/luma removida em 2026-05-18 |
| Fade de saída ao cruzar waypoint | ✅ CONCLUÍDO | opacity-0 → opacity-100 via rAF; navegação só após FADE_DURATION_MS (600ms) |
| Fade-in de entrada no destino (?from=) | ✅ CONCLUÍDO | Overlay preto via useLayoutEffect; fade-out em 600ms após onReady |
| LoadingScreen suprimido em transições | ✅ CONCLUÍDO | loadingOverlay inicia como !cameFromRef.current; visitante direto não é afetado |
| Loading condicional com logo + nome do cômodo | ✅ CONCLUÍDO | Timer 1500ms no useLayoutEffect; showTransitionLoading exibe logo Imerso + data.tour.titulo |
| CORS Cloudflare R2 | ✅ CONFIRMADO | Verificado via DevTools Network — Access-Control-Allow-Origin presente |
| R2 privado (sem URLs diretas expostas) | ✅ CONFIRMADO | r2PublicUrl() existe mas não é chamada; tudo via presigned URL com proxy |

---

## 16. PROMPTS DE IMPLEMENTAÇÃO — HISTÓRICO COMPLETO

Todos os prompts abaixo foram gerados e executados. O código correspondente está commitado.
Não gerar novamente. Não reimplementar.

| Prompt | Descrição | Status |
|---|---|---|
| Prompt 1 | Editor unificado — aba em /painel/tours/[id], viewer navegável, coordenadas em tempo real | ✅ CONCLUÍDO |
| Bug Fix 1 | Splat não renderizava no editor — URL de proxy vs URL direta do R2 | ✅ CONCLUÍDO |
| Prompt 2 | Ctrl+Click para marcar waypoint + Shift+Scroll para altura | ✅ CONCLUÍDO |
| Prompt 3 | Painel de edição por waypoint + listagem lateral + indicadores COMPLETO/INCOMPLETO + aviso de pendências | ✅ CONCLUÍDO |
| Prompt 4 | Legenda 3D com opacidade por distância + threshold individual por waypoint | ✅ CONCLUÍDO |
| Limpeza 1 | FPS overlay removido de SplatViewer.tsx | ✅ CONCLUÍDO |
| Limpeza 2 | Pastas Luma mortas removidas | ✅ CONCLUÍDO |
| Prompt 5 | Fade de saída suave (rAF) + fade-in de entrada (?from=) + LoadingScreen suprimido em transições | ✅ CONCLUÍDO |
| Prompt 5b | Loading condicional com logo Imerso + nome do cômodo após 1500ms | ✅ CONCLUÍDO |
