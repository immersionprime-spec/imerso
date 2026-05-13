import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authLoginRedirectPath } from '@/lib/auth/login-redirect-path';
import type { Database } from '@/types/database.types';

export async function updateSession(
  request: NextRequest,
  baseResponse?: NextResponse
) {
  let supabaseResponse = baseResponse ?? NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          if (!baseResponse) {
            supabaseResponse = NextResponse.next({ request });
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && (path.includes('/painel') || path.includes('/cliente'))) {
    if (!path.includes('/login')) {
      const url = request.nextUrl.clone();
      const area = path.includes('/painel') ? 'painel' : 'cliente';
      url.pathname = authLoginRedirectPath(path, area);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
