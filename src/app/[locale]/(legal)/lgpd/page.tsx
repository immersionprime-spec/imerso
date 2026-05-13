import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LgpdRequestForm } from '@/components/legal/LgpdRequestForm';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicHeader } from '@/components/layout/PublicHeader';

type PageProps = { params: Promise<{ locale: string }> };

export default async function LgpdPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.lgpd');

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
        <ul className="mt-8 list-inside list-disc space-y-2 text-sm text-text-secondary">
          <li>{t('r1')}</li>
          <li>{t('r2')}</li>
          <li>{t('r3')}</li>
          <li>{t('r4')}</li>
          <li>{t('r5')}</li>
          <li>{t('r6')}</li>
          <li>{t('r7')}</li>
          <li>{t('r8')}</li>
        </ul>
        <p className="mt-8 text-sm text-text-muted">{t('form_note')}</p>
        <LgpdRequestForm />
      </main>
      <PublicFooter />
    </>
  );
}
