'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import type { PublicTourPayload } from '@/types/public-tour';

interface InfoPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PublicTourPayload;
}

function formatBrl(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function InfoPanel({ open, onOpenChange, data }: InfoPanelProps) {
  const t = useTranslations('viewer.info_panel');
  const { tour, imobiliaria, corretor } = data;
  const statusKey = tour.status_venda as 'disponivel' | 'reservado' | 'vendido';

  const [shouldRender, setShouldRender] = useState(open);
  useEffect(() => {
    if (open) {
      setShouldRender(true);
    } else {
      const timerId = window.setTimeout(() => setShouldRender(false), 350);
      return () => window.clearTimeout(timerId);
    }
  }, [open]);

  if (!shouldRender) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
        style={{ opacity: open ? 1 : 0, transition: 'opacity 350ms ease' }}
        onClick={() => onOpenChange(false)}
        aria-hidden
      />

      <div
        className={[
          'fixed z-50 flex flex-col bg-surface shadow-2xl',
          'bottom-0 left-0 right-0 max-h-[75dvh] rounded-t-2xl md:bottom-auto',
          'md:right-0 md:top-0 md:h-full md:w-[380px] md:rounded-none md:rounded-l-xl',
          open
            ? 'translate-y-0 md:translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full',
          'transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label="Informações do imóvel"
      >
        <div className="flex justify-center pb-1 pt-3 md:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display line-clamp-1 text-lg font-medium text-text-primary">{tour.titulo}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary"
            aria-label="Fechar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4 text-sm">
            {tour.foto_capa_url ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tour.foto_capa_url} alt="" className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusKey}>{t(`status.${statusKey}`)}</Badge>
              <span className="text-text-muted">{t(`tipo.${tour.tipo}`)}</span>
            </div>
            {tour.bairro ? (
              <p className="text-text-secondary">
                {t('bairro')}: {tour.bairro}
              </p>
            ) : null}
            <div className="grid gap-1 text-text-secondary">
              {tour.area_m2 != null ? <p>{t('area')}: {tour.area_m2} m²</p> : null}
              {tour.quartos != null ? <p>{t('quartos')}: {tour.quartos}</p> : null}
              {tour.modalidade ? <p>{t('modalidade')}: {t(`mod.${tour.modalidade}`)}</p> : null}
              <p className="text-lg font-medium text-accent">{formatBrl(tour.valor)}</p>
            </div>
            {tour.descricao ? <p className="leading-relaxed text-text-secondary">{tour.descricao}</p> : null}
            <div className="border-t border-border pt-4">
              <p className="text-xs text-text-muted">{imobiliaria.nome}</p>
              {imobiliaria.logo_url ? (
                <div className="mt-2 h-10 w-32">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imobiliaria.logo_url} alt="" className="max-h-10 w-auto object-contain object-left" />
                </div>
              ) : null}
            </div>
            {corretor ? (
              <div className="flex items-center gap-3 border-t border-border pt-4">
                {corretor.foto_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={corretor.foto_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-full border border-border bg-surface-elevated" />
                )}
                <div>
                  <p className="font-medium text-text-primary">{corretor.nome}</p>
                  {corretor.creci ? <p className="text-xs text-text-muted">CRECI {corretor.creci}</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
