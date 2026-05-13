import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import type { Database } from '@/types/database.types';
import { HotspotsEditorClient } from './HotspotsEditorClient';

type HotspotRow = Pick<
  Database['public']['Tables']['tour_hotspots']['Row'],
  'id' | 'titulo' | 'descricao' | 'icone' | 'posicao_x' | 'posicao_y' | 'posicao_z' | 'ordem'
>;

type PageProps = { params: Promise<{ locale: string; id: string }> };

export default async function TourHotspotsPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: tourRaw } = await supabase
    .from('tours')
    .select('id, titulo, splat_url, status, camera_up_inverted')
    .eq('id', id)
    .maybeSingle();

  if (!tourRaw) notFound();

  const tour = tourRaw as {
    id: string;
    titulo: string;
    splat_url: string | null;
    status: string;
    camera_up_inverted: boolean | null;
  };

  const { data: hotspotsRaw } = await supabase
    .from('tour_hotspots')
    .select('id, titulo, descricao, icone, posicao_x, posicao_y, posicao_z, ordem')
    .eq('tour_id', id)
    .order('ordem', { ascending: true });

  const hotspots = ((hotspotsRaw ?? []) as HotspotRow[]).map((h) => ({
    id: h.id,
    titulo: h.titulo,
    descricao: h.descricao,
    icone: h.icone,
    ordem: h.ordem,
    posicao_x: Number(h.posicao_x),
    posicao_y: Number(h.posicao_y),
    posicao_z: Number(h.posicao_z),
  }));

  const t = await getTranslations('admin.tours.hotspots');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">{t('page_title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('page_subtitle')}</p>
      </div>
      <HotspotsEditorClient
        tourId={tour.id}
        tourTitulo={tour.titulo}
        splatUrl={tour.splat_url}
        cameraUpInverted={tour.camera_up_inverted !== false}
        tourStatus={tour.status}
        initialHotspots={hotspots}
      />
    </div>
  );
}
