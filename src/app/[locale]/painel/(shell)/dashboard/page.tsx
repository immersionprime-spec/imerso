import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { BarChart3, Eye, Home, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'admin.dashboard' });
  return { title: t('title') };
}

export default async function PainelDashboardPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.dashboard');

  const kpis = [
    { key: 'kpi_tours', value: '0', icon: Home },
    { key: 'kpi_ready', value: '0', icon: BarChart3 },
    { key: 'kpi_views', value: '0', icon: Eye },
    { key: 'kpi_whatsapp', value: '0', icon: MessageCircle },
  ] as const;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-text-secondary">{t('subtitle')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ key, value, icon: Icon }) => (
          <Card key={key} hover className="flex flex-col gap-2 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">{t(key)}</span>
              <Icon className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <p className="font-display text-3xl font-semibold text-text-primary">{value}</p>
            <p className="text-xs text-text-muted">{t('mock_note')}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
