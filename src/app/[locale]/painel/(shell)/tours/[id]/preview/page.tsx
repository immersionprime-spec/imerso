import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { tourSplatProxyUrl } from '@/lib/splat/tour-splat-url';
import type { Json } from '@/types/database.types';
import { TourPreviewClient, type Vec3 } from './TourPreviewClient';

function parseVec3(json: Json | null): Vec3 | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  const z = Number(o.z);
  if (![x, y, z].every((n) => Number.isFinite(n))) return null;
  return { x, y, z };
}

type PageProps = { params: Promise<{ locale: string; id: string }> };

export default async function TourPreviewPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data: tourRaw } = await supabase
    .from('tours')
    .select(
      'id, titulo, splat_r2_key, camera_start_position, camera_start_target, splat_rotation_deg, camera_up_inverted'
    )
    .eq('id', id)
    .maybeSingle();

  const tour = tourRaw as {
    id: string;
    titulo: string;
    splat_r2_key: string | null;
    camera_start_position: Json | null;
    camera_start_target: Json | null;
    splat_rotation_deg: number | null;
    camera_up_inverted: boolean | null;
  } | null;

  const splatUrl = tour ? tourSplatProxyUrl(tour.id, tour.splat_r2_key) : null;
  if (!tour || !splatUrl) notFound();

  const initialPosition = parseVec3(tour.camera_start_position);
  const initialTarget = parseVec3(tour.camera_start_target);

  return (
    <TourPreviewClient
      tourId={tour.id}
      titulo={tour.titulo}
      splatUrl={splatUrl}
      initialPosition={initialPosition}
      initialTarget={initialTarget}
      splatRotationDeg={tour.splat_rotation_deg ?? 0}
      cameraUpInverted={tour.camera_up_inverted !== false}
    />
  );
}
