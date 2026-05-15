import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ============================================================
// Configuração
// ============================================================

export const RATE_LIMITS = {
  LEADS: { windowMs: 60_000, max: 3 },
  TRACK_VIEW: { windowMs: 60_000, max: 60 },
  VERIFY_PASSWORD: { windowMs: 60_000, max: 10 },
  TRACK_WHATSAPP: { windowMs: 60_000, max: 30 },
} as const;

// ============================================================
// Helper: extrair IP do request
// ============================================================

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

// ============================================================
// Implementação em memória (fallback para dev local sem Redis)
// ============================================================

const memStore = new Map<string, { count: number; resetAt: number }>();
const MEM_MAX_ENTRIES = 10_000;

function maybeCleanupExpired(): void {
  if (Math.random() >= 0.01) return;
  const now = Date.now();
  const stale: string[] = [];
  for (const [k, v] of memStore) {
    if (v.resetAt < now) stale.push(k);
  }
  for (const k of stale) memStore.delete(k);
}

function rateLimitMemory(
  key: string,
  opts: { windowMs: number; max: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
  maybeCleanupExpired();
  if (memStore.size > MEM_MAX_ENTRIES) memStore.clear();
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || entry.resetAt <= now) {
    memStore.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (entry.count < opts.max) {
    entry.count += 1;
    return { ok: true };
  }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

// ============================================================
// Implementação Redis (produção)
// ============================================================

function isRedisConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// Cache de instâncias Ratelimit por chave de configuração
const _limiters = new Map<string, Ratelimit>();

function getRateLimiter(opts: { windowMs: number; max: number }): Ratelimit {
  const cacheKey = `${opts.windowMs}:${opts.max}`;
  if (_limiters.has(cacheKey)) return _limiters.get(cacheKey)!;
  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(opts.max, `${Math.round(opts.windowMs / 1000)} s`),
    analytics: false,
    prefix: 'imerso:rl',
  });
  _limiters.set(cacheKey, limiter);
  return limiter;
}

// ============================================================
// Função pública — mesma assinatura de antes
// ============================================================

export async function rateLimit(
  key: string,
  opts: { windowMs: number; max: number }
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  if (!isRedisConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      // Em produção sem Redis configurado: falha aberta (permite request)
      // mas loga warning para o founder saber que o rate-limit não está ativo.
      console.warn('[Imerso] UPSTASH_REDIS_REST_URL não configurado. Rate-limit inativo.');
    }
    return rateLimitMemory(key, opts);
  }

  try {
    const limiter = getRateLimiter(opts);
    const result = await limiter.limit(key);
    if (result.success) return { ok: true };
    const retryAfterSec = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return { ok: false, retryAfterSec };
  } catch (err) {
    // Se o Redis estiver fora, falha aberta — não bloqueia o usuário legítimo.
    console.error('[Imerso] Erro no rate-limit Redis, usando fallback em memória:', err);
    return rateLimitMemory(key, opts);
  }
}
