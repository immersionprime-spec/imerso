import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { CorretoresPanel } from './CorretoresPanel';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function CorretoresPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const t = await getTranslations('admin.corretores');
  const supabase = await createClient();

  const { data: imoRow } = await supabase
    .from('imobiliarias')
    .select('id, nome, slug')
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();

  const imo = imoRow as { id: string; nome: string; slug: string } | null;
  if (!imo) notFound();

  const { data: corretores } = await supabase
    .from('corretores')
    .select('id, nome, creci, whatsapp, email, foto_url, ativo')
    .eq('imobiliaria_id', id)
    .order('nome');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href={`/painel/imobiliarias/${id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-2 -ml-2')}>
            ← {t('back_imob')}
          </Link>
          <h1 className="font-display text-2xl font-semibold text-text-primary">{t('title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {imo.nome} · {imo.slug}
          </p>
        </div>
      </div>
      <CorretoresPanel imobiliariaId={id} initialRows={corretores ?? []} />
    </div>
  );
}
