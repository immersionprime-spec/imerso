'use client';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';

export type ImobiliariaRow = {
  id: string;
  slug: string;
  nome: string;
  has_login: boolean;
  created_at: string;
  tour_count: number;
};

type ImobiliariasTableProps = {
  rows: ImobiliariaRow[];
};

export function ImobiliariasTable({ rows }: ImobiliariasTableProps) {
  const t = useTranslations('admin.imobiliarias');
  const router = useRouter();

  async function archive(id: string, nome: string) {
    if (!window.confirm(t('confirm_archive', { nome }))) return;
    const res = await fetch(`/api/admin/imobiliarias/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error?.message ?? t('error_archive'));
      return;
    }
    toast.success(t('archived'));
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-12 text-center text-text-secondary">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-surface-elevated text-text-secondary">
          <tr>
            <th className="px-4 py-3 font-medium">{t('col_nome')}</th>
            <th className="px-4 py-3 font-medium">{t('col_slug')}</th>
            <th className="px-4 py-3 font-medium">{t('col_tours')}</th>
            <th className="px-4 py-3 font-medium">{t('col_login')}</th>
            <th className="px-4 py-3 font-medium text-right">{t('col_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-hover/50">
              <td className="px-4 py-3 font-medium text-text-primary">{r.nome}</td>
              <td className="px-4 py-3 text-text-secondary">{r.slug}</td>
              <td className="px-4 py-3 text-text-secondary">{r.tour_count}</td>
              <td className="px-4 py-3">
                {r.has_login ? (
                  <Badge variant="ready">{t('login_yes')}</Badge>
                ) : (
                  <Badge variant="draft">{t('login_no')}</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <Link
                    href={`/painel/imobiliarias/${r.id}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    {t('edit')}
                  </Link>
                  <Link
                    href={`/painel/imobiliarias/${r.id}/corretores`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    {t('corretores')}
                  </Link>
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: 'destructive', size: 'sm' }))}
                    onClick={() => archive(r.id, r.nome)}
                  >
                    {t('archive')}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
