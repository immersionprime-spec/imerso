import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { jsonError } from '@/lib/api/errors';
import type { Database } from '@/types/database.types';

type Ok = { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string };

/** SSR client inference can collapse to `never` for some tables; normalize for admin routes. */
export function typedAdminSupabase(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>;
}
type Fail = { ok: false; response: Response };

export async function requireSuperAdminApi(): Promise<Ok | Fail> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: jsonError('UNAUTHORIZED', 'Authentication required.', 401) };
  }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = roleData as { role: string } | null;
  if (!role || role.role !== 'super_admin') {
    return { ok: false, response: jsonError('FORBIDDEN', 'Super admin only.', 403) };
  }

  return { ok: true, supabase, userId: user.id };
}
