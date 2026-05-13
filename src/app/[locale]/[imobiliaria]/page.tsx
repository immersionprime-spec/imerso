import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { fetchPublicGallery } from '@/lib/data/public-gallery';
import { TourCard, type TourCardTour } from '@/components/shared/TourCard';

type PageProps = {
  params: Promise<{ locale: string; imobiliaria: string }>;
};

export default async function PublicGalleryPage({ params }: PageProps) {
  const { locale, imobiliaria: imobSlug } = await params;
  setRequestLocale(locale);
  const data = await fetchPublicGallery(imobSlug);
  if (!data) notFound();

  const t = await getTranslations('viewer.gallery');

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="container-imerso flex flex-wrap items-center justify-between gap-4 py-6">
          <div className="flex items-center gap-3">
            {data.imobiliaria.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={data.imobiliaria.logo_url} alt="" className="h-10 w-auto" />
            ) : null}
            <div>
              <h1 className="font-display text-xl font-semibold text-text-primary">{data.imobiliaria.nome}</h1>
              <p className="text-sm text-text-muted">{t('title')}</p>
            </div>
          </div>
        </div>
      </header>
      <main className="container-imerso py-10">
        {data.tours.length === 0 ? (
          <p className="text-center text-text-secondary">{t('empty')}</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.tours.map((tour) => {
              const st = tour.status_venda as TourCardTour['status_venda'] | undefined;
              const status: TourCardTour['status_venda'] =
                st === 'reservado' || st === 'vendido' || st === 'disponivel' ? st : 'disponivel';
              const cardTour: TourCardTour = {
                id: tour.id,
                slug: tour.slug,
                titulo: tour.titulo,
                bairro: tour.bairro,
                area_m2: tour.area_m2,
                quartos: tour.quartos,
                valor: tour.valor,
                foto_capa_url: tour.foto_capa_url,
                status_venda: status,
              };
              return (
                <li key={tour.id}>
                  <TourCard tour={cardTour} imobiliariaSlug={imobSlug} />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
