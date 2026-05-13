import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { AdminShell } from '@/components/layout/AdminShell';
import { requireSuperAdmin } from '@/lib/auth/guards';

type ShellLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function PainelShellLayout({ children, params }: ShellLayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireSuperAdmin();

  return <AdminShell email={user.email ?? ''}>{children}</AdminShell>;
}
