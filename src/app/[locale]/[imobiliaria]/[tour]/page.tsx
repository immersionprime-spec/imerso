import { cookies } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { redirect } from '@/i18n/navigation';
import { fetchPublicTourPayloadWithCookies } from '@/lib/data/public-tour';
import { TourPublicExperience } from '@/components/viewer/TourPublicExperience';

type PageProps = {
  params: Promise<{ locale: string; imobiliaria: string; tour: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, imobiliaria, tour: tourSlug } = await params;
  setRequestLocale(locale);
  const cookieStore = await cookies();
  const result = await fetchPublicTourPayloadWithCookies(imobiliaria, tourSlug, (n) => cookieStore.get(n)?.value);
  if (!result.ok) {
    return { title: 'Tour — Imerso' };
  }
  const { tour: tr, imobiliaria: im } = result.data;
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
  return {
    title: `${tr.titulo} — ${im.nome}`,
    description: (tr.descricao ?? '').slice(0, 160),
    openGraph: {
      title: tr.titulo,
      description: tr.descricao ?? undefined,
      ...(base ? { images: [`${base}/api/og/${imobiliaria}/${tourSlug}`] } : {}),
      type: 'website',
    },
  };
}

export default async function PublicTourPage({ params }: PageProps) {
  const { locale, imobiliaria, tour: tourSlug } = await params;
  setRequestLocale(locale);
  const cookieStore = await cookies();

  const result = await fetchPublicTourPayloadWithCookies(imobiliaria, tourSlug, (n) => cookieStore.get(n)?.value);

  if (!result.ok) {
    if (result.code === 'PASSWORD_REQUIRED') {
      redirect({ href: `/${imobiliaria}/${tourSlug}/senha`, locale });
    }
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
  const shareUrl = baseUrl ? `${baseUrl}/${imobiliaria}/${tourSlug}` : `/${imobiliaria}/${tourSlug}`;

  return <TourPublicExperience data={result.data} shareUrl={shareUrl} />;
}
