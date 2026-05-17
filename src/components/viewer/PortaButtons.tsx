'use client';

import { DoorOpen } from 'lucide-react';
import type { SplatViewerAPI } from './SplatViewer';
import type { PublicTourPayload } from '@/types/public-tour';

interface PortaButtonsProps {
  api: SplatViewerAPI | null;
  waypoints: PublicTourPayload['waypoints'];
}

/**
 * Renderiza os botões de porta visíveis ao visitante.
 * Um botão por waypoint que tem label + next_tour_href.
 * Ao clicar: navega para o tour de destino via window.location.href.
 * O destino já tem camera_start_position no banco (gravado pelo editor de portas).
 */
export function PortaButtons({ api, waypoints }: PortaButtonsProps) {
  if (!api) return null;

  const portas = waypoints.filter((w) => w.label && w.next_tour_href);

  if (portas.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[28] flex flex-col items-end gap-2 sm:bottom-28">
      {portas.map((w) => (
        <button
          key={w.id}
          type="button"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-border-strong bg-surface/95 px-4 py-2.5 text-sm font-medium text-text-primary shadow-md-dark backdrop-blur-sm transition-all hover:scale-105 hover:bg-surface-elevated active:scale-95"
          onClick={() => {
            window.location.href = w.next_tour_href!;
          }}
          aria-label={w.label!}
        >
          <DoorOpen className="h-4 w-4 text-accent" aria-hidden />
          {w.label}
        </button>
      ))}
    </div>
  );
}
