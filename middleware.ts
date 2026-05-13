import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

const handleI18n = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  const intlResponse = handleI18n(request);
  const path = request.nextUrl.pathname;
  if (path.includes('/painel') || path.includes('/cliente')) {
    return await updateSession(request, intlResponse);
  }
  return intlResponse;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
