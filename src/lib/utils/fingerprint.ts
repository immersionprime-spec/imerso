'use client';

const COOKIE = 'imerso_fp';
const COOKIE_MAX_AGE_DAYS = 30;

function rawFingerprintInput(): string {
  if (typeof window === 'undefined') return '';
  return [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
  ].join('|');
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeDays: number) {
  if (typeof document === 'undefined') return;
  const maxAge = maxAgeDays * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Anonymous visitor id for analytics; 30d cookie. */
export async function getOrCreateFingerprint(): Promise<string> {
  const existing = readCookie(COOKIE);
  if (existing && existing.length === 64) return existing;
  const fp = await sha256Hex(rawFingerprintInput() || `fallback-${crypto.randomUUID()}`);
  writeCookie(COOKIE, fp, COOKIE_MAX_AGE_DAYS);
  return fp;
}
