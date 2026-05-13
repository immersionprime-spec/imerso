import { routing } from '@/i18n/routing';

/** Monta `/painel/login` ou `/en/painel/login` conforme o prefixo de locale na URL atual. */
export function authLoginRedirectPath(pathname: string, area: 'painel' | 'cliente'): string {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  const isLocale = routing.locales.includes(first as (typeof routing.locales)[number]);
  if (isLocale && first !== routing.defaultLocale) {
    return `/${first}/${area}/login`;
  }
  return `/${area}/login`;
}
