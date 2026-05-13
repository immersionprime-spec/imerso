import type { User } from '@supabase/supabase-js';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

export type SuperAdminContext = {
  user: User;
  role: { role: string; imobiliaria_id: string | null };
};

export async function requireSuperAdmin(): Promise<SuperAdminContext> {
  const supabase = await createClient();
  const locale = await getLocale();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: '/painel/login', locale });
  }

  const authedUser = user as User;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role, imobiliaria_id')
    .eq('user_id', authedUser.id)
    .maybeSingle();

  const role = roleData as { role: string; imobiliaria_id: string | null } | null;

  if (!role || role.role !== 'super_admin') {
    redirect({ href: '/painel/login', locale });
  }

  return {
    user: authedUser,
    role: role as { role: string; imobiliaria_id: string | null },
  };
}
