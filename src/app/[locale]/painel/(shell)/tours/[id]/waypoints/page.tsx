import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { tourSplatProxyUrl } from '@/lib/splat/tour-splat-url';
import type { Database } from '@/types/database.types';
import { WaypointsEditorClient } from './WaypointsEditorClient';

type WaypointRow = Pick<
  Database['public']['Tables']['tour_waypoints']['Row'],
  | 'id'
  | 'ordem'
  | 'position_x'
  | 'position_y'
  | 'position_z'
  | 'target_x'
  | 'target_y'
  | 'target_z'
  | 'duration_ms'
>;

type PageProps = { params: Promise<{ locale: string; id: string }> };

export default async function TourWaypointsPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: tourRaw } = await supabase
    .from('tours')
    .select('id, titulo, splat_r2_key, status, camera_up_inverted, has_cinematic_mode')
    .eq('id', id)
    .maybeSingle();

  if (!tourRaw) notFound();

  const tour = tourRaw as {
    id: string;
    titulo: string;
    splat_r2_key: string | null;
    status: string;
    camera_up_inverted: boolean | null;
    has_cinematic_mode: boolean | null;
  };

  const { data: wpRaw } = await supabase
    .from('tour_waypoints')
    .select('id, ordem, position_x, position_y, position_z, target_x, target_y, target_z, duration_ms')
    .eq('tour_id', id)
    .is('next_tour_id', null)
    .order('ordem', { ascending: true });

  const waypoints = ((wpRaw ?? []) as WaypointRow[]).map((w) => ({
    id: w.id,
    ordem: w.ordem,
    position_x: Number(w.position_x),
    position_y: Number(w.position_y),
    position_z: Number(w.position_z),
    target_x: Number(w.target_x),
    target_y: Number(w.target_y),
    target_z: Number(w.target_z),
    duration_ms: w.duration_ms ?? 4000,
    label: null,
    next_tour_id: null,
    next_tour_href: null,
    next_cam_position: null,
    next_cam_target: null,
    proximity_threshold: 1.8,
    label_distance: 3.0,
  }));

  const t = await getTranslations('admin.tours.waypoints');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">{t('page_title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('page_subtitle')}</p>
      </div>
      <WaypointsEditorClient
        tourId={tour.id}
        tourTitulo={tour.titulo}
        splatUrl={tourSplatProxyUrl(tour.id, tour.splat_r2_key)}
        cameraUpInverted={tour.camera_up_inverted !== false}
        hasCinematicMode={Boolean(tour.has_cinematic_mode)}
        tourStatus={tour.status}
        initialWaypoints={waypoints}
      />
    </div>
  );
}

