import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { tourSplatProxyUrl } from '@/lib/splat/tour-splat-url';
import { TourDetailClient } from './TourDetailClient';

type TourAdminRow = {
  id: string;
  imobiliaria_id: string;
  corretor_id: string | null;
  slug: string;
  titulo: string;
  tipo: string;
  bairro: string | null;
  area_m2: number | null;
  quartos: number | null;
  valor: number | null;
  modalidade: string | null;
  descricao: string | null;
  is_public: boolean;
  has_cinematic_mode: boolean;
  cobranca_cliente_brl: number | null;
  status: string;
  foto_capa_url: string | null;
  splat_r2_key: string | null;
  splat_url: string | null;
  camera_up_inverted: boolean | null;
  splat_rotation_deg: number | null;
};

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function TourDetailPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params;
  const { tab: tabParam } = await searchParams;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: tourRaw } = await supabase
    .from('tours')
    .select(
      'id, imobiliaria_id, corretor_id, slug, titulo, tipo, bairro, area_m2, quartos, valor, modalidade, descricao, is_public, has_cinematic_mode, cobranca_cliente_brl, status, foto_capa_url, splat_r2_key, camera_up_inverted, splat_rotation_deg'
    )
    .eq('id', id)
    .maybeSingle();

  const tour = tourRaw as TourAdminRow | null;
  if (!tour) notFound();

  const { data: imoRow } = await supabase
    .from('imobiliarias')
    .select('id, nome, slug')
    .eq('id', tour.imobiliaria_id)
    .maybeSingle();

  const imo = imoRow as { id: string; nome: string; slug: string } | null;

  const { data: corretores } = await supabase
    .from('corretores')
    .select('id, nome')
    .eq('imobiliaria_id', tour.imobiliaria_id)
    .eq('ativo', true)
    .order('nome');

  const t = await getTranslations('admin.tours');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">{t('detail_title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{tour.titulo}</p>
      </div>
      <TourDetailClient
        key={tabParam ?? 'default'}
        tour={{
          ...tour,
          splat_url: tourSplatProxyUrl(tour.id, tour.splat_r2_key),
          camera_up_inverted: tour.camera_up_inverted !== false,
          splat_rotation_deg: tour.splat_rotation_deg,
        }}
        imobiliariaSlug={imo?.slug ?? ''}
        imobiliariaNome={imo?.nome ?? ''}
        corretores={corretores ?? []}
        initialTab={tabParam}
      />
    </div>
  );
}
