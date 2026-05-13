'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';

export type TourRow = {
  id: string;
  titulo: string;
  slug: string;
  status: string;
  imobiliaria_id: string;
  corretor_id: string | null;
  created_at: string;
  imobiliaria_slug: string;
  imobiliaria_nome: string;
  corretor_nome: string;
};

type ImobOption = { id: string; nome: string; slug: string };

type ToursTableProps = {
  rows: TourRow[];
  imobs: ImobOption[];
  initialFilters: { status?: string; imob?: string; q?: string };
};

const STATUSES = ['all', 'draft', 'uploading', 'processing', 'ready', 'failed', 'archived'] as const;

function statusVariant(s: string): React.ComponentProps<typeof Badge>['variant'] {
  if (s === 'ready') return 'ready';
  if (s === 'processing') return 'processing';
  if (s === 'failed') return 'failed';
  if (s === 'draft') return 'draft';
  return 'default';
}

export function ToursTable({ rows, imobs, initialFilters }: ToursTableProps) {
  const t = useTranslations('admin.tours');
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [status, setStatus] = useState(initialFilters.status ?? 'all');
  const [imob, setImob] = useState(initialFilters.imob ?? '');
  const [q, setQ] = useState(initialFilters.q ?? '');

  const hrefFilters = useMemo(() => {
    const p = new URLSearchParams();
    if (status && status !== 'all') p.set('status', status);
    if (imob) p.set('imob', imob);
    if (q.trim()) p.set('q', q.trim());
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [status, imob, q]);

  function applyFilters() {
    router.push(`/painel/tours${hrefFilters}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <label className="mb-1 block text-xs text-text-secondary">{t('filter_status')}</label>
          <select
            className="h-10 rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">{t('filter_imob')}</label>
          <select
            className="h-10 min-w-[180px] rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary"
            value={imob}
            onChange={(e) => setImob(e.target.value)}
          >
            <option value="">{t('filter_imob_all')}</option>
            {imobs.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-text-secondary">{t('filter_search')}</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('filter_search_ph')} />
        </div>
        <Button type="button" onClick={applyFilters}>
          {t('filter_apply')}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface-elevated text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">{t('col_titulo')}</th>
              <th className="px-4 py-3 font-medium">{t('col_imob')}</th>
              <th className="px-4 py-3 font-medium">{t('col_corretor')}</th>
              <th className="px-4 py-3 font-medium">{t('col_status')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                  <td className="px-4 py-3 font-medium text-text-primary">{r.titulo}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.imobiliaria_nome}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.corretor_nome || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {r.status === 'ready' && (
                        <a
                          href={`/${locale}/${r.imobiliaria_slug}/${r.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                        >
                          Ver tour
                        </a>
                      )}
                      <Link href={`/painel/tours/${r.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                        {t('edit')}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
