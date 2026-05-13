-- ============================================================
-- IMERSO — Add camera_up_inverted flag to tours
-- ============================================================
-- Luma AI exports splats with inverted Y axis (cameraUp = [0, -1, 0]).
-- Other sources (Polycam, manual exports) use standard Y up = [0, 1, 0].
-- Default = true because Luma is the primary processing pipeline.
-- ============================================================

alter table public.tours
  add column if not exists camera_up_inverted boolean not null default true;

comment on column public.tours.camera_up_inverted is
  'true = Luma-style (Y inverted, cameraUp = [0,-1,0]); false = standard Y up.';
