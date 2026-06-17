'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface PropertySummaryCardProps {
  tour: {
    titulo: string;
    bairro: string | null;
    quartos: number | null;
    area_m2: number | null;
    valor: number | null;
    modalidade: string | null;
    status_venda: string;
  };
  onExpand: () => void;
  visible: boolean;
}

function formatBrl(n: number | null): string {
  if (n == null) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function PropertySummaryCard({ tour, onExpand, visible }: PropertySummaryCardProps) {
  const t = useTranslations('viewer');
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMounted(false);
      return;
    }
    const id = window.setTimeout(() => setMounted(true), 600);
    return () => window.clearTimeout(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 left-3 z-20 sm:left-4"
      style={{
        bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 400ms ease',
      }}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-md"
          aria-label={t('property_card_details')}
        >
          {tour.valor ? (
            <span className="text-xs font-semibold text-accent">{formatBrl(tour.valor)}</span>
          ) : (
            <span className="max-w-[140px] truncate text-xs text-white/70">{tour.titulo}</span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-white/40"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
        <div
          className="flex max-w-[200px] flex-col gap-1.5 rounded-xl border border-white/10 bg-black/60 p-3 backdrop-blur-md sm:max-w-[220px]"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 font-display text-[13px] font-medium leading-tight text-white">{tour.titulo}</p>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="shrink-0 rounded p-0.5 text-white/40 hover:text-white/80"
              aria-label={t('property_card_collapse')}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {tour.bairro ? (
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/60">{tour.bairro}</span>
            ) : null}
            {tour.quartos != null ? (
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/60">{tour.quartos} quartos</span>
            ) : null}
            {tour.area_m2 != null ? (
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/60">{tour.area_m2}m²</span>
            ) : null}
          </div>

          {tour.valor ? (
            <p className="text-sm font-semibold leading-none text-accent">
              {formatBrl(tour.valor)}
              {tour.modalidade === 'aluguel' || tour.modalidade === 'temporada' ? (
                <span className="ml-1 text-[10px] font-normal text-white/50">/mês</span>
              ) : null}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onExpand}
            className="mt-1 rounded-lg border border-primary/20 bg-primary/15 px-2 py-1.5 text-center text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
          >
            {t('property_card_details')}
          </button>
        </div>
      )}
    </div>
  );
}
