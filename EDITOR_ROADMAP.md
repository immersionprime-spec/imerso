# EDITOR DE TOUR — ROADMAP E ESPECIFICAÇÃO COMPLETA
# Imerso — documento vivo, atualizado em 2026-05-17

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
      TourPublicExperience.tsx       ← referência de como instanciar o viewer
      ProximityPortaTransition.tsx   ← lógica de trigger por proximidade (será refatorada)
      PortaButtons.tsx               ← fallback de botões manuais (manter por ora)
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
splat_url            text          ← URL do splat (pode ser proxy ou direta)
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

- Dispara quando `dist3d(câmera, waypoint_position) < proximity_threshold`
- `proximity_threshold` é individual por waypoint (padrão: 1.8 unidades)
- O ponto de trigger deve ser posicionado dentro do vão da porta, fora da área navegável principal
- Isso garante que o visitante precise intencionalmente atravessar, sem trigger acidental

### Anti-trigger duplo

- Cooldown de 3 segundos após carregamento do tour — impede trigger imediato se ponto de
  entrada estiver próximo de outro waypoint
- `triggeredRef` — flag que impede re-trigger na mesma sessão
- Distância de partida entre waypoint de trigger e câmera de chegada deve ser maior que
  o threshold, para que ao chegar no destino não acione imediatamente o retorno

### Fallback

- Waypoint sem câmera de destino configurada: transição dispara normalmente, câmera cai
  na posição inicial padrão do splat (fitCameraToSplat)
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

- Fade gradual de 0 a 100% preto ao cruzar o waypoint
- Duração do fade é proporcional ao tempo de loading — não ultrapassa nem excede o carregamento
- Implementação: overlay `position: fixed; inset: 0; background: #000` com CSS transition

### Loading screen

- Aparece APENAS se o loading ultrapassar um threshold de tempo (evitar flash desnecessário)
- Conteúdo: logo do Imerso + "Carregando [Nome do Cômodo]..."
- Nome do cômodo é o `titulo` do tour de destino

### Fade-in de entrada

- Ao chegar no destino, câmera inicia em preto e revela o ambiente
- Fade-in explícito via overlay que vai de opacity 1 → 0
- Não depende apenas do carregamento natural dos splat frames

---

## 6. TIPOS DE TRANSIÇÃO POR CASO DE USO

| Situação | Comportamento |
|---|---|
| Visitante cruza o waypoint | Transição automática dispara |
| Waypoint sem câmera destino configurada | Transição dispara, câmera cai no fallback do splat |
| Waypoint visível mas não cruzado | Legenda aparece com opacidade por distância |
| Dois waypoints próximos simultaneamente | Ambas as legendas aparecem, cada uma no seu ponto 3D |
| Visitante oscila no limiar do trigger | Cooldown pós-carregamento impede re-trigger |
| Visitante cruza em movimento rápido | Indiferente — trigger dispara independente da velocidade |
| Visitante no mobile | Threshold individual por waypoint permite compensar imprecisão — admin ajusta após testes |
| PortaButtons | Fallback temporário — manter até transição automática estar perfeita |

---

## 7. FLUXO DE CONFIGURAÇÃO NO EDITOR ADMIN

### Princípio geral

O admin navega dentro do splat como um visitante. As ferramentas ficam disponíveis
em overlay sobre o viewer. Tudo é configurado sem sair do viewer. Salva individualmente
em tempo real. O resultado é imediatamente visível na navegação (admin e visitante
coexistem sem bloqueio).

### Passo a passo de configuração de um waypoint

```
TOUR A — configurando o waypoint de saída:

1. Admin abre o Editor do tour A
2. Navega até a posição exata dentro do vão da porta (onde quer o trigger)
3. Pressiona Ctrl+Click no viewer OU clica no botão "Adicionar waypoint" na interface
4. O sistema captura: posição atual da câmera (position x/y/z) E ângulo atual (target x/y/z)
   EXATAMENTE onde o admin estava — sem dialog de confirmação, captura imediata
5. Um painel de edição abre automaticamente com os campos do waypoint
6. Admin seleciona o tour de destino no dropdown (lista todos os tours do mesmo imóvel/imobiliária)
7. Confirma — waypoint salvo com status INCOMPLETO (falta câmera lado B)
8. Pin aparece no viewer do editor com indicador visual de INCOMPLETO (cor diferente, ícone de aviso)

TOUR B — configurando a câmera de entrada:

9. Admin abre o Editor do tour B
10. Aparece aviso persistente no topo: "Este tour tem X waypoints aguardando configuração"
    (aviso não some até todos estarem configurados)
11. Admin clica no aviso OU no pin INCOMPLETO para abrir o painel daquele waypoint
12. Admin navega até a posição e ângulo EXATOS que o visitante deve ver ao chegar pelo waypoint
    (onde estaria saindo da porta, olhando para dentro do cômodo)
13. Clica "Definir câmera de entrada" — captura posição + ângulo atuais como câmera do lado B
14. Sistema automaticamente pergunta: "Definir câmera de retorno?"
    (posição que o visitante vê ao voltar pelo mesmo waypoint em direção ao tour A)
15. Admin navega para a posição de retorno e confirma
16. Waypoint marcado como COMPLETO nos dois tours
17. Aviso some do tour B
18. Pin no viewer do editor passa para indicador visual de COMPLETO
```

### Navegação entre tours no editor

- O editor carrega UM tour por vez — não dois simultâneos
- Para configurar o lado B, o admin simplesmente fecha o editor do tour A e abre o editor do tour B
- O sistema rastreia quais waypoints estão pendentes de configuração por tour
- Ao abrir o editor de qualquer tour, o aviso de pendências aparece automaticamente se houver

### Listagem lateral de conexões

- Painel lateral no editor mostra todas as conexões configuradas do tour atual
- Formato: "Sala → Cozinha" / "Cozinha → Sala" (bidirecional, ambas aparecem)
- Clicando em uma conexão: o viewer teleporta para o waypoint correspondente (câmera de entrada configurada)
- Status visual: COMPLETO (verde) / INCOMPLETO (amarelo/laranja)

---

## 8. PARÂMETROS CONFIGURÁVEIS POR WAYPOINT

Todos os parâmetros ficam no painel de edição que abre ao clicar no pin do waypoint.
Todos salvam individualmente em tempo real (sem botão "salvar tudo").

| Parâmetro | Descrição | Padrão | Campo no banco |
|---|---|---|---|
| Posição do trigger | X/Y/Z capturado no Ctrl+Click | Posição ao marcar | position_x/y/z |
| Tour de destino | Dropdown de seleção | Obrigatório | next_tour_id |
| Câmera lado A | Posição+ângulo ao chegar vindo do tour B | Obrigatório p/ completo | target_x/y/z |
| Câmera lado B | Posição+ângulo ao chegar vindo do tour A | Obrigatório p/ completo | next_cam_position/target |
| Threshold de trigger | Distância 3D que dispara a transição | 1.8 unidades | proximity_threshold |
| Distância de legenda | Distância em que o card começa a aparecer | 3.0 unidades | label_distance |
| Nome da legenda | Automático — vem do titulo do tour de destino | Automático | label (gerado) |

### O que NÃO é configurável por waypoint

- Nome da legenda: sempre vem do `titulo` do tour de destino — não há campo separado
- Direção (entrada/saída): não existe essa distinção — é sempre bidirecional
- Visibilidade: o waypoint sempre aparece no viewer público se existir no banco

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
| Drag direito da tela (mobile) | Rotação |

### Ações do editor

| Controle | Ação |
|---|---|
| Ctrl + Click no viewer | Marca posição+ângulo atual como waypoint |
| Click no pin do waypoint | Abre painel de edição daquele waypoint |
| Click na conexão na lista lateral | Teleporta câmera para o waypoint |

### Display em tempo real

- Coordenadas X/Y/Z da câmera: visíveis no canto inferior esquerdo do viewer
- Formato: `X: 0.000 Y: 0.000 Z: 0.000` (fonte monospace, fundo semitransparente)
- Atualização: a cada 200ms via setInterval lendo `api.getCameraState()`
- Todos os pins de waypoints do tour visíveis simultaneamente no viewer

### Feedback visual de pins

| Estado | Visual |
|---|---|
| COMPLETO | Pin verde com nome do cômodo |
| INCOMPLETO — falta câmera lado B | Pin laranja com ícone de aviso |
| INCOMPLETO — falta câmera lado A | Pin vermelho com ícone de aviso |
| Selecionado (painel aberto) | Pin destacado/pulsando |

---

## 10. CASOS EXTREMOS E COMO TRATAR

| Situação | Tratamento |
|---|---|
| Waypoint sem câmera configurada | Transição dispara, fallback natural do splat, sem erro para visitante |
| Visitante oscila no limiar do trigger | Cooldown de 3s pós-carregamento impede re-trigger |
| Visitante cruza em movimento rápido | Indiferente — trigger dispara independente da velocidade |
| Múltiplas legendas simultâneas | Cada uma no seu ponto, opacidade proporcional à distância |
| Loading abaixo do threshold de tempo | Fade acontece, mensagem de loading não aparece |
| Loading acima do threshold de tempo | Fade + logo Imerso + "Carregando [Nome do Cômodo]..." |
| Admin edita enquanto visitante navega | Coexistem sem bloqueio — edição em tempo real |
| Waypoint incompleto no viewer público | Legenda aparece normalmente, transição usa fallback |
| Waypoint incompleto no editor admin | Pin com indicador diferenciado + aviso persistente no tour de destino |
| splatUrl vazia no editor | Mensagem "Nenhum splat disponível. Faça o upload na aba Mídia." |
| CORS/403 ao carregar splat no editor | Ver seção 2 — diagnóstico de CORS; pode precisar de URL de proxy |
| Tour de destino arquivado/deletado | Waypoint fica INCOMPLETO, dropdown de destino mostra aviso |

---

## 11. O QUE MUDA NA IMPLEMENTAÇÃO ATUAL

### Substituído completamente

- `/painel/tours/[id]/portas` — rota existe mas redireciona para `?tab=editor`
  (rota mantida para não quebrar links antigos)
- Sistema de configuração anterior de waypoints — UX descartada, refeita do zero no editor

### Alterado (em progresso)

- `ProximityPortaTransition.tsx` — threshold deve ser individual por waypoint (não global)
  Hoje usa constante global `PROXIMITY_THRESHOLD = 1.8` — precisa ler do banco por waypoint
- Legenda dos waypoints no viewer público — hoje não existe como card 3D com opacidade
  por distância; precisa ser implementada
- Fade de transição — hoje fixo em 600ms; precisa ser sincronizado com tempo real de loading
- Loading screen — hoje não existe condicional por threshold; precisa ser adicionada

### Adicionado (em progresso)

- Editor unificado em aba dentro de `/painel/tours/[id]` ✅ (Prompt 1 concluído)
- Coordenadas numéricas em tempo real no editor ✅ (Prompt 1 concluído)
- Ctrl+Click para marcar waypoint (Prompt 2 — pendente)
- Shift+Scroll para controle de altura (Prompt 2 — pendente)
- Painel de edição por waypoint (Prompt 3 — pendente)
- Indicador visual COMPLETO vs INCOMPLETO nos pins (Prompt 3 — pendente)
- Aviso persistente de waypoints pendentes (Prompt 3 — pendente)
- Listagem lateral de conexões (Prompt 3 — pendente)
- Legenda 3D ancorada com opacidade por distância no viewer público (Prompt 4 — pendente)
- Fade sincronizado com loading (Prompt 5 — pendente)
- Loading screen condicional com logo Imerso (Prompt 5 — pendente)

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
- **Qualquer arquivo pode ser alterado** se gerar ganho real — incluindo SplatViewer.tsx —
  mas toda alteração deve ser justificada antes de executar
- **NUNCA usar `any` em TypeScript** — usar `unknown` + type guard se necessário
- **NUNCA usar `dangerouslySetInnerHTML`** sem necessidade absoluta
- **Código em EN, comentários em PT-BR**

---

## 13. PRIORIDADE DE IMPLEMENTAÇÃO

Ordem exata de execução. Não pular item. Não implementar item futuro antes do atual.

### FASE 1 — Editor base (concluída)

**[DONE] Prompt 1 — Editor unificado: aba no tour**
- Aba "Editor" em `/painel/tours/[id]`
- Viewer 3D navegável dentro do painel admin
- Coordenadas X/Y/Z em tempo real
- Redirect de `/portas` para `?tab=editor`

**[BLOQUEADO] Bug — Splat não renderiza no editor**
- Viewer monta (60fps visível), coordenadas travadas em posição inicial (0,0,-5)
- Indica que addSplatScene falha silenciosamente
- Diagnóstico necessário: verificar Network tab no DevTools — status HTTP da requisição do splat
- Possível causa: CORS ou autenticação na URL do R2 no contexto do painel admin
- RESOLVER ANTES de continuar para o Prompt 2

### FASE 2 — Ferramentas de waypoint no editor

**Prompt 2 — Ctrl+Click para marcar waypoint**
- Captura posição + ângulo exatos ao pressionar Ctrl+Click no viewer
- Botão alternativo na interface
- Shift+Scroll para controle preciso de altura
- Painel de edição abre automaticamente após marcar

**Prompt 3 — Painel de edição e listagem de waypoints**
- Painel lateral com lista de todas as conexões do tour
- Painel de edição individual ao clicar no pin
- Todos os campos: tour de destino, threshold, label_distance, câmeras lado A e B
- Salvo individualmente em tempo real
- Indicador visual COMPLETO vs INCOMPLETO
- Aviso persistente de waypoints pendentes no topo do editor

### FASE 3 — Viewer público aprimorado

**Prompt 4 — Legenda 3D com opacidade por distância**
- Refatorar componente de legenda dos waypoints no viewer público
- Card semitransparente ancorado no espaço 3D via worldToScreen
- Opacidade proporcional à distância — usa `label_distance` do banco por waypoint
- Threshold de trigger individual por waypoint — refatorar ProximityPortaTransition.tsx

**Prompt 5 — Fade e loading screen**
- Fade de transição sincronizado com tempo real de loading
- Loading screen condicional com logo Imerso + nome do cômodo
- Fade-in explícito de entrada no destino

### FUTURO (não implementar agora)

- Duplicação de configuração entre imóveis com planta similar
- Qualquer expansão de funcionalidades além do escopo acima
- Interface admin configurável para threshold global por imóvel

---

## 14. CRITÉRIO DE ACEITE FINAL

A implementação está correta quando:

**Editor:**
- Admin navega dentro do splat no painel admin sem diferença perceptível do viewer público
- Ctrl+Click marca o ponto exato onde o admin está (posição + ângulo)
- Shift+Scroll controla altura com precisão
- Coordenadas X/Y/Z atualizam em tempo real durante navegação
- Todos os pins de waypoints do tour são visíveis simultaneamente no editor
- Clicar em um pin abre o painel de edição daquele waypoint
- Painel lateral lista todas as conexões — "Sala → Cozinha" — com status COMPLETO/INCOMPLETO
- Aviso de waypoints pendentes aparece automaticamente e some ao concluir
- Salvar um waypoint é imediato — sem loading, sem reload da página

**Viewer público:**
- Visitante navega em direção à porta e vê o nome do cômodo aparecer gradualmente no espaço 3D
- Card de legenda tem opacidade proporcional à distância — mais próximo = mais visível
- Ao cruzar o waypoint, tela escurece suavemente
- Se loading for lento: logo Imerso + "Carregando [Nome do Cômodo]..." aparecem
- Destino revela com fade-in na posição e ângulo exatos configurados
- A sensação é de atravessar uma porta em um jogo — sem corte brusco, sem tela em branco

**Escala:**
- Um imóvel com 50 waypoints é configurável em uma única sessão sem fricção
- Admin consegue localizar qualquer waypoint pelo viewer ou pela lista lateral
- Configurar um novo waypoint do zero até COMPLETO leva menos de 2 minutos

---

## 15. STATUS ATUAL DE IMPLEMENTAÇÃO

Última atualização: 2026-05-17

| Item | Status | Observação |
|---|---|---|
| Aba Editor em /painel/tours/[id] | ✅ CONCLUÍDO | Prompt 1 |
| Coordenadas em tempo real | ✅ CONCLUÍDO | Prompt 1 |
| Redirect /portas → ?tab=editor | ✅ CONCLUÍDO | Prompt 1 |
| Splat renderizando no editor | ❌ BLOQUEADO | Ver seção 2 — bug de CORS/URL |
| Ctrl+Click para marcar waypoint | ⏳ PENDENTE | Aguarda resolução do bug acima |
| Shift+Scroll para altura | ⏳ PENDENTE | Aguarda resolução do bug acima |
| Painel de edição por waypoint | ⏳ PENDENTE | Prompt 3 |
| Listagem lateral de conexões | ⏳ PENDENTE | Prompt 3 |
| Indicador COMPLETO/INCOMPLETO | ⏳ PENDENTE | Prompt 3 |
| Aviso de pendências por tour | ⏳ PENDENTE | Prompt 3 |
| Legenda 3D com opacidade | ⏳ PENDENTE | Prompt 4 |
| Threshold individual por waypoint | ⏳ PENDENTE | Prompt 4 |
| Fade sincronizado com loading | ⏳ PENDENTE | Prompt 5 |
| Loading screen condicional | ⏳ PENDENTE | Prompt 5 |
| Fade-in explícito de entrada | ⏳ PENDENTE | Prompt 5 |

---

## 16. PROMPTS DE IMPLEMENTAÇÃO POR ITEM

Os prompts detalhados para o Cursor Agent estão sendo gerados progressivamente
durante a sessão de implementação. Cada prompt é cirúrgico — especifica exatamente
quais arquivos ler, o que alterar, e o critério de aceite.

Prompts gerados até agora:
- Prompt 1 — Editor unificado (CONCLUÍDO)
- Correção Bug 1 — Splat não renderiza (GERADO — aguarda diagnóstico do founder)

Próximos a gerar após resolução do bug:
- Prompt 2 — Ctrl+Click + Shift+Scroll
- Prompt 3 — Painel de edição + listagem + indicadores
- Prompt 4 — Legenda 3D + threshold individual
- Prompt 5 — Fade + loading screen
