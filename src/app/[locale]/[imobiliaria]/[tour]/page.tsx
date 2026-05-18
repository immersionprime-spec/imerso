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

function formatBrlShort(n: number | null | undefined): string {
  if (!n) return '';
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

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
  const valorStr = tr.valor ? formatBrlShort(tr.valor) : null;
  const descParts = [
    tr.quartos != null ? `${tr.quartos} quartos` : null,
    tr.area_m2 != null ? `${tr.area_m2}m²` : null,
    tr.bairro ?? null,
    valorStr ?? null,
  ].filter(Boolean);
  const ogDescription = descParts.join(' · ');
  const ogTitle = `${tr.titulo} | ${im.nome}`;
  const ogImageUrl = base ? `${base}/api/og/${imobiliaria}/${tourSlug}` : `/api/og/${imobiliaria}/${tourSlug}`;

  return {
    title: ogTitle,
    description: ogDescription || 'Tour virtual 3D imersivo — explore este imóvel agora.',
    openGraph: {
      title: ogTitle,
      description: ogDescription || 'Tour virtual 3D imersivo.',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: tr.titulo,
        },
      ],
      type: 'website',
      locale: 'pt_BR',
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription || 'Tour virtual 3D imersivo.',
      images: [ogImageUrl],
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
