import { createAdminClient } from '@/lib/supabase/admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { getClientIp, rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { trackWhatsappSchema } from '@/lib/validation/public';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`track-whatsapp:${ip}`, RATE_LIMITS.TRACK_WHATSAPP);
  if (!rl.ok) {
    return jsonError('RATE_LIMITED', 'Too many requests.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = trackWhatsappSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { tourId, fingerprint } = parsed.data;
  const supabase = createAdminClient();

  const { data: tour } = await supabase
    .from('tours')
    .select('id, status, archived_at')
    .eq('id', tourId)
    .maybeSingle();

  if (!tour || tour.archived_at || tour.status !== 'ready') {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  const { error } = await supabase.from('tour_whatsapp_clicks').insert({
    tour_id: tourId,
    visitor_fingerprint: fingerprint ?? null,
  });

  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}
