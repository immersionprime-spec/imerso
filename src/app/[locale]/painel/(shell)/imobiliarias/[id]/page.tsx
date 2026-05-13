import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { EditImobiliariaForm } from './EditImobiliariaForm';

type ImobiliariaEditRow = {
  id: string;
  nome: string;
  slug: string;
  whatsapp_principal: string | null;
  email_contato: string | null;
  cidade: string | null;
  estado: string | null;
  cor_primaria: string | null;
  logo_url: string | null;
  cnpj: string | null;
};

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function EditImobiliariaPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin();
  const t = await getTranslations('admin.imobiliarias');
  const supabase = await createClient();

  const { data: rowRaw } = await supabase
    .from('imobiliarias')
    .select('id, nome, slug, whatsapp_principal, email_contato, cidade, estado, cor_primaria, logo_url, cnpj')
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();

  const row = rowRaw as ImobiliariaEditRow | null;
  if (!row) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">{t('edit_title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{row.nome}</p>
        </div>
        <Link href={`/painel/imobiliarias/${id}/corretores`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          {t('corretores')}
        </Link>
      </div>
      <EditImobiliariaForm initial={row} />
    </div>
  );
}
