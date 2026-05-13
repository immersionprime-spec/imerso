'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tour.titulo}</DialogTitle>
        </DialogHeader>
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
            {tour.area_m2 != null ? (
              <p>
                {t('area')}: {tour.area_m2} m²
              </p>
            ) : null}
            {tour.quartos != null ? (
              <p>
                {t('quartos')}: {tour.quartos}
              </p>
            ) : null}
            {tour.modalidade ? (
              <p>
                {t('modalidade')}: {t(`mod.${tour.modalidade}`)}
              </p>
            ) : null}
            <p className="text-lg font-medium text-accent">{formatBrl(tour.valor)}</p>
          </div>
          {tour.descricao ? <p className="text-text-secondary leading-relaxed">{tour.descricao}</p> : null}
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
            <div className="border-t border-border pt-4">
              <p className="font-medium text-text-primary">{corretor.nome}</p>
              {corretor.creci ? <p className="text-text-muted">CRECI {corretor.creci}</p> : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
