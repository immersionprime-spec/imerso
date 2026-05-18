-- Campos do editor unificado para waypoints de porta
ALTER TABLE public.tour_waypoints
  ADD COLUMN IF NOT EXISTS proximity_threshold double precision DEFAULT 1.8,
  ADD COLUMN IF NOT EXISTS label_distance double precision DEFAULT 3.0;

COMMENT ON COLUMN public.tour_waypoints.proximity_threshold
  IS 'Distância 3D (unidades da cena) que dispara transição automática para o tour de destino.';

COMMENT ON COLUMN public.tour_waypoints.label_distance
  IS 'Distância 3D em que a legenda do waypoint começa a aparecer (fade-in).';
