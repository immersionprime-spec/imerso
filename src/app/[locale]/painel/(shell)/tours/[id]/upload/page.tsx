import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { TourUploadClient } from './TourUploadClient';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function TourUploadPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from('tours')
    .select('id, titulo, status, video_r2_key, archived_at')
    .eq('id', id)
    .maybeSingle();

  const tour = row as {
    id: string;
    titulo: string;
    status: string;
    video_r2_key: string | null;
    archived_at: string | null;
  } | null;

  if (!tour || tour.archived_at) notFound();

  const t = await getTranslations('admin.tours.upload');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">{t('page_title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{tour.titulo}</p>
      </div>
      <TourUploadClient
        tourId={tour.id}
        titulo={tour.titulo}
        status={tour.status}
        videoR2Key={tour.video_r2_key}
      />
    </div>
  );
}
