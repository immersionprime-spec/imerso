-- Ponto de partida da câmera no viewer público (admin define no preview).
-- Formato JSON: {"x": 0.0, "y": 0.0, "z": 0.0}

ALTER TABLE public.tours
  ADD COLUMN IF NOT EXISTS camera_start_position jsonb,
  ADD COLUMN IF NOT EXISTS camera_start_target jsonb;

COMMENT ON COLUMN public.tours.camera_start_position IS
  'Posição inicial da câmera no viewer (JSON {x,y,z}). Definido no preview do painel.';

COMMENT ON COLUMN public.tours.camera_start_target IS
  'Ponto de mira da câmera / orbit target (JSON {x,y,z}). Definido no preview do painel.';
