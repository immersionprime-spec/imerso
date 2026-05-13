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
