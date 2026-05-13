# 🏛️ IMERSO — PROMPT MASTER PARA CURSOR IDE

> Este documento é o **blueprint executável completo** da aplicação Imerso.
> Você (Cursor Agent) deve construir a aplicação seguindo este documento à risca, **sem inventar nada que não esteja especificado** e **sem omitir nada que esteja especificado**. Quando houver ambiguidade, escolha a opção mais simples e segura, e deixe um comentário `// TODO(founder):` explicando.

---

## 📑 ÍNDICE

0. [Como usar este documento](#0-como-usar-este-documento)
1. [Visão do produto](#1-visão-do-produto)
2. [Stack técnica (versões fixas)](#2-stack-técnica-versões-fixas)
3. [Identidade visual — Imerso](#3-identidade-visual--imerso)
4. [Estrutura de pastas](#4-estrutura-de-pastas)
5. [Variáveis de ambiente](#5-variáveis-de-ambiente)
6. [Schema Supabase](#6-schema-supabase)
7. [RLS Policies](#7-rls-policies)
8. [Triggers e funções SQL](#8-triggers-e-funções-sql)
9. [Setup inicial do projeto](#9-setup-inicial-do-projeto)
10. [i18n (PT/EN/ES)](#10-i18n-ptenes)
11. [Auth e roles](#11-auth-e-roles)
12. [Cloudflare R2 (multipart)](#12-cloudflare-r2-multipart)
13. [Luma AI integration](#13-luma-ai-integration)
14. [Viewer 3D (Gaussian Splatting)](#14-viewer-3d-gaussian-splatting)
15. [Rotas da aplicação](#15-rotas-da-aplicação)
16. [API Routes (contratos TypeScript)](#16-api-routes-contratos-typescript)
17. [Páginas e fluxos detalhados](#17-páginas-e-fluxos-detalhados)
18. [Design System](#18-design-system)
19. [Regras de negócio](#19-regras-de-negócio)
20. [SEO e OG dinâmico](#20-seo-e-og-dinâmico)
21. [LGPD](#21-lgpd)
22. [Analytics e métricas](#22-analytics-e-métricas)
23. [Ordem de implementação](#23-ordem-de-implementação)
24. [Critérios de aceite](#24-critérios-de-aceite)
25. [Roadmap V2](#25-roadmap-v2)

---

## 0. Como usar este documento

**Você é um agente de IA dentro do Cursor IDE.** Sua missão é construir a aplicação **Imerso** do zero seguindo este blueprint.

### Regras de ouro

1. **Nunca invente requisitos** — se não está aqui, pergunte antes ou marque com `// TODO(founder):`
2. **Sempre prefira edição cirúrgica** sobre reescritas grandes
3. **Sempre leia o arquivo antes de editar**
4. **Pare e pergunte** antes de qualquer ação que possa quebrar funcionalidade existente
5. **NUNCA execute `npm run dev` automaticamente** — sempre entregue o comando para o founder rodar manualmente no PowerShell
6. **NUNCA exponha secrets em commits** — `.env.local` deve estar no `.gitignore`
7. **Sempre use TypeScript estrito** (`"strict": true`)
8. **Sempre valide entrada com Zod** em rotas API
9. **Sempre use Server Components** por padrão; Client Components só quando necessário (interatividade, hooks, viewer 3D)
10. **Comentários em PT-BR**, código em EN

### Convenções de código

- **Arquivos**: `kebab-case.tsx` para páginas, `PascalCase.tsx` para componentes
- **Componentes**: PascalCase
- **Hooks**: `useCamelCase`
- **Constantes**: `SCREAMING_SNAKE_CASE`
- **Tipos**: `PascalCase` (interfaces preferidas para shapes de dados, types para unions)
- **Imports**: usar alias `@/` para `src/`
- **Props**: tipo dedicado `interface XProps {}`
- **Server Actions**: arquivo `actions.ts` ao lado da página

---

## 1. Visão do produto

### O que é

**Imerso** é uma plataforma SaaS B2B brasileira que transforma vídeos de celular em **tours virtuais 3D fotorrealistas** (Gaussian Splatting), navegáveis no browser sem app, sem VR, sem hardware especial. Voltada para imobiliárias, corretores, Airbnb, espaços de eventos e concessionárias.

### Modelo de negócio (MVP)

- **Serviço gerenciado**: o founder (Sheik / GlobalLanding) e equipe captam o vídeo, processam, montam o tour e entregam o link.
- **Pagamento manual** via Mercado Pago (presencial em Balneário Camboriú/SC).
- **Sem self-service** no MVP. Cliente solicita → equipe filma/processa → entrega link.
- **Plus pago**: tour com Cinematic Mode (auto-tour com câmera animada).

### Diferencial competitivo

- Concorrente: **Matterport** (~US$ 500/mês + hardware US$ 3k, inacessível BR).
- Imerso: celular + R$ 300-800 por scan inicial, sem hardware.

### Públicos do produto

| Persona | Acesso | O que faz |
|---|---|---|
| **Super Admin** (Sheik) | Login `/painel` | Cria imobiliárias, corretores, tours; sobe vídeos; processa via Luma; gerencia hotspots/waypoints; vê todas as métricas; gerencia leads |
| **Imobiliária com login** (5+ tours, ativada manualmente) | Login `/cliente` | Vê galeria privada de seus tours; copia links; vê métricas (views + cliques WhatsApp); marca status (disponível/reservado/vendido) |
| **Imobiliária sem login** (< 5 tours) | Sem login | Recebe links por WhatsApp do Sheik e encaminha para clientes |
| **Visitante público** | Sem login | Acessa landing, galeria pública da imobiliária, viewer do tour. Pode preencher formulário de lead. Pode clicar no WhatsApp do corretor dentro do viewer. |

### Fluxo principal end-to-end

```
1. Cliente solicita tour (formulário landing OU WhatsApp direto)
2. Lead cai no painel admin
3. Sheik fecha venda presencial (Mercado Pago manual)
4. Sheik ou equipe captura vídeo do imóvel
5. Sheik cria registro no painel: imobiliária + corretor + tour
6. Sheik faz upload do vídeo no painel (multipart R2, chunks 10MB)
7. Backend envia URL R2 para Luma AI processar
8. Sheik acompanha status na Luma (manualmente nesse início)
9. Quando pronto, Sheik baixa .splat e sobe pelo painel (ou cola URL)
10. Sheik adiciona metadados (foto capa, valor, descrição, hotspots)
11. Tour fica disponível em /[imobiliaria]/[tour]
12. Sheik manda link via WhatsApp para imobiliária
13. Imobiliária encaminha para clientes interessados
14. Visitante navega, clica no WhatsApp → fala com corretor
```

### Critério inegociável de sucesso do MVP

> **O tour deve carregar e rodar fluido pelo link público do slug, sem erro, em mobile e desktop, com qualidade visual fotorrealista.**

Tudo o resto é secundário. Performance, fluidez e ausência de erros no viewer são prioridade absoluta.

---

## 2. Stack técnica (versões fixas)

### Core

| Tecnologia | Versão | Razão |
|---|---|---|
| Node.js | ≥ 20.18.0 LTS | Estável, suportado pela Vercel |
| Next.js | ^15.1.0 | App Router, RSC, Server Actions |
| React | ^19.0.0 | Acompanha Next 15 |
| TypeScript | ^5.7.0 | strict mode |
| Tailwind CSS | ^3.4.17 | Estável, vasta compatibilidade |

### Backend / Database

| Tecnologia | Versão | Uso |
|---|---|---|
| @supabase/supabase-js | ^2.47.10 | Client Supabase |
| @supabase/ssr | ^0.5.2 | Cookies SSR |
| @aws-sdk/client-s3 | ^3.717.0 | R2 (S3-compatible) |
| @aws-sdk/s3-request-presigner | ^3.717.0 | Presigned URLs |
| @aws-sdk/lib-storage | ^3.717.0 | Multipart upload |
| zod | ^3.24.1 | Validação de schemas |

### 3D / Viewer

| Tecnologia | Versão | Uso |
|---|---|---|
| three | ^0.171.0 | Engine 3D |
| @mkkellogg/gaussian-splats-3d | ^0.4.7 | Renderer Gaussian Splatting |

### UI / Forms

| Tecnologia | Versão | Uso |
|---|---|---|
| react-hook-form | ^7.54.2 | Forms |
| @hookform/resolvers | ^3.10.0 | Integração Zod |
| lucide-react | ^0.469.0 | Ícones |
| sonner | ^1.7.1 | Toasts |
| class-variance-authority | ^0.7.1 | Variants de componentes |
| clsx | ^2.1.1 | Class merging |
| tailwind-merge | ^2.6.0 | Tailwind class merging |
| @radix-ui/react-dialog | ^1.1.4 | Modais |
| @radix-ui/react-dropdown-menu | ^2.1.4 | Menus |
| @radix-ui/react-tabs | ^1.1.2 | Tabs |
| @radix-ui/react-select | ^2.1.4 | Selects |
| @radix-ui/react-slider | ^1.2.2 | Slider |
| @radix-ui/react-progress | ^1.1.1 | Progress bar |
| @radix-ui/react-tooltip | ^1.1.6 | Tooltips |
| @radix-ui/react-label | ^2.1.1 | Labels |

### i18n / Utils

| Tecnologia | Versão | Uso |
|---|---|---|
| next-intl | ^3.26.3 | i18n PT/EN/ES |
| date-fns | ^4.1.0 | Datas |
| bcryptjs | ^2.4.3 | Hash de senha de tour privado |
| @types/bcryptjs | ^2.4.6 | Types |
| @vercel/og | ^0.6.5 | OG images dinâmicas |
| recharts | ^2.15.0 | Gráficos do dashboard |
| nanoid | ^5.0.9 | IDs curtos |

### Dev Dependencies

| Tecnologia | Versão | Uso |
|---|---|---|
| eslint | ^9.17.0 | Linting |
| eslint-config-next | ^15.1.0 | Regras Next |
| prettier | ^3.4.2 | Formatação |
| prettier-plugin-tailwindcss | ^0.6.9 | Ordenação classes |
| @types/node | ^22.10.5 | Types Node |
| @types/react | ^19.0.4 | Types React |
| @types/react-dom | ^19.0.2 | Types React DOM |
| supabase | ^2.0.0 | CLI Supabase (gerar tipos) |

### Comando único de instalação inicial

```powershell
npx create-next-app@15.1.0 imerso --typescript --tailwind --app --src-dir --import-alias "@/*" --no-eslint
cd imerso
npm install @supabase/supabase-js@^2.47.10 @supabase/ssr@^0.5.2 @aws-sdk/client-s3@^3.717.0 @aws-sdk/s3-request-presigner@^3.717.0 @aws-sdk/lib-storage@^3.717.0 zod@^3.24.1 three@^0.171.0 @mkkellogg/gaussian-splats-3d@^0.4.7 react-hook-form@^7.54.2 @hookform/resolvers@^3.10.0 lucide-react@^0.469.0 sonner@^1.7.1 class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^2.6.0 next-intl@^3.26.3 date-fns@^4.1.0 bcryptjs@^2.4.3 @vercel/og@^0.6.5 recharts@^2.15.0 nanoid@^5.0.9 @radix-ui/react-dialog@^1.1.4 @radix-ui/react-dropdown-menu@^2.1.4 @radix-ui/react-tabs@^1.1.2 @radix-ui/react-select@^2.1.4 @radix-ui/react-slider@^1.2.2 @radix-ui/react-progress@^1.1.1 @radix-ui/react-tooltip@^1.1.6 @radix-ui/react-label@^2.1.1
npm install -D eslint@^9.17.0 eslint-config-next@^15.1.0 prettier@^3.4.2 prettier-plugin-tailwindcss@^0.6.9 @types/bcryptjs@^2.4.6
```

> **NÃO RODE este comando.** Entregue para o founder rodar no PowerShell.

---

## 3. Identidade visual — Imerso

### Conceito

> **"Imersão Sofisticada"** — profundidade do mar (BC frente-mar) + premium imobiliário + toque tech moderno.

### Paleta de cores

```css
/* tailwind.config.ts → theme.extend.colors */

--background:        #0A0E1A   /* azul-noite quase preto */
--surface:           #0F1729   /* azul-marinho profundo */
--surface-elevated:  #1A2440   /* surface +1 */
--surface-hover:     #1E2A47

--primary:           #4F8EF7   /* azul Imerso */
--primary-hover:     #6BA0F9
--primary-foreground:#FFFFFF

--accent:            #D4A574   /* champagne premium */
--accent-hover:      #E0B589

--text-primary:      #F5F2EC   /* off-white quente */
--text-secondary:    #A8B2C7
--text-muted:        #6B7A99

--border:            #1E2A47
--border-strong:     #2A3856

--success:           #10B981
--warning:           #F59E0B
--error:             #EF4444
--info:              #3B82F6

/* Glass / overlay */
--glass:             rgba(15, 23, 41, 0.7)
--overlay:           rgba(10, 14, 26, 0.85)
```

### Tipografia

```css
/* Fraunces — display, serif moderna, calorosa (Google Fonts) */
font-display: "Fraunces", Georgia, serif;

/* Geist — sans moderno (Vercel, via @next/font) */
font-sans: "Geist", "Inter", system-ui, sans-serif;

/* Geist Mono — código/dados */
font-mono: "Geist Mono", "JetBrains Mono", monospace;
```

**Hierarquia tipográfica:**
- `h1` (hero): Fraunces 600, clamp(2.5rem, 5vw, 4.5rem), tracking-tight
- `h2`: Fraunces 500, 2rem-3rem
- `h3`: Geist 600, 1.5rem
- `body`: Geist 400, 1rem, leading-relaxed
- `caption`: Geist 500, 0.875rem, text-secondary

### Sistema de espaçamento

Usar escala Tailwind padrão (`4, 8, 12, 16, 24, 32, 48, 64`). Container max-width: `1280px` (`max-w-7xl`).

### Border-radius

```
--radius-sm: 6px
--radius-md: 10px
--radius-lg: 16px
--radius-xl: 24px
--radius-full: 9999px
```

### Sombras

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.4);
--shadow-glow-primary: 0 0 24px rgba(79, 142, 247, 0.3);
--shadow-glow-accent: 0 0 24px rgba(212, 165, 116, 0.25);
```

### Princípios visuais

1. **Dark mode é o único modo** (não há light mode no MVP)
2. **Glassmorphism sutil** em overlays e modais
3. **Micro-animações**: `transition-all duration-200 ease-out`
4. **Hover states sempre presentes** em elementos clicáveis
5. **Foco em acessibilidade**: contraste mínimo AA, focus rings visíveis
6. **Mobile-first**: testar em 375px primeiro
7. **Imagens com lazy load** sempre
8. **Skeleton loaders** durante fetches
9. **Vazio bonito**: empty states com ilustração + CTA

---

## 4. Estrutura de pastas

```
imerso/
├── .env.local                          # secrets (NÃO commitar)
├── .env.example                        # template público
├── .gitignore                          # incluir .env.local, node_modules, .next
├── .prettierrc.json
├── .eslintrc.json
├── README.md
├── CLAUDE.md                           # versão resumida deste prompt para futuras sessões
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── middleware.ts                       # i18n + auth
├── messages/
│   ├── pt.json
│   ├── en.json
│   └── es.json
├── public/
│   ├── logo-imerso.svg
│   ├── og-default.png                  # 1200x630
│   ├── favicon.ico
│   └── images/
│       └── landing/
├── supabase/
│   └── migrations/
│       ├── 20250508000001_initial_schema.sql
│       ├── 20250508000002_rls_policies.sql
│       ├── 20250508000003_triggers.sql
│       └── 20250508000004_seed.sql
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx              # root layout público
│   │   │   ├── page.tsx                # landing
│   │   │   ├── (legal)/
│   │   │   │   ├── termos/page.tsx
│   │   │   │   ├── privacidade/page.tsx
│   │   │   │   └── lgpd/page.tsx
│   │   │   ├── [imobiliaria]/
│   │   │   │   ├── page.tsx            # galeria pública
│   │   │   │   └── [tour]/
│   │   │   │       ├── page.tsx        # viewer público
│   │   │   │       └── senha/page.tsx
│   │   │   ├── painel/
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── imobiliarias/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── nova/page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx
│   │   │   │   │       └── corretores/page.tsx
│   │   │   │   ├── tours/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── novo/page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx
│   │   │   │   │       ├── upload/page.tsx
│   │   │   │   │       ├── hotspots/page.tsx
│   │   │   │   │       ├── waypoints/page.tsx
│   │   │   │   │       └── metricas/page.tsx
│   │   │   │   ├── leads/page.tsx
│   │   │   │   └── configuracoes/page.tsx
│   │   │   └── cliente/
│   │   │       ├── login/page.tsx
│   │   │       ├── trocar-senha/page.tsx
│   │   │       ├── layout.tsx
│   │   │       ├── tours/
│   │   │       │   ├── page.tsx
│   │   │       │   └── [id]/page.tsx
│   │   │       └── perfil/page.tsx
│   │   ├── api/
│   │   │   ├── public/
│   │   │   │   ├── tours/
│   │   │   │   │   └── [imobiliaria]/
│   │   │   │   │       └── [tour]/
│   │   │   │   │           ├── route.ts
│   │   │   │   │           ├── verify-password/route.ts
│   │   │   │   │           ├── track-view/route.ts
│   │   │   │   │           └── track-whatsapp/route.ts
│   │   │   │   └── leads/route.ts
│   │   │   ├── admin/
│   │   │   │   ├── imobiliarias/...
│   │   │   │   ├── corretores/...
│   │   │   │   ├── tours/...
│   │   │   │   ├── hotspots/...
│   │   │   │   ├── waypoints/...
│   │   │   │   ├── leads/...
│   │   │   │   └── metrics/...
│   │   │   ├── cliente/
│   │   │   │   ├── tours/...
│   │   │   │   └── metrics/...
│   │   │   └── og/
│   │   │       └── [imobiliaria]/
│   │   │           └── [tour]/route.ts
│   │   ├── globals.css
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── ui/                         # design system base (shadcn-like)
│   │   ├── viewer/                     # viewer 3D
│   │   ├── layout/                     # headers, sidebars
│   │   ├── landing/                    # seções da landing
│   │   ├── lgpd/                       # cookie banner
│   │   └── shared/                     # utilitários
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts               # browser
│   │   │   ├── server.ts               # RSC + route handlers
│   │   │   ├── middleware.ts           # session refresh
│   │   │   └── admin.ts                # service role
│   │   ├── r2/
│   │   │   ├── client.ts
│   │   │   ├── presigned.ts
│   │   │   └── multipart.ts
│   │   ├── luma/
│   │   │   ├── client.ts
│   │   │   ├── types.ts
│   │   │   └── pricing.ts
│   │   ├── splat/
│   │   │   ├── viewer-loader.ts
│   │   │   ├── lod.ts
│   │   │   └── quality-presets.ts
│   │   ├── auth/
│   │   │   ├── roles.ts
│   │   │   ├── guards.ts
│   │   │   └── session.ts
│   │   ├── og/
│   │   │   └── generate.ts
│   │   ├── utils/
│   │   │   ├── cn.ts
│   │   │   ├── slug.ts
│   │   │   ├── format.ts
│   │   │   ├── validation.ts
│   │   │   ├── fingerprint.ts
│   │   │   └── whatsapp.ts
│   │   └── constants.ts
│   ├── hooks/
│   │   ├── useUploadMultipart.ts
│   │   ├── useTourViewer.ts
│   │   ├── useDebounce.ts
│   │   ├── useMediaQuery.ts
│   │   └── useLumaPolling.ts
│   ├── types/
│   │   ├── database.types.ts           # gerado pelo Supabase CLI
│   │   ├── tour.ts
│   │   ├── viewer.ts
│   │   └── api.ts
│   ├── i18n/
│   │   ├── routing.ts
│   │   ├── navigation.ts
│   │   └── request.ts
│   └── styles/
│       └── viewer.css
└── scripts/
    └── generate-types.sh
```

---

## 5. Variáveis de ambiente

### `.env.example` (commitar)

```bash
# ===== App =====
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Imerso

# ===== Supabase =====
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ===== Cloudflare R2 =====
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_PUBLIC_URL=
R2_BUCKET_NAME=splat-viewer

# ===== Luma AI =====
LUMA_API_KEY=
LUMA_API_BASE_URL=https://webapp-api.lumalabs.ai/api/v0

# ===== WhatsApp do founder (botão flutuante padrão fallback) =====
NEXT_PUBLIC_WHATSAPP_FOUNDER=5547999999999
NEXT_PUBLIC_WHATSAPP_MESSAGE_DEFAULT=Olá! Vim do tour virtual e gostaria de mais informações.

# ===== Limites =====
NEXT_PUBLIC_MAX_VIDEO_SIZE_MB=2048      # 2GB
NEXT_PUBLIC_MULTIPART_CHUNK_SIZE_MB=10
NEXT_PUBLIC_MAX_HOTSPOTS_PER_TOUR=15
```

### `.env.local` (já fornecido pelo founder, NÃO commitar)

Já existe com os valores reais. Confirmar que estão presentes:
- `LUMA_API_KEY`
- `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_PUBLIC_URL`, `R2_BUCKET_NAME=splat-viewer`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### `.gitignore` essencial

```
.env*.local
.env
node_modules
.next
.vercel
*.log
.DS_Store
/coverage
/build
/dist
```

---

## 6. Schema Supabase

> **Arquivo**: `supabase/migrations/20250508000001_initial_schema.sql`

```sql
-- ============================================================
-- IMERSO — Initial Schema
-- ============================================================

-- Extensões
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. IMOBILIÁRIAS
-- ============================================================
create table public.imobiliarias (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  cnpj text,
  logo_url text,
  cor_primaria text default '#4F8EF7',
  whatsapp_principal text,
  email_contato text,
  endereco text,
  cidade text default 'Balneário Camboriú',
  estado text default 'SC',
  -- Login (ativado manualmente pelo super_admin)
  has_login boolean default false,
  user_id uuid references auth.users(id) on delete set null,
  must_change_password boolean default false,
  -- Auditoria
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Soft delete
  archived_at timestamptz
);

create index idx_imobiliarias_slug on public.imobiliarias(slug) where archived_at is null;
create index idx_imobiliarias_user_id on public.imobiliarias(user_id) where user_id is not null;

-- ============================================================
-- 2. CORRETORES
-- ============================================================
create table public.corretores (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid references public.imobiliarias(id) on delete cascade not null,
  nome text not null,
  creci text,
  whatsapp text not null,                  -- formato +55DDD9XXXXXXXX
  email text,
  foto_url text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_corretores_imobiliaria on public.corretores(imobiliaria_id) where ativo = true;

-- ============================================================
-- 3. TOURS (núcleo)
-- ============================================================
create table public.tours (
  id uuid primary key default gen_random_uuid(),
  imobiliaria_id uuid references public.imobiliarias(id) on delete cascade not null,
  corretor_id uuid references public.corretores(id) on delete set null,

  -- Identificação
  slug text not null,
  titulo text not null,
  tipo text not null check (tipo in ('apartamento','casa','comercial','terreno','evento')),

  -- Localização
  bairro text,
  cidade text default 'Balneário Camboriú',
  estado text default 'SC',

  -- Especificações
  area_m2 numeric(10,2),
  quartos integer,
  valor numeric(15,2),
  modalidade text check (modalidade in ('venda','aluguel','temporada')),
  status_venda text default 'disponivel' check (status_venda in ('disponivel','reservado','vendido')),

  -- Conteúdo
  descricao text,
  foto_capa_url text,

  -- Processamento — vídeo bruto
  video_r2_key text,
  video_size_bytes bigint,
  video_uploaded_at timestamptz,

  -- Processamento — Luma
  luma_capture_slug text,
  luma_status text,                                     -- raw da Luma
  luma_submitted_at timestamptz,
  luma_completed_at timestamptz,

  -- Resultado .splat
  splat_r2_key text,
  splat_url text,
  splat_size_bytes bigint,

  -- Status do nosso sistema
  status text not null default 'draft'
    check (status in ('draft','uploading','processing','ready','failed','archived')),
  status_message text,

  -- Privacidade
  is_public boolean default true,
  password_hash text,                                   -- bcrypt se privado

  -- Features pagas
  has_cinematic_mode boolean default false,

  -- Tracking de custo Luma (CRÍTICO para precificação)
  luma_cost_credits integer,
  luma_cost_usd numeric(10,2),
  cobranca_cliente_brl numeric(10,2),                   -- quanto cobrou do cliente
  margem_brl numeric(10,2) generated always as (
    coalesce(cobranca_cliente_brl, 0) - coalesce(luma_cost_usd * 6.0, 0)
  ) stored,

  -- Timing
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  archived_at timestamptz,

  -- Slug único por imobiliária
  unique (imobiliaria_id, slug)
);

create index idx_tours_imobiliaria on public.tours(imobiliaria_id) where archived_at is null;
create index idx_tours_status on public.tours(status);
create index idx_tours_slug_lookup on public.tours(imobiliaria_id, slug) where archived_at is null;
create index idx_tours_public_ready on public.tours(imobiliaria_id) where status = 'ready' and is_public = true and archived_at is null;

-- ============================================================
-- 4. HOTSPOTS
-- ============================================================
create table public.tour_hotspots (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references public.tours(id) on delete cascade not null,
  titulo text not null,
  descricao text,
  icone text not null check (icone in (
    'suite','cozinha','varanda','banheiro','garagem','sala',
    'piscina','jardim','churrasqueira','home_office','lavabo',
    'closet','area_servico','generico'
  )),
  posicao_x numeric not null,
  posicao_y numeric not null,
  posicao_z numeric not null,
  ordem integer default 0,
  created_at timestamptz default now()
);

create index idx_hotspots_tour on public.tour_hotspots(tour_id);

-- ============================================================
-- 5. WAYPOINTS (Cinematic Mode)
-- ============================================================
create table public.tour_waypoints (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references public.tours(id) on delete cascade not null,
  ordem integer not null,
  position_x numeric not null,
  position_y numeric not null,
  position_z numeric not null,
  target_x numeric not null,
  target_y numeric not null,
  target_z numeric not null,
  duration_ms integer default 4000,
  created_at timestamptz default now(),
  unique (tour_id, ordem)
);

create index idx_waypoints_tour on public.tour_waypoints(tour_id, ordem);

-- ============================================================
-- 6. ANALYTICS — VIEWS
-- ============================================================
create table public.tour_views (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references public.tours(id) on delete cascade not null,
  visitor_fingerprint text,
  user_agent text,
  referrer text,
  ip_country text,
  ip_city text,
  duration_seconds integer,
  created_at timestamptz default now()
);

create index idx_views_tour_date on public.tour_views(tour_id, created_at desc);
create index idx_views_fingerprint on public.tour_views(visitor_fingerprint, created_at desc);

-- ============================================================
-- 7. ANALYTICS — WHATSAPP CLICKS
-- ============================================================
create table public.tour_whatsapp_clicks (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references public.tours(id) on delete cascade not null,
  visitor_fingerprint text,
  created_at timestamptz default now()
);

create index idx_wa_clicks_tour on public.tour_whatsapp_clicks(tour_id, created_at desc);

-- ============================================================
-- 8. LEADS (formulário landing)
-- ============================================================
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text not null,
  email text,
  tipo_imovel text,
  cidade text,
  mensagem text,
  origem text default 'landing' check (origem in ('landing','viewer','indicacao','outro')),
  status text default 'novo' check (status in ('novo','em_contato','fechado','perdido')),
  observacoes_internas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_leads_status on public.leads(status, created_at desc);

-- ============================================================
-- 9. LUMA PROCESSING LOG (auditoria de custo)
-- ============================================================
create table public.luma_processing_log (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references public.tours(id) on delete set null,
  luma_capture_slug text,
  status text,
  credits_used integer,
  cost_usd numeric(10,2),
  raw_response jsonb,
  created_at timestamptz default now()
);

create index idx_luma_log_tour on public.luma_processing_log(tour_id, created_at desc);

-- ============================================================
-- 10. SYSTEM CONFIG
-- ============================================================
create table public.system_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

-- Seed de config inicial
insert into public.system_config (key, value, description) values
  ('luma_credit_cost_usd', '0.50'::jsonb, 'Custo médio em USD por crédito Luma (ajuste manual)'),
  ('usd_to_brl_rate', '6.00'::jsonb, 'Taxa USD→BRL para cálculo de margem'),
  ('og_image_default', '"/og-default.png"'::jsonb, 'Imagem OG padrão')
on conflict (key) do nothing;

-- ============================================================
-- 11. USER ROLES
-- ============================================================
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','imobiliaria')),
  imobiliaria_id uuid references public.imobiliarias(id) on delete cascade,
  created_at timestamptz default now()
);

create index idx_user_roles_role on public.user_roles(role);

-- ============================================================
-- 12. UPLOAD SESSIONS (multipart R2)
-- ============================================================
create table public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references public.tours(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  r2_key text not null,
  upload_id text not null,                              -- multipart upload ID do R2
  total_size_bytes bigint not null,
  chunk_size_bytes integer not null,
  total_chunks integer not null,
  parts_completed jsonb default '[]'::jsonb,            -- [{partNumber, etag}]
  status text default 'in_progress' check (status in ('in_progress','completed','aborted','failed')),
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours'),
  completed_at timestamptz
);

create index idx_upload_sessions_tour on public.upload_sessions(tour_id, status);
```

---

## 7. RLS Policies

> **Arquivo**: `supabase/migrations/20250508000002_rls_policies.sql`

```sql
-- ============================================================
-- HABILITAR RLS EM TODAS AS TABELAS
-- ============================================================
alter table public.imobiliarias enable row level security;
alter table public.corretores enable row level security;
alter table public.tours enable row level security;
alter table public.tour_hotspots enable row level security;
alter table public.tour_waypoints enable row level security;
alter table public.tour_views enable row level security;
alter table public.tour_whatsapp_clicks enable row level security;
alter table public.leads enable row level security;
alter table public.luma_processing_log enable row level security;
alter table public.system_config enable row level security;
alter table public.user_roles enable row level security;
alter table public.upload_sessions enable row level security;

-- ============================================================
-- HELPER: função para checar role do usuário
-- ============================================================
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.user_imobiliaria_id()
returns uuid
language sql
security definer
stable
as $$
  select imobiliaria_id from public.user_roles
  where user_id = auth.uid() and role = 'imobiliaria'
  limit 1;
$$;

-- ============================================================
-- IMOBILIÁRIAS
-- ============================================================
-- Leitura pública para galeria pública (apenas se não arquivado)
create policy "imobiliarias_public_read"
on public.imobiliarias for select
using (archived_at is null);

-- Super admin: tudo
create policy "imobiliarias_admin_all"
on public.imobiliarias for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- Imobiliária pode ler/atualizar seus próprios dados
create policy "imobiliarias_self_update"
on public.imobiliarias for update
using (id = public.user_imobiliaria_id())
with check (id = public.user_imobiliaria_id());

-- ============================================================
-- CORRETORES
-- ============================================================
create policy "corretores_public_read"
on public.corretores for select
using (ativo = true);

create policy "corretores_admin_all"
on public.corretores for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "corretores_imobiliaria_read"
on public.corretores for select
using (imobiliaria_id = public.user_imobiliaria_id());

-- ============================================================
-- TOURS
-- ============================================================
-- Leitura pública SOMENTE se ready + público + não arquivado
create policy "tours_public_read"
on public.tours for select
using (
  status = 'ready'
  and is_public = true
  and archived_at is null
);

create policy "tours_admin_all"
on public.tours for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- Imobiliária logada vê seus tours
create policy "tours_imobiliaria_read"
on public.tours for select
using (imobiliaria_id = public.user_imobiliaria_id());

-- Imobiliária logada pode atualizar APENAS status_venda
create policy "tours_imobiliaria_update_status"
on public.tours for update
using (imobiliaria_id = public.user_imobiliaria_id())
with check (imobiliaria_id = public.user_imobiliaria_id());

-- ============================================================
-- HOTSPOTS
-- ============================================================
create policy "hotspots_public_read"
on public.tour_hotspots for select
using (
  exists (
    select 1 from public.tours t
    where t.id = tour_id
    and t.status = 'ready'
    and t.is_public = true
    and t.archived_at is null
  )
);

create policy "hotspots_admin_all"
on public.tour_hotspots for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- ============================================================
-- WAYPOINTS
-- ============================================================
create policy "waypoints_public_read"
on public.tour_waypoints for select
using (
  exists (
    select 1 from public.tours t
    where t.id = tour_id
    and t.status = 'ready'
    and t.is_public = true
    and t.has_cinematic_mode = true
    and t.archived_at is null
  )
);

create policy "waypoints_admin_all"
on public.tour_waypoints for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- ============================================================
-- ANALYTICS — escrita pública (anônima), leitura admin/own
-- ============================================================
create policy "tour_views_insert_public"
on public.tour_views for insert
with check (true);

create policy "tour_views_admin_read"
on public.tour_views for select
using (public.is_super_admin());

create policy "tour_views_imobiliaria_read"
on public.tour_views for select
using (
  exists (
    select 1 from public.tours t
    where t.id = tour_id
    and t.imobiliaria_id = public.user_imobiliaria_id()
  )
);

create policy "wa_clicks_insert_public"
on public.tour_whatsapp_clicks for insert
with check (true);

create policy "wa_clicks_admin_read"
on public.tour_whatsapp_clicks for select
using (public.is_super_admin());

create policy "wa_clicks_imobiliaria_read"
on public.tour_whatsapp_clicks for select
using (
  exists (
    select 1 from public.tours t
    where t.id = tour_id
    and t.imobiliaria_id = public.user_imobiliaria_id()
  )
);

-- ============================================================
-- LEADS — só admin
-- ============================================================
create policy "leads_insert_public"
on public.leads for insert
with check (true);

create policy "leads_admin_all"
on public.leads for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- ============================================================
-- LUMA LOG / SYSTEM CONFIG / USER ROLES — só admin
-- ============================================================
create policy "luma_log_admin_all"
on public.luma_processing_log for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "system_config_admin_all"
on public.system_config for all
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "user_roles_admin_all"
on public.user_roles for all
using (public.is_super_admin())
with check (public.is_super_admin());

-- usuário pode ler seu próprio role
create policy "user_roles_self_read"
on public.user_roles for select
using (user_id = auth.uid());

-- ============================================================
-- UPLOAD SESSIONS
-- ============================================================
create policy "upload_sessions_admin_all"
on public.upload_sessions for all
using (public.is_super_admin())
with check (public.is_super_admin());
```

---

## 8. Triggers e funções SQL

> **Arquivo**: `supabase/migrations/20250508000003_triggers.sql`

```sql
-- ============================================================
-- updated_at automático
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_imobiliarias_updated before update on public.imobiliarias
  for each row execute function public.set_updated_at();
create trigger trg_corretores_updated before update on public.corretores
  for each row execute function public.set_updated_at();
create trigger trg_tours_updated before update on public.tours
  for each row execute function public.set_updated_at();
create trigger trg_leads_updated before update on public.leads
  for each row execute function public.set_updated_at();

-- ============================================================
-- Auto-arquivamento de tours: quem está com archived_at
-- definido há mais de 7 dias é deletado fisicamente.
-- Roda via cron (Supabase pg_cron ou edge scheduled function)
-- ============================================================
create or replace function public.purge_archived_tours()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.tours
  where archived_at is not null
    and archived_at < (now() - interval '7 days');
end;
$$;

-- ============================================================
-- Validar slug: só lowercase, números, hífen
-- ============================================================
create or replace function public.validate_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Slug inválido. Use apenas letras minúsculas, números e hífens.';
  end if;
  return new;
end;
$$;

create trigger trg_imobiliarias_slug before insert or update of slug on public.imobiliarias
  for each row execute function public.validate_slug();
create trigger trg_tours_slug before insert or update of slug on public.tours
  for each row execute function public.validate_slug();

-- ============================================================
-- Sincronizar has_login com user_id
-- ============================================================
create or replace function public.sync_imobiliaria_has_login()
returns trigger
language plpgsql
as $$
begin
  new.has_login = (new.user_id is not null);
  return new;
end;
$$;

create trigger trg_imobiliaria_has_login before insert or update of user_id on public.imobiliarias
  for each row execute function public.sync_imobiliaria_has_login();
```

> **Arquivo**: `supabase/migrations/20250508000004_seed.sql`

```sql
-- ============================================================
-- SEED: Super admin (Sheik) — vincular após cadastro manual em
-- Supabase Dashboard → Authentication → Add user
-- Depois rodar este SQL com o UUID do usuário criado.
-- ============================================================
-- Exemplo (descomentar e substituir UUID):
-- insert into public.user_roles (user_id, role)
-- values ('UUID-DO-SHEIK-AQUI', 'super_admin')
-- on conflict (user_id) do update set role = 'super_admin';

-- Imobiliária de teste (opcional)
-- insert into public.imobiliarias (slug, nome, whatsapp_principal, cidade)
-- values ('demo', 'Imobiliária Demo', '+5547999999999', 'Balneário Camboriú');
```

---

## 9. Setup inicial do projeto

### Passo a passo (entregar para o founder, NÃO executar)

```powershell
# 1. Criar projeto
npx create-next-app@15.1.0 imerso --typescript --tailwind --app --src-dir --import-alias "@/*" --no-eslint
cd imerso

# 2. Instalar dependências (comando completo na seção 2)

# 3. Configurar .env.local (copiar do .env.example e preencher)

# 4. Rodar migrations no Supabase Dashboard → SQL Editor
#    Colar e executar na ordem:
#    - 20250508000001_initial_schema.sql
#    - 20250508000002_rls_policies.sql
#    - 20250508000003_triggers.sql
#    - 20250508000004_seed.sql

# 5. Criar usuário super_admin no Supabase Dashboard → Authentication → Users → Add user
#    Pegar o UUID e rodar:
#    insert into public.user_roles (user_id, role) values ('<UUID>', 'super_admin');

# 6. Gerar tipos TypeScript
npx supabase login
npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/database.types.ts

# 7. Rodar dev
npm run dev
```

### `next.config.ts`

```typescript
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: process.env.R2_PUBLIC_URL?.replace(/^https?:\/\//, '') || '',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Headers de segurança
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

### `tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0A0E1A',
        surface: {
          DEFAULT: '#0F1729',
          elevated: '#1A2440',
          hover: '#1E2A47',
        },
        primary: {
          DEFAULT: '#4F8EF7',
          hover: '#6BA0F9',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#D4A574',
          hover: '#E0B589',
        },
        text: {
          primary: '#F5F2EC',
          secondary: '#A8B2C7',
          muted: '#6B7A99',
        },
        border: {
          DEFAULT: '#1E2A47',
          strong: '#2A3856',
        },
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '24px',
      },
      boxShadow: {
        'sm-dark': '0 1px 2px rgba(0, 0, 0, 0.2)',
        'md-dark': '0 4px 12px rgba(0, 0, 0, 0.3)',
        'lg-dark': '0 12px 32px rgba(0, 0, 0, 0.4)',
        'glow-primary': '0 0 24px rgba(79, 142, 247, 0.3)',
        'glow-accent': '0 0 24px rgba(212, 165, 116, 0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

### `src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: dark;
  }

  html {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    @apply bg-background font-sans text-text-primary;
    font-feature-settings: 'cv11', 'ss01';
  }

  ::selection {
    @apply bg-primary/30 text-text-primary;
  }

  /* Scrollbar dark */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    @apply bg-surface;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-border-strong rounded-full;
  }
  ::-webkit-scrollbar-thumb:hover {
    @apply bg-text-muted;
  }
}

@layer utilities {
  .glass {
    background: rgba(15, 23, 41, 0.7);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .container-imerso {
    @apply mx-auto max-w-7xl px-4 sm:px-6 lg:px-8;
  }
}
```

---

## 10. i18n (PT/EN/ES)

### `src/i18n/routing.ts`

```typescript
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['pt', 'en', 'es'],
  defaultLocale: 'pt',
  localePrefix: 'as-needed', // /sobre (pt) e /en/about (en)
});
```

### `src/i18n/navigation.ts`

```typescript
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
```

### `src/i18n/request.ts`

```typescript
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as 'pt' | 'en' | 'es')) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

### `middleware.ts` (raiz)

```typescript
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Primeiro: i18n
  const response = intlMiddleware(request);

  // Depois: refresh de sessão Supabase nas rotas autenticadas
  if (request.nextUrl.pathname.includes('/painel') || request.nextUrl.pathname.includes('/cliente')) {
    return await updateSession(request);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

### `messages/pt.json` (estrutura — preencher todas as chaves)

```json
{
  "common": {
    "loading": "Carregando...",
    "save": "Salvar",
    "cancel": "Cancelar",
    "delete": "Excluir",
    "edit": "Editar",
    "back": "Voltar",
    "next": "Próximo",
    "search": "Buscar",
    "yes": "Sim",
    "no": "Não",
    "confirm": "Confirmar",
    "error_generic": "Ocorreu um erro. Tente novamente."
  },
  "landing": {
    "hero": {
      "title": "Tours imobiliários 3D que vendem antes da visita",
      "subtitle": "Transforme seu imóvel em uma experiência imersiva que seu cliente explora pelo celular, sem app, sem hardware.",
      "cta_primary": "Solicitar tour",
      "cta_secondary": "Ver exemplo"
    },
    "how_it_works": {
      "title": "Como funciona",
      "steps": [
        { "title": "Você solicita", "desc": "Fale com a gente pelo formulário ou WhatsApp." },
        { "title": "Nossa equipe captura", "desc": "Vamos até o imóvel e filmamos com câmera profissional." },
        { "title": "Você recebe o link", "desc": "Em até 48h o tour 3D fica pronto para compartilhar." }
      ]
    },
    "use_cases": {
      "title": "Para quem é o Imerso",
      "items": [
        { "title": "Imobiliárias", "desc": "Reduza visitas ociosas, qualifique leads e venda mais rápido." },
        { "title": "Airbnb / Temporada", "desc": "Aumente sua taxa de conversão mostrando a propriedade real." },
        { "title": "Espaços para eventos", "desc": "Permita que noivos e produtores explorem o espaço de qualquer lugar." },
        { "title": "Concessionárias", "desc": "Showroom virtual sempre aberto." }
      ]
    },
    "pricing": {
      "title": "Investimento",
      "label": "Sob consulta",
      "desc": "Cada projeto é único. Fale com a gente para um orçamento personalizado."
    },
    "faq": {
      "title": "Perguntas frequentes",
      "items": [
        { "q": "Quanto custa um tour?", "a": "O valor varia de acordo com o tamanho e complexidade do imóvel. Solicite um orçamento." },
        { "q": "Em quanto tempo fica pronto?", "a": "De 24 a 72 horas após a captura." },
        { "q": "Preciso de algum equipamento?", "a": "Não. Nossa equipe vai até o local com câmera profissional." },
        { "q": "Atendem qual região?", "a": "Atendemos toda a região de Balneário Camboriú e Itajaí. Outras regiões sob consulta." },
        { "q": "Posso compartilhar o link?", "a": "Sim. O tour fica em um link único que você pode mandar por WhatsApp, e-mail ou redes sociais." },
        { "q": "Funciona no celular?", "a": "Sim. O tour roda em qualquer celular ou computador moderno, direto no navegador." }
      ]
    },
    "lead_form": {
      "title": "Solicite seu tour",
      "name": "Seu nome",
      "whatsapp": "WhatsApp",
      "tipo": "Tipo de imóvel",
      "cidade": "Cidade",
      "mensagem": "Mensagem (opcional)",
      "submit": "Quero meu tour"
    }
  },
  "viewer": {
    "loading": "Preparando seu tour 3D...",
    "share": "Compartilhar",
    "fullscreen": "Tela cheia",
    "info": "Informações",
    "screenshot": "Capturar imagem",
    "reset_view": "Posição inicial",
    "quality": { "label": "Qualidade", "high": "Alta", "medium": "Média", "low": "Baixa" },
    "cinematic": { "play": "Tour automático", "stop": "Parar tour" },
    "minimap": "Minimapa",
    "whatsapp_cta": "Falar com o corretor",
    "password_required": {
      "title": "Tour privado",
      "subtitle": "Digite a senha para acessar.",
      "submit": "Acessar",
      "error": "Senha incorreta."
    }
  },
  "admin": { /* ... preencher todas as chaves do painel ... */ },
  "cliente": { /* ... preencher todas as chaves do dashboard cliente ... */ }
}
```

> **IMPORTANTE**: Criar `en.json` e `es.json` com a mesma estrutura. O agente do Cursor deve traduzir todas as chaves.

---

## 11. Auth e roles

### `src/lib/supabase/client.ts`

```typescript
'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### `src/lib/supabase/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component: ok ignorar
          }
        },
      },
    }
  );
}
```

### `src/lib/supabase/middleware.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database.types';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Redireciona se acessar área protegida sem auth
  if (!user && (path.includes('/painel') || path.includes('/cliente'))) {
    if (!path.includes('/login')) {
      const url = request.nextUrl.clone();
      url.pathname = path.includes('/painel') ? '/painel/login' : '/cliente/login';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
```

### `src/lib/supabase/admin.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// Service role client — APENAS no servidor, NUNCA expor!
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
```

### `src/lib/auth/guards.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/painel/login');

  const { data: role } = await supabase
    .from('user_roles')
    .select('role, imobiliaria_id')
    .eq('user_id', user.id)
    .single();

  if (!role || role.role !== 'super_admin') redirect('/painel/login');
  return { user, role };
}

export async function requireImobiliaria() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/cliente/login');

  const { data: role } = await supabase
    .from('user_roles')
    .select('role, imobiliaria_id')
    .eq('user_id', user.id)
    .single();

  if (!role || role.role !== 'imobiliaria' || !role.imobiliaria_id) {
    redirect('/cliente/login');
  }
  return { user, role };
}
```

---

## 12. Cloudflare R2 (multipart)

### `src/lib/r2/client.ts`

```typescript
import { S3Client } from '@aws-sdk/client-s3';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

export function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}
```

### `src/lib/r2/multipart.ts`

```typescript
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_BUCKET } from './client';

export async function initiateMultipart(key: string, contentType: string) {
  const cmd = new CreateMultipartUploadCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const res = await r2Client.send(cmd);
  return { uploadId: res.UploadId!, key };
}

export async function signPart(key: string, uploadId: string, partNumber: number) {
  const cmd = new UploadPartCommand({
    Bucket: R2_BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(r2Client, cmd, { expiresIn: 3600 }); // 1h
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>
) {
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: R2_BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
    },
  });
  return r2Client.send(cmd);
}

export async function abortMultipart(key: string, uploadId: string) {
  const cmd = new AbortMultipartUploadCommand({
    Bucket: R2_BUCKET,
    Key: key,
    UploadId: uploadId,
  });
  return r2Client.send(cmd);
}

export async function uploadDirect(key: string, body: Buffer | Uint8Array, contentType: string) {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  return r2Client.send(cmd);
}
```

### `src/hooks/useUploadMultipart.ts`

```typescript
'use client';

import { useState, useRef } from 'react';

interface UploadOptions {
  tourId: string;
  file: File;
  chunkSizeMB?: number;
  onProgress?: (percent: number) => void;
}

export function useUploadMultipart() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  async function upload({ tourId, file, chunkSizeMB = 10, onProgress }: UploadOptions) {
    setStatus('uploading');
    setError(null);
    setProgress(0);
    abortRef.current = false;

    const chunkSize = chunkSizeMB * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);

    try {
      // 1) Initiate
      const initRes = await fetch(`/api/admin/tours/${tourId}/upload/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || 'video/mp4',
          totalChunks,
          chunkSize,
        }),
      });
      if (!initRes.ok) throw new Error('Falha ao iniciar upload.');
      const { sessionId, uploadId, key } = await initRes.json();

      const completedParts: Array<{ ETag: string; PartNumber: number }> = [];

      // 2) Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        if (abortRef.current) {
          await fetch(`/api/admin/tours/${tourId}/upload/abort`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          throw new Error('Upload cancelado.');
        }

        const partNumber = i + 1;
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        // Pegar URL assinada
        const signRes = await fetch(`/api/admin/tours/${tourId}/upload/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, partNumber }),
        });
        if (!signRes.ok) throw new Error('Falha ao assinar parte.');
        const { url } = await signRes.json();

        // Subir chunk diretamente para R2
        const putRes = await fetch(url, { method: 'PUT', body: chunk });
        if (!putRes.ok) throw new Error(`Falha no chunk ${partNumber}`);

        const etag = putRes.headers.get('ETag')?.replace(/"/g, '') || '';
        completedParts.push({ ETag: etag, PartNumber: partNumber });

        const pct = Math.round(((i + 1) / totalChunks) * 100);
        setProgress(pct);
        onProgress?.(pct);
      }

      // 3) Complete
      const completeRes = await fetch(`/api/admin/tours/${tourId}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, parts: completedParts }),
      });
      if (!completeRes.ok) throw new Error('Falha ao concluir upload.');

      setStatus('completed');
      return await completeRes.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(msg);
      setStatus('error');
      throw err;
    }
  }

  function abort() {
    abortRef.current = true;
  }

  return { upload, abort, progress, status, error };
}
```

---

## 13. Luma AI integration

### `src/lib/luma/client.ts`

```typescript
const LUMA_BASE = process.env.LUMA_API_BASE_URL || 'https://webapp-api.lumalabs.ai/api/v0';
const LUMA_KEY = process.env.LUMA_API_KEY!;

interface LumaCapture {
  slug: string;
  title: string;
  type: string;
  privacy: string;
  status: string;
  latest_run?: {
    status: string;
    progress: number;
    current_stage: string;
    artifacts: Array<{ url: string; type: string }>;
  };
}

export async function lumaSubmitFromUrl(videoUrl: string, title: string): Promise<{ slug: string }> {
  // Endpoint da Luma API para submissão (usa multipart/form-data)
  // NOTA: Como a Luma API oficial pode mudar, este é o contrato esperado.
  // Se a API real exigir upload binário em vez de URL, baixar o vídeo do R2
  // primeiro com fetch + AbortSignal.timeout(600_000) e enviar como FormData.
  const res = await fetch(`${LUMA_BASE}/capture/from-url`, {
    method: 'POST',
    headers: {
      Authorization: `luma-api-key=${LUMA_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      video_url: videoUrl,
      privacy: 'unlisted',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Luma submit falhou: ${res.status} ${text}`);
  }
  const data = await res.json();
  return { slug: data.slug };
}

export async function lumaGetStatus(slug: string): Promise<LumaCapture> {
  const res = await fetch(`${LUMA_BASE}/capture/${slug}`, {
    headers: { Authorization: `luma-api-key=${LUMA_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Luma status falhou: ${res.status}`);
  return res.json();
}

export async function lumaGetCredits(): Promise<number> {
  const res = await fetch(`${LUMA_BASE}/credits`, {
    headers: { Authorization: `luma-api-key=${LUMA_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.credits ?? 0;
}

export function extractSplatUrl(capture: LumaCapture): string | null {
  const artifacts = capture.latest_run?.artifacts ?? [];
  const splat = artifacts.find(a => a.type === 'splat' || a.url.endsWith('.splat') || a.url.endsWith('.ply'));
  return splat?.url ?? null;
}
```

> ⚠️ **NOTA CRÍTICA**: A API da Luma evoluiu e pode ter mudado o endpoint exato. O agente do Cursor deve:
> 1. Confirmar o endpoint correto na documentação oficial Luma vigente em https://docs.lumalabs.ai/
> 2. Se necessário, criar um wrapper que **baixa o vídeo do R2** (via streaming) e **envia como multipart/form-data** para a Luma. O R2 já é S3-compat, basta fazer um GET na URL pública.
> 3. Se a API exigir upload, usar a abordagem alternativa: aceitar do founder o `.splat` já processado em vez de orquestrar.

### `src/lib/luma/pricing.ts`

```typescript
// Pricing aproximado para tracking de custos.
// Founder ajusta valor real em system_config.luma_credit_cost_usd
export const DEFAULT_CREDIT_COST_USD = 0.50;

export function estimateLumaCostUSD(credits: number, costPerCredit = DEFAULT_CREDIT_COST_USD) {
  return Number((credits * costPerCredit).toFixed(2));
}
```

---

## 14. Viewer 3D (Gaussian Splatting)

### `src/lib/splat/viewer-loader.ts`

```typescript
'use client';

// Lazy load do GaussianSplats3D — biblioteca pesada, só carrega quando necessário
export async function loadSplatViewer() {
  const [{ Viewer }, THREE] = await Promise.all([
    import('@mkkellogg/gaussian-splats-3d'),
    import('three'),
  ]);
  return { Viewer, THREE };
}
```

### `src/lib/splat/lod.ts`

```typescript
'use client';

export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualityPreset {
  splatRenderMaxSplatCount: number;
  sphericalHarmonicsDegree: number;
  antialiased: boolean;
  pixelRatio: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  high: {
    splatRenderMaxSplatCount: 10_000_000,
    sphericalHarmonicsDegree: 2,
    antialiased: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
  },
  medium: {
    splatRenderMaxSplatCount: 4_000_000,
    sphericalHarmonicsDegree: 1,
    antialiased: true,
    pixelRatio: 1.25,
  },
  low: {
    splatRenderMaxSplatCount: 1_500_000,
    sphericalHarmonicsDegree: 0,
    antialiased: false,
    pixelRatio: 1,
  },
};

export function detectInitialQuality(): QualityLevel {
  if (typeof window === 'undefined') return 'medium';

  // Heurísticas: GPU + memória + mobile
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const memGB = (navigator as any).deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;

  if (isMobile && memGB <= 4) return 'low';
  if (isMobile) return 'medium';
  if (memGB >= 8 && cores >= 8) return 'high';
  if (memGB >= 4) return 'medium';
  return 'low';
}
```

### `src/components/viewer/SplatViewer.tsx`

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { loadSplatViewer } from '@/lib/splat/viewer-loader';
import { QUALITY_PRESETS, detectInitialQuality, type QualityLevel } from '@/lib/splat/lod';

interface SplatViewerProps {
  splatUrl: string;
  onReady?: (api: SplatViewerAPI) => void;
  onProgress?: (percent: number) => void;
  onError?: (error: Error) => void;
  initialQuality?: QualityLevel;
}

export interface SplatViewerAPI {
  setQuality: (q: QualityLevel) => void;
  resetCamera: () => void;
  getCameraState: () => { position: number[]; target: number[] };
  setCameraState: (state: { position: number[]; target: number[] }) => void;
  takeScreenshot: () => Promise<Blob>;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  destroy: () => void;
}

export function SplatViewer({
  splatUrl,
  onReady,
  onProgress,
  onError,
  initialQuality,
}: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    (async () => {
      try {
        const { Viewer } = await loadSplatViewer();
        const quality = initialQuality ?? detectInitialQuality();
        const preset = QUALITY_PRESETS[quality];

        const viewer = new Viewer({
          rootElement: containerRef.current!,
          cameraUp: [0, -1, 0],
          initialCameraPosition: [0, 0, -5],
          initialCameraLookAt: [0, 0, 0],
          sphericalHarmonicsDegree: preset.sphericalHarmonicsDegree,
          antialiased: preset.antialiased,
          renderMode: 1,
          gpuAcceleratedSort: true,
          enableSIMDInSort: true,
        });

        viewerRef.current = viewer;

        await viewer.addSplatScene(splatUrl, {
          progressiveLoad: true,
          showLoadingUI: false,
          onProgress: (percent: number) => onProgress?.(percent),
        });

        if (!mounted) return;
        viewer.start();
        setLoading(false);

        const api: SplatViewerAPI = {
          setQuality: (q) => {
            const p = QUALITY_PRESETS[q];
            // Aplicar preset (algumas opções exigem recriação)
            viewer.renderer?.setPixelRatio(p.pixelRatio);
          },
          resetCamera: () => {
            viewer.camera.position.set(0, 0, -5);
            viewer.camera.lookAt(0, 0, 0);
          },
          getCameraState: () => ({
            position: viewer.camera.position.toArray(),
            target: viewer.controls?.target?.toArray() ?? [0, 0, 0],
          }),
          setCameraState: (state) => {
            viewer.camera.position.fromArray(state.position);
            if (viewer.controls) viewer.controls.target.fromArray(state.target);
          },
          takeScreenshot: async () => {
            const canvas = viewer.renderer.domElement as HTMLCanvasElement;
            return new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Screenshot failed'))), 'image/png');
            });
          },
          enterFullscreen: () => containerRef.current?.requestFullscreen(),
          exitFullscreen: () => document.exitFullscreen(),
          destroy: () => {
            viewer.dispose?.();
            viewerRef.current = null;
          },
        };

        onReady?.(api);
      } catch (err) {
        onError?.(err as Error);
      }
    })();

    return () => {
      mounted = false;
      viewerRef.current?.dispose?.();
    };
  }, [splatUrl, initialQuality, onReady, onProgress, onError]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="text-text-secondary">Carregando tour...</div>
        </div>
      )}
    </div>
  );
}
```

### Componentes de overlay do viewer (criar todos)

- `LoadingScreen.tsx` — overlay full com logo Imerso, animação de pontos pulsantes, % de progresso
- `ViewerControls.tsx` — barra inferior/lateral com botões: fullscreen, info, reset, screenshot, share, quality, cinematic
- `WhatsAppFloating.tsx` — botão fixo bottom-right com gradient verde WhatsApp; clicar abre `wa.me/{numero}?text=Olá! Vim do tour...` E dispara POST `/api/public/tours/{id}/track-whatsapp`
- `InfoPanel.tsx` — drawer lateral direito com: foto capa, título, tipo, bairro, área, quartos, valor formatado, modalidade, descrição, status_venda (badge), corretor (foto + nome + CRECI), logo da imobiliária
- `HotspotMarker.tsx` — pin 3D posicionado via projeção 3D→2D; ícone do tipo + tooltip on click
- `MiniMap.tsx` — canvas 2D com top-down view abstrata (usar projeção XZ dos pontos do splat); marca posição da câmera e hotspots
- `QualityToggle.tsx` — segmented control High/Medium/Low
- `ShareModal.tsx` — modal com: copiar link, WhatsApp, Facebook, X, e-mail, QR code (`qrcode` lib)
- `ScreenshotButton.tsx` — chama API → baixa PNG
- `CinematicPlayer.tsx` — controla animação por waypoints; só ativa se `tour.has_cinematic_mode`

---

## 15. Rotas da aplicação

### Rotas públicas (sem auth)

| Rota | Descrição |
|---|---|
| `/` | Landing page de marketing |
| `/[locale]/` | Landing em locale específico (en/es) |
| `/termos` | Termos de uso (placeholder LGPD) |
| `/privacidade` | Política de privacidade (placeholder LGPD) |
| `/lgpd` | Direitos do titular (LGPD art. 18) |
| `/[imobiliaria]` | Galeria pública de tours da imobiliária |
| `/[imobiliaria]/[tour]` | Viewer 3D público |
| `/[imobiliaria]/[tour]/senha` | Form de senha (se tour privado) |

### Rotas admin (super_admin)

| Rota | Descrição |
|---|---|
| `/painel/login` | Login do super admin |
| `/painel/dashboard` | KPIs e gráficos |
| `/painel/imobiliarias` | Lista de imobiliárias |
| `/painel/imobiliarias/nova` | Criar imobiliária |
| `/painel/imobiliarias/[id]` | Editar imobiliária + ativar login |
| `/painel/imobiliarias/[id]/corretores` | Gerenciar corretores |
| `/painel/tours` | Lista de tours (filtros: status, imobiliária, busca) |
| `/painel/tours/novo` | Criar novo tour (escolher imobiliária + corretor + dados) |
| `/painel/tours/[id]` | Editar metadados do tour |
| `/painel/tours/[id]/upload` | Upload do vídeo + envio para Luma |
| `/painel/tours/[id]/hotspots` | Editor de hotspots (modo edição no viewer) |
| `/painel/tours/[id]/waypoints` | Editor de waypoints cinematic |
| `/painel/tours/[id]/metricas` | Métricas detalhadas do tour |
| `/painel/leads` | CRM simplificado de leads |
| `/painel/configuracoes` | Configs do sistema (taxa USD/BRL, custo Luma, OG default) |

### Rotas cliente (imobiliária)

| Rota | Descrição |
|---|---|
| `/cliente/login` | Login da imobiliária |
| `/cliente/trocar-senha` | Forçado no primeiro acesso |
| `/cliente/tours` | Galeria privada com seus tours |
| `/cliente/tours/[id]` | Detalhes + métricas + alterar status_venda |
| `/cliente/perfil` | Dados da imobiliária (logo, WhatsApp principal) |

---

## 16. API Routes (contratos TypeScript)

> Todas as rotas devem **validar input com Zod** e **retornar erros padronizados**:
> ```ts
> { error: { code: string; message: string } }
> ```

### 16.1. Públicas

#### `POST /api/public/leads`
```typescript
// Request
{
  nome: string;
  whatsapp: string;
  email?: string;
  tipo_imovel?: string;
  cidade?: string;
  mensagem?: string;
}
// Response 200
{ id: string; whatsappRedirectUrl: string }
// whatsappRedirectUrl é o link wa.me do founder com mensagem pré-preenchida
```

#### `GET /api/public/tours/[imobiliaria]/[tour]`
```typescript
// Response 200 (tour público OU senha já validada via cookie)
{
  tour: {
    id: string;
    titulo: string;
    tipo: 'apartamento' | 'casa' | 'comercial' | 'terreno' | 'evento';
    bairro: string | null;
    area_m2: number | null;
    quartos: number | null;
    valor: number | null;
    modalidade: 'venda' | 'aluguel' | 'temporada' | null;
    status_venda: 'disponivel' | 'reservado' | 'vendido';
    descricao: string | null;
    foto_capa_url: string | null;
    splat_url: string;
    has_cinematic_mode: boolean;
    is_password_protected: boolean;
  };
  imobiliaria: {
    slug: string;
    nome: string;
    logo_url: string | null;
    cor_primaria: string;
    whatsapp_principal: string;
  };
  corretor: {
    nome: string;
    creci: string | null;
    whatsapp: string;
    foto_url: string | null;
  } | null;
  hotspots: Array<{
    id: string;
    titulo: string;
    descricao: string | null;
    icone: string;
    posicao_x: number;
    posicao_y: number;
    posicao_z: number;
  }>;
  waypoints: Array<{
    id: string;
    ordem: number;
    position_x: number;
    position_y: number;
    position_z: number;
    target_x: number;
    target_y: number;
    target_z: number;
    duration_ms: number;
  }>;
}
// Response 401 → senha requerida
{ error: { code: 'PASSWORD_REQUIRED' } }
// Response 404 → não encontrado/arquivado
```

#### `POST /api/public/tours/[imobiliaria]/[tour]/verify-password`
```typescript
// Request: { password: string }
// Response 200: { ok: true } + Set-Cookie: tour-access-{tourId}=<jwt>; HttpOnly; SameSite=Lax; Max-Age=86400
// Response 401: { error: { code: 'INVALID_PASSWORD' } }
```

#### `POST /api/public/tours/[id]/track-view`
```typescript
// Request: { fingerprint?: string; duration_seconds?: number }
// Response 200: { ok: true }
// Implementação: dedupe por fingerprint+tourId nas últimas 30min
```

#### `POST /api/public/tours/[id]/track-whatsapp`
```typescript
// Request: { fingerprint?: string }
// Response 200: { ok: true }
```

### 16.2. Admin (require super_admin)

#### `POST /api/admin/imobiliarias`
```typescript
// Request
{
  nome: string;
  slug: string;        // único, kebab-case
  whatsapp_principal: string;
  email_contato?: string;
  endereco?: string;
  cor_primaria?: string;
  logo_url?: string;
}
// Response 201: { id: string; slug: string }
```

#### `PUT /api/admin/imobiliarias/[id]`
```typescript
// Request: Partial dos campos acima
// Response 200: { ok: true }
```

#### `POST /api/admin/imobiliarias/[id]/enable-login`
```typescript
// Cria conta no Supabase Auth + user_role 'imobiliaria' + must_change_password=true
// Request: { email: string }
// Response 200: { tempPassword: string; email: string }
// (mostra senha temporária ao admin para enviar via WhatsApp)
```

#### `POST /api/admin/imobiliarias/[id]/disable-login`
```typescript
// Remove user_role e desvincula user_id (mantém auth.users para histórico)
// Response 200: { ok: true }
```

#### `POST /api/admin/corretores`
```typescript
// Request
{
  imobiliaria_id: string;
  nome: string;
  creci?: string;
  whatsapp: string;
  email?: string;
  foto_url?: string;
}
// Response 201: { id: string }
```

#### `POST /api/admin/tours`
```typescript
// Request
{
  imobiliaria_id: string;
  corretor_id?: string;
  slug: string;
  titulo: string;
  tipo: 'apartamento' | 'casa' | 'comercial' | 'terreno' | 'evento';
  bairro?: string;
  area_m2?: number;
  quartos?: number;
  valor?: number;
  modalidade?: 'venda' | 'aluguel' | 'temporada';
  descricao?: string;
  is_public?: boolean;
  password?: string;            // se !is_public
  has_cinematic_mode?: boolean;
  cobranca_cliente_brl?: number;
}
// Response 201: { id: string; slug: string }
// status inicial = 'draft'
```

#### `PUT /api/admin/tours/[id]`
```typescript
// Request: Partial dos campos. Aceita também:
{
  status?: 'draft'|'uploading'|'processing'|'ready'|'failed'|'archived';
  status_message?: string;
  splat_url?: string;
  splat_r2_key?: string;
  foto_capa_url?: string;
  luma_capture_slug?: string;
  luma_cost_credits?: number;
  luma_cost_usd?: number;
}
```

#### `DELETE /api/admin/tours/[id]`
```typescript
// Soft-delete: archived_at = now()
// O splat fica no R2; após 7 dias job apaga (cron)
```

#### Multipart upload

##### `POST /api/admin/tours/[id]/upload/initiate`
```typescript
// Request
{
  fileName: string;
  fileSize: number;
  contentType: string;       // 'video/mp4', 'video/quicktime'
  totalChunks: number;
  chunkSize: number;
}
// Response 200
{
  sessionId: string;
  uploadId: string;          // R2 multipart UploadId
  key: string;               // tours/{tourId}/raw/{nanoid}.mp4
}
// Side effect: tours.status = 'uploading'
```

##### `POST /api/admin/tours/[id]/upload/sign`
```typescript
// Request: { sessionId: string; partNumber: number }
// Response 200: { url: string }   // presigned PUT URL, expira 1h
```

##### `POST /api/admin/tours/[id]/upload/complete`
```typescript
// Request: { sessionId: string; parts: Array<{ ETag: string; PartNumber: number }> }
// Response 200
{
  ok: true;
  videoUrl: string;          // URL pública do R2 do vídeo bruto
}
// Side effect:
//   - completa multipart no R2
//   - tours.video_r2_key, video_size_bytes, video_uploaded_at
//   - upload_sessions.status = 'completed'
```

##### `POST /api/admin/tours/[id]/upload/abort`
```typescript
// Cancela multipart no R2 + marca session como aborted
```

#### Luma processing

##### `POST /api/admin/tours/[id]/luma/submit`
```typescript
// Pré-condição: tours.video_r2_key existe e status = 'uploading' (após complete)
// Backend:
//   1. monta videoUrl pública do R2
//   2. chama lumaSubmitFromUrl(videoUrl, tour.titulo)
//   3. salva tours.luma_capture_slug, luma_submitted_at, status='processing'
//   4. log em luma_processing_log
// Response 200: { lumaSlug: string }
```

##### `GET /api/admin/tours/[id]/luma/status`
```typescript
// Polling manual (botão "Atualizar status")
// Backend: chama lumaGetStatus(tour.luma_capture_slug), atualiza tours
// Response 200
{
  status: 'processing'|'ready'|'failed';
  progress: number;
  current_stage: string;
  splat_url?: string;        // se ready
}
```

##### `POST /api/admin/tours/[id]/luma/mark-ready`
```typescript
// Atalho manual: founder cola URL do .splat (obtido manualmente do Luma)
// Backend baixa do URL externo → sobe pro R2 → atualiza tours
// Request: { splatUrl: string; lumaCostCredits?: number }
// Response 200: { splatUrl: string; status: 'ready' }
```

##### `POST /api/admin/tours/[id]/luma/log-cost`
```typescript
// Atualiza luma_cost_credits, luma_cost_usd manualmente
// Request: { credits: number; costUsd: number }
// Response 200: { ok: true }
```

#### Hotspots

##### `POST /api/admin/tours/[id]/hotspots`
```typescript
// Request
{
  titulo: string;
  descricao?: string;
  icone: 'suite'|'cozinha'|'varanda'|'banheiro'|'garagem'|'sala'|'piscina'|'jardim'|'churrasqueira'|'home_office'|'lavabo'|'closet'|'area_servico'|'generico';
  posicao_x: number;
  posicao_y: number;
  posicao_z: number;
}
// Validação: máximo 15 hotspots por tour
// Response 201: { id: string }
```

##### `PUT /api/admin/hotspots/[id]` / `DELETE /api/admin/hotspots/[id]`

#### Waypoints (Cinematic)

##### `POST /api/admin/tours/[id]/waypoints`
```typescript
// Request
{
  ordem: number;
  position_x, position_y, position_z: number;
  target_x, target_y, target_z: number;
  duration_ms?: number;       // default 4000
}
// Pré-condição: tours.has_cinematic_mode = true
```

#### Métricas admin

##### `GET /api/admin/metrics/dashboard`
```typescript
// Response 200
{
  tours: {
    total: number;
    by_status: { draft: number; processing: number; ready: number; failed: number };
    created_last_7d: number;
    created_last_30d: number;
  };
  imobiliarias: {
    total: number;
    com_login: number;
  };
  views_last_30d: number;
  whatsapp_clicks_last_30d: number;
  leads: {
    total: number;
    novo: number;
    em_contato: number;
    fechado: number;
  };
  financeiro: {
    custo_luma_total_usd: number;
    receita_total_brl: number;
    margem_total_brl: number;
    custo_medio_por_tour_usd: number;
    tempo_medio_processamento_horas: number;     // upload→ready
  };
}
```

##### `GET /api/admin/metrics/tours/[id]`
```typescript
{
  views: { total: number; daily: Array<{ date: string; count: number }> };
  whatsapp_clicks: { total: number; daily: Array<{ date: string; count: number }> };
  conversion_rate: number;        // wa_clicks / views
  avg_session_seconds: number | null;
}
```

#### Leads admin

##### `GET /api/admin/leads?status=&search=`
##### `PUT /api/admin/leads/[id]` — { status?, observacoes_internas? }

### 16.3. Cliente (require imobiliaria)

#### `GET /api/cliente/tours`
```typescript
// Lista APENAS tours da imobiliária do user logado
// Filtros via query: status, search
```

#### `PUT /api/cliente/tours/[id]/status`
```typescript
// Request: { status_venda: 'disponivel'|'reservado'|'vendido' }
// Response 200: { ok: true }
// Validação: tour deve pertencer à imobiliária do user
```

#### `GET /api/cliente/metrics/tours/[id]`
Mesmo shape do admin, mas validado por RLS.

### 16.4. OG dinâmico

#### `GET /api/og/[imobiliaria]/[tour]`
```typescript
// Retorna PNG 1200x630 gerado com @vercel/og
// Conteúdo: foto_capa_url no fundo (com overlay escuro), título, bairro, valor formatado, logo Imerso, logo imobiliária
```

---

## 17. Páginas e fluxos detalhados

### 17.1. Landing page (`/`)

**Layout**: header transparente (logo Imerso + nav + CTA) + hero full-viewport + seções abaixo.

**Hero**:
- Background: vídeo loop silencioso de um tour 3D girando (autoplay muted loop playsInline)
- Overlay gradient: from-background via-background/60 to-transparent
- Headline em Fraunces 600, max 2 linhas
- Subheadline em Geist secondary
- CTA primary "Solicitar tour" (rola para form) + CTA secondary "Ver exemplo" (abre tour demo)
- Animação: fade-in + slide-up no load

**Seções (em ordem)**:
1. **Hero** (acima)
2. **Tour exemplo embedado** — iframe do `/demo/exemplo` ou viewer inline com tour real configurado pelo founder
3. **Como funciona** (3 passos com ícones lucide)
4. **Casos de uso** (4 cards: imobiliárias, Airbnb, eventos, concessionárias)
5. **Antes/depois** — comparador visual: foto 2D estática vs gif/loop do mesmo cômodo em 3D
6. **Pricing** — card único com "Sob consulta" + CTA WhatsApp
7. **Depoimentos** — placeholder com 3 cards (founder preenche depois)
8. **FAQ** — accordion com 6 perguntas
9. **CTA final + Lead form** — `<LeadForm />`
10. **Footer** — logo, contato, redes, links legais (Termos, Privacidade, LGPD)

**Lead form** (`/components/landing/LeadForm.tsx`):
- Campos: nome*, whatsapp* (mask `+55 (XX) 9XXXX-XXXX`), tipo_imovel (select: Apartamento/Casa/Comercial/Outro), cidade, mensagem (textarea opcional)
- Validação: zod + react-hook-form
- Submit: POST `/api/public/leads` → ao receber response, redireciona browser para `whatsappRedirectUrl` (abre WhatsApp em nova aba) + mostra toast "Recebemos sua mensagem!"
- LGPD: checkbox obrigatório "Concordo com a política de privacidade"

### 17.2. Galeria pública `/[imobiliaria]`

**Server Component**. Server-side fetch dos tours `ready` e `is_public` da imobiliária (slug match).

**Layout**:
- Header com logo da imobiliária (custom branding), nome, WhatsApp principal
- Grid responsivo: 1 col mobile, 2 tablet, 3 desktop
- Cada card:
  - Imagem `foto_capa_url` (lazy)
  - Badge `status_venda`
  - Título
  - Bairro
  - Valor formatado (BRL)
  - Quartos / m² em ícones
  - Hover: zoom suave + shadow-glow-primary
  - Click: navega para `/[imobiliaria]/[tour]`

**Empty state**: ilustração + "Nenhum tour disponível ainda."

**404**: se imobiliária não existir ou estiver arquivada.

### 17.3. Viewer público `/[imobiliaria]/[tour]`

**Server Component** que faz fetch, depois passa props para Client Component que renderiza o viewer.

**Fluxo**:
1. SSR busca tour. Se `password_hash` setado e cookie `tour-access-{id}` ausente → redirect para `/[imobiliaria]/[tour]/senha`
2. Se ok, renderiza:
   - `<SplatViewer splatUrl={tour.splat_url} />` (full-screen)
   - `<LoadingScreen />` (overlay enquanto carrega; mostra %)
   - `<ViewerControls />` (UI flutuante)
   - `<WhatsAppFloating phone={corretor?.whatsapp || imobiliaria.whatsapp_principal} />`
   - `<HotspotMarker />` para cada hotspot (renderizado via projeção 3D→2D)
   - `<InfoPanel />` (drawer fechado por padrão; abre via botão Info)
   - `<MiniMap />` (canto inferior esquerdo, colapsável)
   - `<CinematicPlayer />` (só se `has_cinematic_mode`)
3. Tracking:
   - Ao carregar: POST `/api/public/tours/[id]/track-view` com fingerprint (gerado por `lib/utils/fingerprint.ts` com hash SHA-256 de UA+lang+screen+timezone, salvo em cookie 30d)
   - Ao desmontar: POST de novo com `duration_seconds`
   - Click no WhatsApp: POST `/api/public/tours/[id]/track-whatsapp` ANTES de abrir o link

**Botões de overlay** (todos ARIA-labeled, com tooltip):
- 🏠 Posição inicial (top-left)
- ℹ️ Info (top-left, abre InfoPanel)
- 🔗 Compartilhar (top-right) → ShareModal
- 📷 Screenshot (top-right) → baixa PNG
- ⛶ Fullscreen (top-right)
- ⚙️ Quality (top-right) → dropdown
- 🗺️ Mini-map toggle (bottom-left)
- ▶️ Tour Automático (centro inferior, só se has_cinematic_mode) — botão dourado destacado (accent)
- 💬 WhatsApp flutuante (bottom-right) — sempre visível

**Loading screen**:
- Background = `--background`
- Logo Imerso pulsing
- Texto: "Preparando seu tour..."
- Progress: % do download do .splat
- Sub: "Isso leva alguns segundos. Vale a pena."

### 17.4. Senha do tour `/[imobiliaria]/[tour]/senha`

Form simples: input password + botão Acessar. Submit POST `/api/public/tours/[imobiliaria]/[tour]/verify-password`. Em sucesso, server seta cookie httpOnly e redirect para `/[imobiliaria]/[tour]`.

### 17.5. Painel admin

**Layout** (`/painel/layout.tsx`): sidebar fixa esquerda + topbar com nome do user + dropdown logout.

**Sidebar** (lucide icons):
- 📊 Dashboard
- 🏢 Imobiliárias
- 🏠 Tours
- 📨 Leads
- ⚙️ Configurações

#### `/painel/login`
- Form: email + senha
- Submit via Supabase Auth `signInWithPassword`
- Após sucesso: requireSuperAdmin verifica role; se não tiver, faz signOut e mostra erro
- Redirect para `/painel/dashboard`

#### `/painel/dashboard`
- 4 cards KPI no topo: Total tours / Tours prontos / Total views 30d / Cliques WhatsApp 30d
- Gráfico (recharts): tours criados por dia (últimos 30 dias)
- Gráfico: views agregadas por dia
- Card financeiro: receita total / custo Luma total / margem total / margem média por tour
- Tabela: últimos 5 leads + 5 últimos tours
- Botão "Ver todos" leva para a respectiva listagem

#### `/painel/imobiliarias`
- Tabela: logo, nome, slug, qtd_tours, has_login, criado_em, ações (editar, ativar login)
- Botão "+ Nova imobiliária"
- Search por nome
- Filtro: com_login / sem_login

#### `/painel/imobiliarias/nova`
- Form completo (zod): nome, slug (auto-gerado de nome, editável), CNPJ, logo (upload R2 → `imobiliarias/{slug}/logo.png`), cor_primaria (color picker default `#4F8EF7`), whatsapp_principal (mask), email_contato, endereco, cidade, estado
- Submit → POST `/api/admin/imobiliarias` → redirect para detalhes

#### `/painel/imobiliarias/[id]`
- Tabs: Dados / Corretores / Tours / Login
- **Aba Dados**: form de edição
- **Aba Corretores**: lista + botão "+ Adicionar corretor" (modal com nome, CRECI, WhatsApp, foto)
- **Aba Tours**: tabela read-only de tours dessa imobiliária
- **Aba Login**: 
  - Se `has_login = false`: botão "Ativar login" → modal pede email → POST `/api/admin/imobiliarias/[id]/enable-login` → mostra senha temporária em código + botão copiar + texto "Envie estas credenciais via WhatsApp para a imobiliária. A senha deve ser trocada no primeiro acesso."
  - Se `has_login = true`: mostra email vinculado, data de ativação, botão "Resetar senha" (gera nova temp), botão "Desativar login"

#### `/painel/tours`
- Tabela: thumb, título, imobiliária (slug), corretor, status (badge colorido), criado_em, views, ações
- Filtros: status (multi-select), imobiliária (select), search por título
- Botão "+ Novo tour"
- Click na linha → `/painel/tours/[id]`

#### `/painel/tours/novo`
- Form em steps:
  - **Step 1 - Imobiliária e Corretor**: selects (busca async no Supabase)
  - **Step 2 - Dados do imóvel**: titulo, slug (auto-gerado), tipo, bairro, area_m2, quartos, valor, modalidade, descricao
  - **Step 3 - Foto de capa**: upload (preview)
  - **Step 4 - Privacidade**: toggle is_public; se off, input password (force confirmar)
  - **Step 5 - Plus**: toggle has_cinematic_mode (mostrar selo "PLUS" dourado)
  - **Step 6 - Cobrança**: cobranca_cliente_brl (para tracking de margem)
- Submit → POST → redirect para `/painel/tours/[id]/upload`

#### `/painel/tours/[id]`
Tabs:
- **Dados**: form de edição completo
- **Mídia**: foto de capa atual + reupload
- **Hotspots**: link para `/painel/tours/[id]/hotspots`
- **Cinematic**: link para `/painel/tours/[id]/waypoints` (só se has_cinematic_mode)
- **Métricas**: link para `/painel/tours/[id]/metricas`
- **Avançado**:
  - URL pública: `https://app.com/[imob]/[slug]` (botão copiar)
  - URL splat: read-only
  - Status atual + botão "Atualizar status" (chama `/luma/status` se em processing)
  - Tracking de custo Luma (form: créditos usados, custo USD)
  - Botão "Marcar como pronto manualmente" → modal com input para colar URL do splat
  - Botão "Reprocessar" (volta status para draft)
  - Botão "Arquivar" (soft-delete) — destrutivo, com confirm dialog

#### `/painel/tours/[id]/upload`
- Visual: dropzone gigante (drag-and-drop) + click para selecionar
- Aceita: video/mp4, video/quicktime, video/x-m4v
- Limite: NEXT_PUBLIC_MAX_VIDEO_SIZE_MB (2GB)
- Após selecionar:
  - Mostra: nome do arquivo, tamanho formatado, duração estimada (HTML5 `<video>` metadata)
  - Botão "Iniciar upload" → useUploadMultipart hook
  - Progress bar com %, MB enviados / total, velocidade média
  - Botão "Cancelar" durante upload
- Após complete:
  - Mostra "Upload concluído. Enviando para processamento..."
  - Auto-chama `/api/admin/tours/[id]/luma/submit`
  - Mostra: "Em processamento na Luma. Slug: {luma_capture_slug}"
  - Botão "Verificar status" + link "Abrir no Luma"
  - Mensagem: "Você pode fechar esta página. O processamento continua. Volte aqui mais tarde para atualizar o status."

#### `/painel/tours/[id]/hotspots`
- Layout split: 70% viewer 3D em modo edição / 30% painel lateral direito
- Painel lateral: lista de hotspots existentes com drag-handle (reordenar), botão "+ Adicionar hotspot"
- Modo "+ Adicionar hotspot":
  - Cursor vira crosshair
  - Click na cena → captura ponto 3D (raycast)
  - Modal: titulo*, descricao, icone (select com preview), botão Salvar
- Click em hotspot existente: abre modal de edição
- Limite visual: contador "X / 15 hotspots"

#### `/painel/tours/[id]/waypoints`
Análogo a hotspots, mas:
- Botão "+ Adicionar waypoint" → captura POSIÇÃO atual da câmera (não um ponto na cena)
- Lista mostra ordem + thumbnail (screenshot do ponto) + duração
- Botão "Pré-visualizar" reproduz a animação completa
- Slider de duração entre 1000ms e 10000ms

#### `/painel/leads`
- Tabela: nome, whatsapp, tipo_imovel, cidade, status, origem, criado_em
- Filtro por status (badge clicável)
- Click → drawer com detalhes + botões "Marcar em contato" / "Fechado" / "Perdido" + textarea observacoes_internas + link wa.me direto

#### `/painel/configuracoes`
- Form: luma_credit_cost_usd, usd_to_brl_rate, og_image_default
- Editar valores em system_config

### 17.6. Cliente (imobiliária logada)

**Layout** (`/cliente/layout.tsx`): mesmo padrão admin mas sidebar reduzida (Tours, Perfil).

#### `/cliente/login`
- Form email + senha
- Após sucesso: se `must_change_password`, redirect para `/cliente/trocar-senha`
- Senão, redirect `/cliente/tours`

#### `/cliente/trocar-senha`
- Form: senha atual + nova senha + confirmar
- Update via Supabase Auth + set `must_change_password = false`

#### `/cliente/tours`
- Grid igual à galeria pública mas com:
  - Badge editável de status_venda
  - Botão "Copiar link" (público)
  - Botão "Ver métricas" (drawer)
  - QR code download

#### `/cliente/tours/[id]`
- Visual: viewer público + abaixo: métricas (views, wa_clicks, gráfico 30d)
- Toggle status_venda

---

## 18. Design System

### Componentes UI base (`src/components/ui/`)

Criar componentes inspirados em shadcn/ui, adaptados ao tema Imerso (dark only).

#### `Button.tsx`
Variants (CVA):
- `primary` — azul Imerso, hover glow
- `accent` — champagne, para CTAs especiais (ex: "Tour Automático Plus")
- `ghost` — transparente
- `outline` — border-strong, hover surface-elevated
- `destructive` — error

Sizes: `sm` (h-8), `md` (h-10, default), `lg` (h-12), `icon` (h-10 w-10).

Sempre com `transition-all duration-200`, `disabled:opacity-50 disabled:pointer-events-none`, focus ring `ring-2 ring-primary/40`.

#### `Input.tsx` / `Textarea.tsx` / `Select.tsx`
- Background `bg-surface-elevated`
- Border `border-border`
- Focus: `ring-2 ring-primary/40 border-primary`
- Placeholder `text-muted`
- Padding `px-4 py-2`

#### `Dialog.tsx` (Radix)
- Overlay com backdrop-blur + `bg-overlay`
- Content centered, `max-w-md`, `bg-surface-elevated`, `border-border`, `rounded-lg`, `shadow-lg-dark`

#### `Toast.tsx` (Sonner)
- Theme dark, Imerso colors
- Position: bottom-right desktop, top mobile

#### `Card.tsx`
- `bg-surface border border-border rounded-lg p-6`
- Hover variant: `hover:bg-surface-elevated transition-colors`

#### `Badge.tsx`
Variants por status:
- `disponivel` — bg-success/15 text-success
- `reservado` — bg-warning/15 text-warning
- `vendido` — bg-text-muted/15 text-text-muted
- `draft` — bg-text-muted/15 text-text-muted
- `processing` — bg-info/15 text-info, com `animate-pulse-soft`
- `ready` — bg-success/15 text-success
- `failed` — bg-error/15 text-error

#### `Progress.tsx` (Radix)
- Track `bg-surface-elevated`, height 8px
- Indicator gradient `from-primary to-accent`

#### `DataTable.tsx`
Wrapper genérico:
- Header sticky, sortable
- Pagination (10/25/50/100)
- Search bar integrada
- Empty state com ilustração + CTA
- Skeleton loader durante fetch

#### `Skeleton.tsx`
- `bg-surface-elevated rounded animate-pulse-soft`

#### `Dropzone.tsx`
- `border-2 border-dashed border-border-strong`
- Hover: `bg-surface-hover border-primary`
- Drop: scale 1.02 + glow

### Componentes layout

#### `PublicHeader.tsx`
- Sticky top, transparent → glass on scroll (`window.scrollY > 50`)
- Logo Imerso (esq) + nav centro (Como funciona, Casos, FAQ) + LocaleSwitcher + CTA WhatsApp (dir)
- Mobile: menu hamburger drawer

#### `PublicFooter.tsx`
- `bg-surface border-t border-border`
- 4 colunas: Sobre / Empresa (Termos, Privacidade, LGPD) / Contato (WhatsApp, e-mail) / Redes
- Copyright + "Feito em Balneário Camboriú 🌊"

#### `AdminSidebar.tsx`
- `bg-surface border-r border-border`, w-64 desktop, drawer mobile
- Logo no topo
- Items com ícone lucide + label
- Active: `bg-surface-elevated border-l-2 border-primary`

---

## 19. Regras de negócio

### 19.1. Slugs
- Gerados automaticamente do nome via `slugify` (lowercase, remove acentos, espaços → `-`)
- Editáveis pelo founder antes de salvar
- Validados via trigger SQL (regex `^[a-z0-9]+(-[a-z0-9]+)*$`)
- Tour: único POR imobiliária (`unique(imobiliaria_id, slug)`)
- Imobiliária: globalmente único

### 19.2. Status de tour — máquina de estados

```
draft       → uploading       (ao iniciar upload do vídeo)
uploading   → processing      (upload completo + enviado para Luma)
processing  → ready           (Luma retornou splat OK)
processing  → failed          (Luma retornou erro)
failed      → uploading       (reprocessar)
ready       → archived        (soft delete)
archived    → ready           (desarquivar dentro dos 7 dias)
qualquer    → draft           (super_admin pode reverter manualmente)
```

Apenas `ready + is_public + archived_at IS NULL` é acessível publicamente.

### 19.3. Soft-delete
- `DELETE` API marca `archived_at = now()`
- Tour fica invisível na listagem pública e galeria
- Imobiliária logada vê em tab "Arquivados" com botão "Restaurar" (válido 7 dias)
- Cron job `purge_archived_tours()` roda diariamente às 03:00 BRT, deleta registros > 7d e remove arquivos R2

### 19.4. Login de imobiliária — manual
- Founder ativa manualmente (não automático aos 5 tours)
- Ao ativar:
  1. Backend cria user em `auth.users` via service role
  2. Insert em `user_roles` com role `imobiliaria` + `imobiliaria_id`
  3. Atualiza `imobiliarias.user_id` (trigger seta `has_login = true`)
  4. Gera senha temporária 8 chars (mix letras/números) via `nanoid(8)`
  5. Set `must_change_password = true`
  6. Retorna senha plain ao founder para enviar via WhatsApp/e-mail
- No primeiro login: redirect obrigatório para `/cliente/trocar-senha`

### 19.5. Tour privado (senha)
- Senha armazenada como bcrypt hash (`bcryptjs`, salt 10)
- Verificação backend: compara senha plain com hash
- Sucesso: backend gera JWT (15min, secret `SUPABASE_JWT_SECRET`) com payload `{ tourId, exp }`, set como cookie httpOnly `tour-access-{tourId}` (Max-Age 24h)
- GETs subsequentes validam cookie

### 19.6. Hotspots
- Limite estrito: 15 por tour (validação backend)
- Posições em coordenadas 3D do espaço do splat (Three.js convention)
- Renderização cliente: `THREE.Vector3.project(camera)` para 3D→2D em cada frame
- Visibilidade: ocultar se `vector.z > 1` (atrás da câmera)

### 19.7. Cinematic Mode
- Disponível APENAS se `tour.has_cinematic_mode = true` (toggle pago no admin)
- Mínimo 2 waypoints para o player aparecer
- Animação: tween linear entre waypoints com `lerp` em position e target dos OrbitControls
- Pausa: arrastar mouse cancela animação imediatamente
- Botão "Tour Automático" tem destaque visual em `accent` (champagne) sinalizando premium

### 19.8. WhatsApp tracking
- Click no botão flutuante:
  1. POST `/api/public/tours/[id]/track-whatsapp` (fingerprint, fire-and-forget com `keepalive: true`)
  2. Imediatamente abre `wa.me/{phone}?text={mensagem}` em nova aba
- Mensagem default: `Olá! Vi seu imóvel "{titulo}" no tour 3D. Tenho interesse em saber mais.`
- Telefone: `corretor.whatsapp` || `imobiliaria.whatsapp_principal` || `NEXT_PUBLIC_WHATSAPP_FOUNDER`

### 19.9. Tracking de visualizações
- Fingerprint anônimo client-side: SHA-256(`UA + screen + lang + timezone`)
- Salvo em cookie `imerso_fp` (30 dias)
- Dedupe: views do mesmo fingerprint no mesmo tour em janela de 30min são ignoradas
- `duration_seconds` atualizado em `beforeunload` ou a cada 30s via update

### 19.10. LGPD
- Cookie banner aparece se cookie `imerso_lgpd_consent` ausente
- Bloqueia tracking até consentimento
- Botões: "Aceitar todos" / "Apenas essenciais" / "Personalizar"
- Página `/lgpd` com texto + form para solicitar exportação/deleção

### 19.11. Custos e margem
- Toda chamada Luma → log em `luma_processing_log`
- Founder atualiza `luma_cost_credits` e `luma_cost_usd` manualmente quando souber o valor real
- `tours.margem_brl` é coluna calculada (generated): `cobranca_cliente_brl - (luma_cost_usd * usd_to_brl_rate)`
- Dashboard mostra agregados

### 19.12. Identidade visual da imobiliária
- Logo aparece em:
  - Header do viewer público (canto superior esq, abaixo do logo Imerso)
  - InfoPanel
  - OG image
- `cor_primaria` customiza acentos sutis (futuro V2)

### 19.13. Branding Imerso
- "Powered by Imerso" sempre visível no viewer público (canto inferior, glassmorphism)
- Sem opção de remover branding no MVP (V2: white-label)

### 19.14. Fluxo presigned URL — segurança
- Backend valida que o usuário é super_admin antes de gerar URL
- URL expira em 1h
- Key segue padrão: `tours/{tourId}/raw/{nanoid}.{ext}` (vídeo) e `tours/{tourId}/splat/{nanoid}.splat`
- CORS no R2 já configurado para aceitar PUT do origin do app

### 19.15. Validação de dados
- Toda rota API valida com Zod
- Erros retornados padronizados:
  ```typescript
  { error: { code: 'VALIDATION_ERROR'|'NOT_FOUND'|'UNAUTHORIZED'|'FORBIDDEN'|'CONFLICT'|'INTERNAL', message: string, details?: any } }
  ```
- Status codes: 200/201/204 sucesso, 400 validação, 401 não autenticado, 403 não autorizado, 404 não encontrado, 409 conflito, 500 erro interno

---

## 20. SEO e OG dinâmico

### Meta tags

#### Landing (`/`)
```typescript
export const metadata = {
  title: 'Imerso — Tours imobiliários 3D fotorrealistas',
  description: 'Transforme seu imóvel em uma experiência imersiva navegável pelo celular. Sem app, sem hardware.',
  openGraph: {
    title: 'Imerso — Tours imobiliários 3D',
    description: 'Tours virtuais que vendem antes da visita.',
    images: ['/og-default.png'],
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};
```

#### Viewer (`/[imobiliaria]/[tour]`)
```typescript
export async function generateMetadata({ params }) {
  const { imobiliaria, tour } = await params;
  const data = await fetchTourMeta(imobiliaria, tour);
  if (!data) return {};
  return {
    title: `${data.titulo} — ${data.imobiliariaNome}`,
    description: (data.descricao ?? '').slice(0, 160),
    openGraph: {
      title: data.titulo,
      description: data.descricao,
      images: [`${process.env.NEXT_PUBLIC_APP_URL}/api/og/${imobiliaria}/${tour}`],
      type: 'website',
    },
  };
}
```

### `src/app/api/og/[imobiliaria]/[tour]/route.tsx`

```tsx
import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'edge';

export async function GET(_req: Request, { params }: { params: Promise<{ imobiliaria: string; tour: string }> }) {
  const { imobiliaria, tour } = await params;
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('tours')
    .select(`
      titulo, foto_capa_url, valor, area_m2, quartos, bairro, modalidade,
      imobiliaria:imobiliarias!inner(nome, logo_url, slug)
    `)
    .eq('slug', tour)
    .eq('imobiliarias.slug', imobiliaria)
    .eq('status', 'ready')
    .eq('is_public', true)
    .is('archived_at', null)
    .single();

  if (!data) return new Response('Not found', { status: 404 });

  const valorFmt = data.valor
    ? `R$ ${Number(data.valor).toLocaleString('pt-BR')}`
    : '';

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '1200px', height: '630px', position: 'relative', fontFamily: 'sans-serif' }}>
        {data.foto_capa_url && (
          <img
            src={data.foto_capa_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(10,14,26,0.4) 0%, rgba(10,14,26,0.95) 100%)',
        }} />
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          padding: '60px', color: '#F5F2EC', position: 'relative', zIndex: 10, width: '100%',
        }}>
          <div style={{ fontSize: 28, opacity: 0.8, marginBottom: 12 }}>
            {(data.imobiliaria as any).nome}
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, marginBottom: 16, lineHeight: 1.1 }}>
            {data.titulo}
          </div>
          <div style={{ fontSize: 32, color: '#D4A574' }}>
            {data.bairro ?? ''}
            {data.area_m2 ? ` · ${data.area_m2}m²` : ''}
            {data.quartos ? ` · ${data.quartos} quartos` : ''}
          </div>
          {valorFmt && (
            <div style={{ fontSize: 40, fontWeight: 600, marginTop: 16 }}>{valorFmt}</div>
          )}
          <div style={{ position: 'absolute', top: 60, right: 60, fontSize: 24, fontWeight: 600, color: '#4F8EF7' }}>
            Imerso
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
```

### Sitemap (`src/app/sitemap.ts`)

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient();
  const { data: tours } = await supabase
    .from('tours')
    .select('slug, updated_at, imobiliaria:imobiliarias!inner(slug)')
    .eq('status', 'ready')
    .eq('is_public', true)
    .is('archived_at', null);

  const base = process.env.NEXT_PUBLIC_APP_URL!;
  const tourUrls = (tours ?? []).map((t: any) => ({
    url: `${base}/${t.imobiliaria.slug}/${t.slug}`,
    lastModified: new Date(t.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    ...tourUrls,
  ];
}
```

### Robots (`src/app/robots.ts`)

```typescript
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/painel', '/cliente', '/api'] },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  };
}
```

---

## 21. LGPD

### `src/components/lgpd/CookieBanner.tsx`

Especificação:
- Position: `fixed bottom-0 left-0 right-0 z-50`
- Aparece se cookie `imerso_lgpd_consent` ausente
- Visual: `glass` background, `border-t border-border`, `p-4 md:p-6`
- Texto curto: "Usamos cookies para melhorar sua experiência e analisar o uso do site. Você pode aceitar todos, apenas os essenciais, ou personalizar."
- 3 botões: "Aceitar todos" (primary) / "Apenas essenciais" (outline) / "Personalizar" (ghost)
- Modal "Personalizar": toggle Analytics on/off (impacta tracking de views/clicks)
- Salva em cookie `imerso_lgpd_consent` (365 dias) com JSON: `{ analytics: bool, timestamp: ISO }`
- Hook `useLgpdConsent()` exporta `{ analyticsAllowed, hasConsent, accept, reject, customize }`
- Tracking calls (`track-view`, `track-whatsapp`) checam `analyticsAllowed` antes de disparar

### Páginas legais (placeholders)

#### `/termos`
Estrutura mínima (founder substitui o texto):
1. Aceitação dos termos
2. Descrição do serviço
3. Cadastro e conta
4. Obrigações do usuário
5. Propriedade intelectual
6. Limitação de responsabilidade
7. Modificações nos termos
8. Foro: Comarca de Balneário Camboriú/SC

#### `/privacidade`
Estrutura mínima:
1. Dados coletados (nome, WhatsApp, e-mail, IP, fingerprint anônimo)
2. Finalidade (prestação de serviço, comunicação, analytics)
3. Base legal LGPD (consentimento + execução de contrato + legítimo interesse)
4. Compartilhamento (Luma AI para processamento, Cloudflare para storage, Supabase para DB)
5. Segurança
6. Retenção
7. Direitos do titular (LGPD art. 18)
8. Cookies
9. Contato DPO: [e-mail do founder]

#### `/lgpd`
- Lista de direitos LGPD art. 18 com explicação curta de cada
- Form: nome, e-mail, CPF (opcional), tipo de solicitação (acesso/correção/anonimização/portabilidade/eliminação/informação), descrição
- Submit: envia e-mail para founder via Resend OU `mailto:` link como fallback no MVP

> ⚠️ **Texto exato dos termos é responsabilidade do founder.** Usar placeholders bem estruturados que ele substitui depois.

---

## 22. Analytics e métricas

### Métricas-chave (dashboard admin)

| Métrica | Cálculo SQL |
|---|---|
| Total tours | `count(*) from tours where archived_at is null` |
| Tours por status | `count(*) group by status` |
| Tours criados últimos 7d/30d | `count(*) where created_at >= now() - interval 'X days'` |
| Total imobiliárias | `count(*) from imobiliarias where archived_at is null` |
| Imobiliárias com login | `count(*) where has_login = true` |
| Views 30d | `count(*) from tour_views where created_at >= now() - 30d` |
| Cliques WhatsApp 30d | `count(*) from tour_whatsapp_clicks where created_at >= now() - 30d` |
| Conversion rate | `wa_clicks / nullif(views, 0)` |
| Custo Luma total USD | `sum(luma_cost_usd) from tours` |
| Receita total BRL | `sum(cobranca_cliente_brl) from tours` |
| Margem total BRL | `sum(margem_brl) from tours` |
| Custo médio por tour USD | `avg(luma_cost_usd) where luma_cost_usd is not null` |
| Tempo médio processamento (h) | `avg(extract(epoch from (luma_completed_at - luma_submitted_at))/3600)` |

### Métricas por tour (`/painel/tours/[id]/metricas`)

Períodos: 7d / 30d / 90d / total (toggle).

- **Views diárias** — gráfico de linha (recharts LineChart)
- **Cliques WhatsApp diários** — gráfico de barras
- **Tempo médio de sessão** — número grande
- **Conversion rate** — % grande (wa_clicks / views)
- **Top referrers** — tabela top 5 (de `tour_views.referrer`)
- **Distribuição geográfica** — tabela top 10 cidades (de `ip_city`)
- **Funil**: views → tempo > 30s → cliques WhatsApp

### Implementação dos endpoints de métrica

```typescript
// /api/admin/metrics/dashboard
export async function GET() {
  const { user } = await requireSuperAdmin();
  const supabase = createAdminClient();

  const [tours, imobs, views30, wa30, leads, financeiro] = await Promise.all([
    supabase.rpc('metrics_tours_summary'),
    supabase.rpc('metrics_imobiliarias_summary'),
    supabase.rpc('metrics_views_30d'),
    supabase.rpc('metrics_wa_30d'),
    supabase.rpc('metrics_leads_summary'),
    supabase.rpc('metrics_financeiro'),
  ]);

  return Response.json({ tours, imobiliarias: imobs, views_last_30d: views30, /* ... */ });
}
```

> Criar funções SQL `metrics_*` em uma migration para encapsular as queries pesadas e facilitar reuso.

---

## 23. Ordem de implementação

> Construir nesta ordem **EXATA**. Não pular para o próximo até o anterior estar funcionando e testado.

### Sprint 1 — Fundação (Dia 1-2)

1. Criar projeto Next.js 15 + Tailwind + TypeScript (comando da seção 2)
2. Instalar todas as dependências
3. Configurar `tsconfig`, `tailwind.config`, `next.config`, `globals.css`
4. Criar estrutura de pastas (seção 4)
5. Setup Supabase: rodar migrations 1-4 no SQL Editor, na ordem
6. Criar super_admin manualmente: Supabase Auth → Add User (email + senha) → pegar UUID → rodar `insert into public.user_roles (user_id, role) values ('UUID', 'super_admin');`
7. Gerar `database.types.ts` via Supabase CLI
8. Setup i18n: routing, navigation, request, middleware, esqueletos `messages/{pt,en,es}.json`
9. Setup Supabase clients (browser, server, admin, middleware)
10. Criar componentes UI base mínimos: Button, Input, Card, Badge, Dialog, Toast, Progress, Skeleton

**Critério de avanço:** projeto roda em `npm run dev`, abre em `localhost:3000`, sem erros no console.

### Sprint 2 — Auth + Painel admin esqueleto (Dia 3)

11. Implementar `/painel/login` funcional
12. Layout `/painel/layout.tsx` com sidebar + topbar + guard `requireSuperAdmin`
13. `/painel/dashboard` com KPIs mock (estilizado, dados zerados)
14. Implementar logout

**Critério:** consegue logar como super_admin, vê dashboard, faz logout.

### Sprint 3 — CRUDs core (Dia 4-5)

15. `/painel/imobiliarias` (list + new + edit + soft-delete)
16. `/painel/imobiliarias/[id]/corretores` (CRUD modal-based)
17. `/painel/tours` (list com filtros)
18. `/painel/tours/novo` (multi-step form)
19. `/painel/tours/[id]` (edit com tabs)

**Critério:** consegue criar imobiliária + corretor + tour vazio (status draft) end-to-end.

### Sprint 4 — Upload e Luma (Dia 6-7)

20. Implementar `lib/r2/*` (client, multipart, presigned)
21. Implementar `lib/luma/*` (client wrapper)
22. APIs upload: `/api/admin/tours/[id]/upload/{initiate,sign,complete,abort}`
23. APIs Luma: `/api/admin/tours/[id]/luma/{submit,status,mark-ready,log-cost}`
24. Hook `useUploadMultipart`
25. Página `/painel/tours/[id]/upload` com dropzone + progress
26. **TESTE CRÍTICO**: subir vídeo de teste 500MB+ → ver no R2 + submit Luma OK

**Critério:** vídeo sobe via multipart, fica no R2, é submetido para Luma com sucesso, status muda para `processing`.

### Sprint 5 — Viewer 3D (Dia 8-9) ⭐ PRIORIDADE MÁXIMA

27. Implementar `lib/splat/*` (loader, lod, presets)
28. Componente `<SplatViewer />` core
29. `<LoadingScreen />` com branding Imerso
30. `<ViewerControls />` com layout dos botões (sem features ainda)
31. `<WhatsAppFloating />` funcional
32. `<InfoPanel />` (drawer)
33. Server-side fetch + página `/[imobiliaria]/[tour]`
34. **TESTE CRÍTICO**: tour funciona end-to-end no link público, mobile e desktop, sem erros JS

**Critério INEGOCIÁVEL:** tour 3D carrega, navega fluido, sem crash em iPhone/Android/Desktop.

### Sprint 6 — Galeria pública e landing (Dia 10)

35. `/[imobiliaria]` — galeria pública
36. Landing page completa (todas as seções)
37. `<LeadForm />` + API `/api/public/leads`
38. Páginas legais com placeholders

**Critério:** landing pronta para captar leads + galeria pública mostra tours.

### Sprint 7 — Features avançadas viewer (Dia 11-12)

39. Hotspots: admin editor + render no viewer
40. Cinematic Mode: admin waypoint editor + player
41. Quality toggle, mini-map, screenshot, share modal, fullscreen, reset camera
42. Tour com senha (`/[imobiliaria]/[tour]/senha`)

**Critério:** todas as features de viewer da seção 17.3 funcionam.

### Sprint 8 — Cliente (imobiliária logada) (Dia 13)

43. `/cliente/login` + `/cliente/trocar-senha`
44. `/cliente/tours` + métricas
45. APIs cliente
46. Botão "Ativar login" no painel admin (gera senha temporária)

**Critério:** founder consegue ativar login para uma imobiliária e ela consegue logar e ver seus tours.

### Sprint 9 — Métricas, OG, LGPD (Dia 14)

47. Dashboard com dados reais (gráficos recharts)
48. Página `/painel/tours/[id]/metricas`
49. OG image dinâmica (`/api/og/...`)
50. Sitemap + robots
51. Cookie banner LGPD
52. Tracking de views + WhatsApp clicks

**Critério:** preview do tour no WhatsApp/Instagram mostra OG bonita, LGPD em conformidade.

### Sprint 10 — Polimento (Dia 15)

53. Empty states bonitos em todas as listas
54. Skeleton loaders durante fetches
55. Mensagens de erro amigáveis com toast
56. Animações de transição
57. Mobile testing exaustivo (375px, 414px, iPhone SE, Galaxy S20)
58. Lighthouse: Performance > 80, Accessibility > 95, SEO > 95
59. Deploy Vercel
60. Smoke test em produção (criar 1 tour real end-to-end)

**Critério:** MVP em produção com 1 tour real funcionando.

---

## 24. Critérios de aceite

> O MVP só é considerado pronto quando TODOS estes critérios passam.

### 🎯 Inegociáveis (bloqueantes)

- [ ] Tour 3D carrega e roda fluido em mobile e desktop pelo link público `/[imobiliaria]/[tour]`
- [ ] Não há erros JS no console em mobile/desktop
- [ ] Loading screen aparece e desaparece corretamente
- [ ] Botão WhatsApp flutuante abre `wa.me` corretamente com mensagem pré-preenchida
- [ ] InfoPanel mostra todos os dados do imóvel
- [ ] Reset de câmera funciona
- [ ] Fullscreen funciona em iOS Safari, Chrome Android, Chrome Desktop, Safari Desktop, Firefox
- [ ] Quality toggle aplica preset sem crash
- [ ] Tour privado pede senha e libera com cookie de 24h
- [ ] Tour com `archived_at` retorna 404 público
- [ ] Tour com `is_public = false` sem cookie redireciona para `/senha`

### ✅ Painel admin

- [ ] Super admin loga e vê dashboard
- [ ] Cria imobiliária, edita, ativa login com senha temporária
- [ ] Cria corretor vinculado à imobiliária
- [ ] Cria tour com slug auto-gerado
- [ ] Sobe vídeo 500MB+ via multipart sem timeout
- [ ] Submete para Luma e vê status "processing"
- [ ] Marca tour como "ready" manualmente colando URL splat
- [ ] Cria, edita, deleta hotspots (limite 15 respeitado)
- [ ] Cria waypoints e visualiza preview do cinematic
- [ ] Soft-delete tour (some da galeria; aparece em arquivados)
- [ ] Restaura tour arquivado dentro de 7 dias
- [ ] Vê dashboard com KPIs reais
- [ ] Vê métricas por tour (views, wa_clicks, gráficos)
- [ ] Configura `usd_to_brl_rate` e vê margem atualizar

### ✅ Cliente (imobiliária logada)

- [ ] Loga com email + senha temporária
- [ ] É forçado a trocar senha no primeiro acesso
- [ ] Vê só tours da própria imobiliária (RLS validado)
- [ ] Copia link público de cada tour
- [ ] Vê métricas básicas (views + wa_clicks)
- [ ] Marca status_venda (disponível/reservado/vendido)

### ✅ Visitante público

- [ ] Acessa landing
- [ ] Preenche lead form, é redirecionado ao WhatsApp do founder
- [ ] Vê galeria pública `/[imobiliaria]`
- [ ] Acessa tour `/[imobiliaria]/[tour]`
- [ ] Cookie banner LGPD aparece no primeiro acesso e respeita escolha
- [ ] Tracking de view só dispara se analytics aceito
- [ ] OG preview funciona ao colar link no WhatsApp/Instagram

### ✅ Performance

- [ ] Lighthouse mobile Performance ≥ 80
- [ ] Lighthouse Accessibility ≥ 95
- [ ] Lighthouse SEO ≥ 95
- [ ] LCP < 2.5s na landing
- [ ] Splat com até 200MB carrega em < 15s em conexão 50Mbps

### ✅ Segurança

- [ ] RLS habilitado em todas as tabelas
- [ ] Service role key nunca exposta no client
- [ ] Senhas de tour com bcrypt
- [ ] Tokens JWT de tour expiram em 15min
- [ ] Cookies httpOnly + sameSite=lax
- [ ] CSP + X-Frame-Options configurados
- [ ] `.env.local` no `.gitignore`

### ✅ Acessibilidade

- [ ] Todos os botões com aria-label
- [ ] Tabbing funcional em todos os forms
- [ ] Contraste mínimo AA
- [ ] Focus rings visíveis
- [ ] Sem `outline: none` sem substituto

### ✅ i18n

- [ ] PT/EN/ES funcionam sem chaves faltando
- [ ] LocaleSwitcher altera locale e persiste
- [ ] URLs `/en/...` e `/es/...` funcionam

### ✅ LGPD

- [ ] Banner aparece no primeiro acesso
- [ ] Consentimento persiste 365d
- [ ] Tracking respeita escolha do usuário
- [ ] Páginas /termos, /privacidade, /lgpd existem com placeholders

---

## 25. Roadmap V2 (NÃO IMPLEMENTAR NO MVP — apenas documentar)

> Estas features ficam para a próxima fase. **Não construir agora.** Apenas deixar comentários `// V2:` em pontos de extensão para facilitar futuro.

### V2.1. Pagamentos
- Integração Stripe (assinaturas mensais/anuais)
- Cupons de desconto
- Trial gratuito 7 dias
- NF-e via Iugu/Asaas
- Webhook Stripe → atualiza plano da imobiliária

### V2.2. Self-service
- Cliente faz upload de vídeo direto pelo painel próprio
- Cobrança automática por scan (créditos)
- Plano com X tours incluídos por mês

### V2.3. Automação Luma
- Webhook da Luma → marca tour como ready automaticamente
- E-mail/WhatsApp notifica quando tour fica pronto
- Reprocessamento automático em caso de falha
- Polling em background (Vercel cron job a cada 5min)

### V2.4. White-label
- Imobiliária com plano top remove branding "Powered by Imerso"
- Domínio customizado por cliente (`tours.minhaimobiliaria.com.br`)
- Logo + cor primária aplicados em todo o viewer

### V2.5. Integrações
- Embed via iframe em sites de terceiros (com auth token)
- Integração ZAP, VivaReal, OLX (sync de imóveis)
- Webhook configurável para CRM (RD Station, HubSpot)
- API pública com rate limit

### V2.6. Conteúdo enriquecido nos tours
- Galeria 2D adicional dentro do InfoPanel
- Floor plan 2D auto-gerado
- Medições dentro do tour (régua virtual)
- Vídeo institucional do imóvel embedado
- Documentos PDF anexados (planta baixa, regulamento)

### V2.7. Captura de leads no viewer
- Formulário "Tenho interesse" dentro do viewer
- Lead vai direto para CRM da imobiliária
- Notificação push para corretor

### V2.8. Tradução de tours
- Conteúdo do tour (título, descrição, hotspots) em PT/EN/ES
- Tradução automática via OpenAI/Anthropic com revisão manual

### V2.9. Cinematic 2.0
- Editor visual drag-and-drop dos waypoints
- Trilha sonora opcional
- Voiceover por waypoint

### V2.10. Analytics avançado
- Heatmap de onde usuários mais olham
- Dispositivos, OS, browsers detalhados
- A/B testing de fotos de capa
- Funil de conversão multi-tour
- Integração PostHog ou Plausible

### V2.11. Mobile App PWA
- Instalável como app no celular do corretor
- Notificações push
- Modo offline da galeria

### V2.12. AR / VR
- Modo VR no viewer (WebXR)
- Modo AR (apontar câmera + escala em 1:1 — Apple Vision Pro / Quest)

### V2.13. Comparador
- Visitante compara 2-3 imóveis lado a lado

### V2.14. Marketplace
- Imobiliárias listam tours em marketplace público filtrado por região/preço

---

## 📌 Notas finais para o Cursor Agent

### Comportamento esperado durante a build

1. **Sempre leia o arquivo antes de editar.** Use `read_file` antes de `edit_file`.
2. **Faça commits semânticos** (não estamos pedindo git, mas pense em chunks reviewáveis):
   - `feat(auth): setup Supabase clients`
   - `feat(viewer): SplatViewer base component`
   - `fix(upload): handle multipart abort`
3. **NUNCA execute `npm run dev`, `npm run build`, ou comandos longos automaticamente.** Sempre entregue ao founder em PowerShell:
   ```powershell
   # Comando para o founder rodar:
   npm run dev
   ```
4. **Pare e pergunte** antes de:
   - Apagar arquivos existentes
   - Mudar dependências do `package.json`
   - Rodar migrations no Supabase (sempre o founder roda manualmente)
   - Qualquer ação irreversível
5. **Se a Luma API não estiver respondendo conforme o spec**, escolha o caminho B (mark-ready manual) e adicione `// TODO(founder): validar endpoint Luma vigente`.
6. **Se um componente externo (mkkellogg, recharts, etc.) tiver breaking change**, prefira fixar versão e pedir ao founder.
7. **Componentes de viewer 3D** são os mais delicados — testar manualmente no celular do founder após cada mudança grande.
8. **Não use `localStorage` para dados sensíveis** — sempre cookies httpOnly via API.
9. **Não use `dangerouslySetInnerHTML`** sem absoluta necessidade.
10. **Não use `any` em TypeScript.** Se precisar, use `unknown` + type guard.

### Estilo de código

```typescript
// ✅ Bom
import { z } from 'zod';

const createTourSchema = z.object({
  imobiliaria_id: z.string().uuid(),
  titulo: z.string().min(3).max(120),
  tipo: z.enum(['apartamento', 'casa', 'comercial', 'terreno', 'evento']),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = createTourSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  // ...
}

// ❌ Ruim
export async function POST(req: any) {
  const body: any = await req.json();
  const tour = await db.from('tours').insert(body); // sem validação
  return Response.json(tour);
}
```

### Quando estiver em dúvida

> Sempre prefira a opção mais simples, mais segura e que entrega valor mais rápido. Em caso de empate, escolha a que **o founder consegue testar manualmente em mobile real em 5 minutos**.

### Comunicação com o founder

- Em PT-BR
- Tom direto, sem floreio
- Sempre mostre os comandos PowerShell explicitamente
- Sempre cite caminho de arquivo absoluto/relativo claro
- Sempre que terminar uma feature, liste:
  - O que foi feito
  - O que precisa ser testado manualmente
  - Próximos passos

---

## 🚀 Comando para começar

```powershell
# 1. Criar projeto
cd C:\Users\pc\Desktop\Projetos
npx create-next-app@15.1.0 imerso --typescript --tailwind --app --src-dir --import-alias "@/*" --no-eslint
cd imerso

# 2. Copiar este PROMPT_MASTER.md para a raiz do projeto
# 3. Copiar .env.example e preencher .env.local

# 4. Instalar dependências (cole o comando completo da seção 2)
npm install [...]
npm install -D [...]

# 5. Rodar migrations no Supabase Dashboard → SQL Editor (na ordem)

# 6. Criar super_admin no Supabase Auth → Add User
#    Pegar UUID e rodar:
#    insert into public.user_roles (user_id, role) values ('UUID-AQUI', 'super_admin');

# 7. Gerar tipos
npx supabase login
npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/database.types.ts

# 8. Iniciar Sprint 1
npm run dev
```

**Boa construção, Sheik. Que o Imerso seja o produto que vai colocar tours 3D ao alcance de todas as imobiliárias do Brasil. 🌊**

---

*Documento finalizado em 08 de maio de 2026. Versão 1.0.*
