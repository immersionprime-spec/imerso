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
