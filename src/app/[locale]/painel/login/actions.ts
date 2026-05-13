'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { ok: false; message: string } | null;

export async function loginSuperAdmin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const locale = await getLocale();
  const t = await getTranslations('admin.login');

  if (!email || !password) {
    return { ok: false, message: t('validation') };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: t('invalid_credentials') };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: t('error_generic') };
  }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role, imobiliaria_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const roleRow = roleData as { role: string; imobiliaria_id: string | null } | null;

  if (!roleRow || roleRow.role !== 'super_admin') {
    await supabase.auth.signOut();
    return { ok: false, message: t('forbidden') };
  }

  redirect({ href: '/painel/dashboard', locale });
  return null;
}
