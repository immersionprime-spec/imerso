import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { ImobiliariasTable } from './ImobiliariasTable';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ImobiliariasPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const t = await getTranslations('admin.imobiliarias');
  const supabase = await createClient();

  const { data: imobs } = await supabase
    .from('imobiliarias')
    .select('id, slug, nome, has_login, created_at')
    .is('archived_at', null)
    .order('nome');

  const { data: tourRowsRaw } = await supabase.from('tours').select('imobiliaria_id').is('archived_at', null);
  const tourRows = (tourRowsRaw ?? []) as { imobiliaria_id: string }[];

  const tourCount: Record<string, number> = {};
  for (const row of tourRows) {
    tourCount[row.imobiliaria_id] = (tourCount[row.imobiliaria_id] ?? 0) + 1;
  }

  const imobList = (imobs ?? []) as {
    id: string;
    slug: string;
    nome: string;
    has_login: boolean;
    created_at: string;
  }[];

  const rows = imobList.map((i) => ({
    ...i,
    tour_count: tourCount[i.id] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">{t('title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
        </div>
        <Link href="/painel/imobiliarias/nova" className={cn(buttonVariants())}>
          {t('new')}
        </Link>
      </div>
      <ImobiliariasTable rows={rows} />
    </div>
  );
}
