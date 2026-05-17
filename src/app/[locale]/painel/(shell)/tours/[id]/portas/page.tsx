import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { requireSuperAdmin } from '@/lib/auth/guards';

type PageProps = { params: Promise<{ locale: string; id: string }> };

/** Redirect legado: editor unificado substitui esta rota. */
export default async function TourPortasPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();
  redirect({ href: `/painel/tours/${id}?tab=editor`, locale });
}
