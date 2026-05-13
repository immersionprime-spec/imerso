import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicHeader } from '@/components/layout/PublicHeader';

type PageProps = { params: Promise<{ locale: string }> };

export default async function TermosPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.termos');

  return (
    <>
      <PublicHeader />
      <main className="container-imerso max-w-3xl py-24 animate-fade-in">
        <nav className="mb-8 text-sm text-text-muted">
          <Link href="/" className="hover:text-primary">
            ← Imerso
          </Link>
        </nav>
        <h1 className="font-display text-4xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="mt-4 text-text-secondary">{t('intro')}</p>
        <div className="mt-10 space-y-6 text-sm leading-relaxed text-text-secondary">
          <p>{t('p1')}</p>
          <p>{t('p2')}</p>
          <p>{t('p3')}</p>
          <p>{t('p4')}</p>
          <p>{t('p5')}</p>
          <p>{t('p6')}</p>
          <p>{t('p7')}</p>
          <p>{t('p8')}</p>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
