import { createHmac, timingSafeEqual } from 'node:crypto';

function getSecret(): string {
  const explicit = process.env.TOUR_ACCESS_SECRET?.trim();
  if (explicit) return explicit;

  // Em produção, TOUR_ACCESS_SECRET é obrigatória.
  // Em desenvolvimento (NODE_ENV !== 'production'), aceita fallback para não travar setup.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[Imerso] TOUR_ACCESS_SECRET é obrigatória em produção. ' +
        'Gere com: openssl rand -hex 32 e adicione às variáveis de ambiente da Vercel.'
    );
  }

  // Fallback apenas para desenvolvimento local — nunca use em produção.
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fallback) return fallback;

  throw new Error(
    '[Imerso] Configure TOUR_ACCESS_SECRET (ou SUPABASE_SERVICE_ROLE_KEY como fallback em dev) no .env.local'
  );
}

/** HMAC-signed payload; cookie Max-Age 24h per public API spec. */
export function signTourAccessToken(tourId: string): string {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const payload = Buffer.from(JSON.stringify({ tourId, exp }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyTourAccessToken(token: string, tourId: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;
  const expected = createHmac('sha256', getSecret()).update(payload).digest('base64url');
  try {
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))) {
      return false;
    }
  } catch {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { tourId: string; exp: number };
    if (data.tourId !== tourId) return false;
    if (typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export function tourAccessCookieName(tourId: string): string {
  return `tour-access-${tourId}`;
}
