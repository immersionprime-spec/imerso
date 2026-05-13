import { createAdminClient } from '@/lib/supabase/admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { getClientIp, rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { trackViewSchema } from '@/lib/validation/public';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit(`track-view:${ip}`, RATE_LIMITS.TRACK_VIEW);
  if (!rl.ok) {
    return jsonError('RATE_LIMITED', 'Too many requests.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = trackViewSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { tourId, fingerprint, duration_seconds } = parsed.data;
  const supabase = createAdminClient();

  const { data: tour } = await supabase
    .from('tours')
    .select('id, status, archived_at')
    .eq('id', tourId)
    .maybeSingle();

  if (!tour || tour.archived_at || tour.status !== 'ready') {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  if (fingerprint) {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('tour_views')
      .select('id')
      .eq('tour_id', tourId)
      .eq('visitor_fingerprint', fingerprint)
      .gte('created_at', since)
      .limit(1)
      .maybeSingle();

    if (recent && duration_seconds === undefined) {
      return jsonOk({ ok: true });
    }

    if (recent && duration_seconds !== undefined) {
      await supabase
        .from('tour_views')
        .update({ duration_seconds })
        .eq('id', recent.id);
      return jsonOk({ ok: true });
    }
  }

  const { error } = await supabase.from('tour_views').insert({
    tour_id: tourId,
    visitor_fingerprint: fingerprint ?? null,
    duration_seconds: duration_seconds ?? null,
  });

  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}
