const store = new Map<string, { count: number; resetAt: number }>();

const MAX_ENTRIES = 10_000;

export const RATE_LIMITS = {
  LEADS: { windowMs: 60_000, max: 3 },
  TRACK_VIEW: { windowMs: 60_000, max: 60 },
  VERIFY_PASSWORD: { windowMs: 60_000, max: 10 },
  TRACK_WHATSAPP: { windowMs: 60_000, max: 30 },
} as const;

export function getClientIp(req: Request): string {
  const xfwd = req.headers.get('x-forwarded-for');
  if (xfwd) {
    const first = xfwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

function maybeCleanupExpired(): void {
  if (Math.random() >= 0.01) return;
  const now = Date.now();
  const stale: string[] = [];
  for (const [k, v] of store) {
    if (v.resetAt < now) stale.push(k);
  }
  for (const k of stale) store.delete(k);
}

export function rateLimit(
  key: string,
  opts: { windowMs: number; max: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
  maybeCleanupExpired();

  if (store.size > MAX_ENTRIES) {
    store.clear();
  }

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }

  if (entry.count < opts.max) {
    entry.count += 1;
    return { ok: true };
  }

  return {
    ok: false,
    retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}
