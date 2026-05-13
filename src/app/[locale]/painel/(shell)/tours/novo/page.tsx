import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { NovoTourWizard } from './NovoTourWizard';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function NovoTourPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const t = await getTranslations('admin.tours');
  const supabase = await createClient();

  const { data: imobs } = await supabase
    .from('imobiliarias')
    .select('id, nome, slug')
    .is('archived_at', null)
    .order('nome');

  const { data: corretores } = await supabase
    .from('corretores')
    .select('id, nome, imobiliaria_id')
    .eq('ativo', true)
    .order('nome');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">{t('novo_title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('novo_subtitle')}</p>
      </div>
      <NovoTourWizard imobs={imobs ?? []} corretores={corretores ?? []} />
    </div>
  );
}
