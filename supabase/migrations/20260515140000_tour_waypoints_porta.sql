-- Migration: adicionar suporte a waypoints de porta entre tours
-- Executar no Supabase Dashboard → SQL Editor (ou via supabase db push)

ALTER TABLE public.tour_waypoints
  ADD COLUMN IF NOT EXISTS label          text          NULL,
  ADD COLUMN IF NOT EXISTS next_tour_id   uuid          NULL
    REFERENCES public.tours(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_cam_position jsonb       NULL,
  ADD COLUMN IF NOT EXISTS next_cam_target   jsonb       NULL;

COMMENT ON COLUMN public.tour_waypoints.label
  IS 'Texto do botão exibido ao visitante. Ex: → Quarto. NULL = waypoint cinematográfico normal.';

COMMENT ON COLUMN public.tour_waypoints.next_tour_id
  IS 'Se preenchido, este waypoint é um botão de porta que leva para outro tour.';

COMMENT ON COLUMN public.tour_waypoints.next_cam_position
  IS 'Posição inicial da câmera no tour de destino. Formato: {"x":0,"y":0,"z":0}';

COMMENT ON COLUMN public.tour_waypoints.next_cam_target
  IS 'Target inicial da câmera no tour de destino. Formato: {"x":0,"y":0,"z":0}';
