import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from './LoginForm';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'admin.login' });
  return { title: t('title') };
}

export default async function PainelLoginPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.login');

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 text-center">
        <p className="font-display text-2xl font-semibold text-text-primary">Imerso</p>
        <h1 className="mt-2 text-lg text-text-secondary">{t('title')}</h1>
      </div>
      <LoginForm />
    </div>
  );
}
