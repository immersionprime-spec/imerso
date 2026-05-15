-- Renomeia luma_completed_at → finalized_at e remove demais campos Luma

BEGIN;

ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

UPDATE public.tours SET finalized_at = luma_completed_at WHERE luma_completed_at IS NOT NULL;

ALTER TABLE public.tours
  DROP COLUMN IF EXISTS luma_capture_slug,
  DROP COLUMN IF EXISTS luma_submitted_at,
  DROP COLUMN IF EXISTS luma_completed_at,
  DROP COLUMN IF EXISTS luma_cost_credits,
  DROP COLUMN IF EXISTS luma_cost_usd,
  DROP COLUMN IF EXISTS splat_url;

DROP TABLE IF EXISTS public.luma_processing_log;

COMMIT;
