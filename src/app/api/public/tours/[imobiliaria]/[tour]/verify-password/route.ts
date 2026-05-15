import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { signTourAccessToken, tourAccessCookieName } from '@/lib/auth/tour-access-token';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { getClientIp, rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { verifyTourPasswordSchema } from '@/lib/validation/public';

type RouteParams = { params: Promise<{ imobiliaria: string; tour: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const ip = getClientIp(req);
  const { imobiliaria, tour: tourSlug } = await params;
  const rl = await rateLimit(`verify:${ip}:${imobiliaria}:${tourSlug}`, RATE_LIMITS.VERIFY_PASSWORD);
  if (!rl.ok) {
    return jsonError('RATE_LIMITED', 'Too many attempts.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = verifyTourPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const supabase = createAdminClient();
  const { data: imo } = await supabase.from('imobiliarias').select('id').eq('slug', imobiliaria).maybeSingle();
  if (!imo) {
    return jsonError('NOT_FOUND', 'Not found.', 404);
  }

  const { data: tourRow } = await supabase
    .from('tours')
    .select('id, password_hash, status, archived_at, is_public')
    .eq('imobiliaria_id', imo.id)
    .eq('slug', tourSlug)
    .maybeSingle();

  if (!tourRow || tourRow.archived_at || tourRow.status !== 'ready') {
    return jsonError('NOT_FOUND', 'Not found.', 404);
  }

  if (!tourRow.password_hash) {
    return jsonError('VALIDATION_ERROR', 'Tour is not password protected.', 400);
  }

  const ok = await bcrypt.compare(parsed.data.password, tourRow.password_hash);
  if (!ok) {
    return jsonError('INVALID_PASSWORD', 'Invalid password.', 401);
  }

  const token = signTourAccessToken(tourRow.id);
  const res = jsonOk({ ok: true });
  const isProd = process.env.NODE_ENV === 'production';
  const cookieValue = `${tourAccessCookieName(tourRow.id)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${isProd ? '; Secure' : ''}`;
  res.headers.append('Set-Cookie', cookieValue);
  return res;
}
