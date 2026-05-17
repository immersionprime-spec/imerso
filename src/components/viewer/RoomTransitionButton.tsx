'use client';

import { DoorOpen } from 'lucide-react';
import type { SplatViewerAPI } from './SplatViewer';

export interface RoomTransitionTarget {
  /** Texto exibido no botão, ex: "→ Quarto" */
  label: string;
  /** URL pública do outro tour com locale, ex: "/pt/imerso-demo/quarto" */
  href: string;
}

interface RoomTransitionButtonProps {
  api: SplatViewerAPI | null;
  transition: RoomTransitionTarget | null;
}

/**
 * Botão fixo que permite navegar entre cômodos (sala ↔ quarto).
 * Ao clicar, faz window.location.href para o outro tour.
 * O tour de destino já tem camera_start_position gravado no banco,
 * então o viewer abre automaticamente no ponto de entrada correto.
 *
 * NÃO altera SplatViewer.tsx.
 * NÃO faz multi-scene — cada cômodo é um tour separado.
 */
export function RoomTransitionButton({ api, transition }: RoomTransitionButtonProps) {
  if (!api || !transition) return null;

  function handleClick() {
    window.location.href = transition!.href;
  }

  return (
    <div className="pointer-events-auto fixed bottom-24 right-4 z-[28] sm:bottom-28">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-2 rounded-full border border-border-strong bg-surface/95 px-4 py-2.5 text-sm font-medium text-text-primary shadow-md-dark backdrop-blur-sm transition-all hover:bg-surface-elevated hover:scale-105 active:scale-95"
        aria-label={transition.label}
      >
        <DoorOpen className="h-4 w-4 text-accent" aria-hidden />
        {transition.label}
      </button>
    </div>
  );
}
