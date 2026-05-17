import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { tourSplatProxyUrl } from '@/lib/splat/tour-splat-url';
import { PortasEditorClient } from './PortasEditorClient';

type PageProps = { params: Promise<{ locale: string; id: string }> };

export default async function TourPortasPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();

  const supabase = await createClient();

  const { data: tourRaw } = await supabase
    .from('tours')
    .select('id, titulo, slug, splat_r2_key, status, camera_up_inverted')
    .eq('id', id)
    .maybeSingle();

  if (!tourRaw) notFound();

  const tour = tourRaw as {
    id: string;
    titulo: string;
    slug: string;
    splat_r2_key: string | null;
    status: string;
    camera_up_inverted: boolean | null;
  };

  const splatUrl = tourSplatProxyUrl(tour.id, tour.splat_r2_key);
  if (!splatUrl || tour.status !== 'ready') notFound();

  const { data: portasRaw } = await supabase
    .from('tour_waypoints')
    .select(
      'id, ordem, position_x, position_y, position_z, target_x, target_y, target_z, label, next_tour_id, next_cam_position, next_cam_target'
    )
    .eq('tour_id', id)
    .not('next_tour_id', 'is', null)
    .order('ordem', { ascending: true });

  const { data: allToursRaw } = await supabase
    .from('tours')
    .select('id, titulo, slug, splat_r2_key, camera_up_inverted')
    .eq('status', 'ready')
    .is('archived_at', null)
    .order('titulo', { ascending: true });

  type TourDestRow = {
    id: string;
    titulo: string;
    slug: string;
    splat_r2_key: string | null;
    camera_up_inverted: boolean | null;
  };

  const allTours = ((allToursRaw ?? []) as TourDestRow[])
    .filter((t) => t.id !== id)
    .map((t) => ({
      id: t.id,
      titulo: t.titulo,
      slug: t.slug,
      splatUrl: tourSplatProxyUrl(t.id, t.splat_r2_key),
      cameraUpInverted: t.camera_up_inverted !== false,
    }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portas = (portasRaw ?? []).map((p: any) => ({
    id: p.id as string,
    ordem: p.ordem as number,
    position_x: Number(p.position_x),
    position_y: Number(p.position_y),
    position_z: Number(p.position_z),
    target_x: Number(p.target_x),
    target_y: Number(p.target_y),
    target_z: Number(p.target_z),
    label: (p.label as string | null) ?? '',
    next_tour_id: p.next_tour_id as string | null,
    next_cam_position: p.next_cam_position as { x: number; y: number; z: number } | null,
    next_cam_target: p.next_cam_target as { x: number; y: number; z: number } | null,
  }));

  return (
    <PortasEditorClient
      tourId={tour.id}
      tourTitulo={tour.titulo}
      splatUrl={splatUrl}
      cameraUpInverted={tour.camera_up_inverted !== false}
      initialPortas={portas}
      allTours={allTours}
    />
  );
}
