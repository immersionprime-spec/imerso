import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { NovaImobiliariaForm } from './NovaImobiliariaForm';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function NovaImobiliariaPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const t = await getTranslations('admin.imobiliarias');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">{t('nova_title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('nova_subtitle')}</p>
      </div>
      <NovaImobiliariaForm />
    </div>
  );
}
