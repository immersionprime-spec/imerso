import { setRequestLocale } from 'next-intl/server';
import { TourPasswordForm } from './TourPasswordForm';

type PageProps = {
  params: Promise<{ locale: string; imobiliaria: string; tour: string }>;
};

export default async function TourPasswordPage({ params }: PageProps) {
  const { locale, imobiliaria, tour } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <TourPasswordForm imobiliaria={imobiliaria} tourSlug={tour} />
    </div>
  );
}
