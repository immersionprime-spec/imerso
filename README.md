# Imerso

Tours virtuais 3D com Gaussian Splatting para imobiliárias. Captura em câmera, pipeline local de processamento, viewer público otimizado para mobile.

## Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + RLS), Cloudflare R2
- **Viewer 3D**: `@mkkellogg/gaussian-splats-3d` com câmera FPS + joystick mobile
- **Pipeline local**: PowerShell + Python + COLMAP + Brush 3DGS

## Pré-requisitos

- Node.js 20+
- PowerShell 7+ (para o pipeline de Gaussian Splatting)
- Conta Supabase (gratuita serve para desenvolvimento)
- Conta Cloudflare R2 (para armazenamento dos arquivos `.ksplat`)

## Setup de desenvolvimento

### 1. Clonar e instalar

```powershell
cd C:\Users\pc\Desktop\Projetos\imerso
npm install
```

### 2. Configurar variáveis de ambiente

```powershell
Copy-Item .env.example .env.local
# Abrir .env.local e preencher as variáveis
```

Variáveis obrigatórias para o ambiente de desenvolvimento:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_PUBLIC_URL=
R2_BUCKET_NAME=splat-viewer
PIPELINE_SERVICE_TOKEN=
```

### 3. Rodar migrations no Supabase

Vá para o Supabase Dashboard → SQL Editor e execute os arquivos em `supabase/migrations/` na ordem numérica.

### 4. Criar usuário super_admin

No Supabase Dashboard → Authentication → Users → Add user. Após criar, rode no SQL Editor:

```sql
INSERT INTO public.user_roles (user_id, role) VALUES ('<UUID-DO-USER>', 'super_admin');
```

### 5. Iniciar o servidor de desenvolvimento

```powershell
npm run dev
```

Acesse: http://localhost:3000

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | Linting |
| `npm run format` | Formatação com Prettier |
| `npm run gs:local` | Pipeline de Gaussian Splatting local |
| `npm run db:verify` | Verificar schema do banco |

## Pipeline de processamento 3D

O pipeline local converte vídeos/fotos em arquivos `.ksplat` para o viewer:

```powershell
# Modo vídeo (arquivo .mp4)
npm run gs:local -- -VideoPath "C:\caminho\para\video.mp4" -TourId "<uuid-do-tour>"

# Modo fotos (diretório com .jpg/.png)
npm run gs:local -- -PhotosPath "C:\caminho\para\fotos" -TourId "<uuid-do-tour>"
```

O pipeline executa: extração de frames → mascaramento SAM2 (opcional) → COLMAP SfM → Brush 3DGS → conversão `.ksplat` → upload R2 → finalize.

Ver documentação completa em `scripts/local-gs/README.md`.

## Estrutura de pastas

```
src/
  app/              # Rotas Next.js (App Router)
  components/
    viewer/         # SplatViewer, controles, UI do tour
    layout/         # Shell admin, sidebar, topbar
    ui/             # Componentes base (Button, Input, etc.)
  lib/
    auth/           # Guards de autenticação
    r2/             # Cliente Cloudflare R2
    splat/          # Loader e LOD do viewer
    supabase/       # Clientes Supabase (server, client, admin)
  types/            # Tipos TypeScript gerados e manuais
scripts/
  local-gs/         # Pipeline Python/PowerShell de Gaussian Splatting
supabase/
  migrations/       # Migrations SQL versionadas
```

## Deploy

O projeto é deployado na Vercel. Configure as variáveis de ambiente do `.env.example` nas configurações do projeto na Vercel antes do primeiro deploy.

**Antes do deploy em produção:**
1. Aplicar CORS no bucket R2 (ver `scripts/R2_CORS_SETUP.md`)
2. Configurar `TOUR_ACCESS_SECRET` (obrigatória em produção)
3. Configurar `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` para rate-limit distribuído

## Documentação

- `CLAUDE.md` — Blueprint completo do produto e regras de desenvolvimento
- `ROADMAP.md` — Status atual e próximos passos
- `scripts/local-gs/README.md` — Pipeline de Gaussian Splatting
- `scripts/R2_CORS_SETUP.md` — Configuração de CORS no R2
