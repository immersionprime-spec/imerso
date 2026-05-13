-- P08: progressive loading — splat lite opcional (R2 + viewer carrega lite primeiro)
alter table public.tours
  add column if not exists splat_r2_key_lite text,
  add column if not exists splat_size_bytes_lite bigint;

comment on column public.tours.splat_r2_key_lite is 'R2 key do .ksplat lite (~30% splats); GET /api/public/tours/[id]/splat/...?variant=lite';
comment on column public.tours.splat_size_bytes_lite is 'Tamanho em bytes do arquivo lite no R2';
