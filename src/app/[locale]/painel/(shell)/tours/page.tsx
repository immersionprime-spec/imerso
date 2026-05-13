import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { ToursTable } from './ToursTable';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; imob?: string; q?: string }>;
};

export default async function ToursPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const t = await getTranslations('admin.tours');
  const supabase = await createClient();

  const { data: imobs } = await supabase
    .from('imobiliarias')
    .select('id, nome, slug')
    .is('archived_at', null)
    .order('nome');

  let tourQuery = supabase
    .from('tours')
    .select('id, titulo, slug, status, imobiliaria_id, corretor_id, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (sp.status && sp.status !== 'all') {
    tourQuery = tourQuery.eq('status', sp.status);
  }
  if (sp.imob) {
    tourQuery = tourQuery.eq('imobiliaria_id', sp.imob);
  }
  if (sp.q?.trim()) {
    tourQuery = tourQuery.ilike('titulo', `%${sp.q.trim()}%`);
  }

  const { data: toursRaw } = await tourQuery;

  type ImobOpt = { id: string; nome: string; slug: string };
  type TourListRow = {
    id: string;
    titulo: string;
    slug: string;
    status: string;
    imobiliaria_id: string;
    corretor_id: string | null;
    created_at: string;
  };

  const imobList = (imobs ?? []) as ImobOpt[];
  const tours = (toursRaw ?? []) as TourListRow[];

  const imobMap = Object.fromEntries(imobList.map((i) => [i.id, i])) as Record<string, ImobOpt>;
  const corretorIds = [...new Set(tours.map((t) => t.corretor_id).filter(Boolean))] as string[];
  let corMap: Record<string, string> = {};
  if (corretorIds.length > 0) {
    const { data: corsRaw } = await supabase.from('corretores').select('id, nome').in('id', corretorIds);
    const cors = (corsRaw ?? []) as { id: string; nome: string }[];
    corMap = Object.fromEntries(cors.map((c) => [c.id, c.nome]));
  }

  const rows = tours.map((t) => ({
    ...t,
    imobiliaria_slug: imobMap[t.imobiliaria_id]?.slug ?? '',
    imobiliaria_nome: imobMap[t.imobiliaria_id]?.nome ?? '',
    corretor_nome: t.corretor_id ? (corMap[t.corretor_id] ?? '') : '',
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">{t('title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
        </div>
        <Link href="/painel/tours/novo" className={cn(buttonVariants())}>
          {t('new')}
        </Link>
      </div>
      <ToursTable rows={rows} imobs={imobList} initialFilters={{ status: sp.status, imob: sp.imob, q: sp.q }} />
    </div>
  );
}
