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
