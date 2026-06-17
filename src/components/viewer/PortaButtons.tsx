'use client';

import { DoorOpen } from 'lucide-react';
import type { SplatViewerAPI } from './SplatViewer';
import type { PublicTourPayload } from '@/types/public-tour';

interface PortaButtonsProps {
  api: SplatViewerAPI | null;
  waypoints: PublicTourPayload['waypoints'];
}

export function PortaButtons({ api, waypoints }: PortaButtonsProps) {
  if (!api) return null;

  const portas = waypoints.filter((w) => w.label && w.next_tour_href);

  if (portas.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-1/2 z-[28] -translate-y-1/2 sm:right-4">
      {/* scrim de legibilidade — garante contraste sobre fundos claros do viewer 3D */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-10 -inset-y-12 -z-10 rounded-full"
        style={{
          background: 'radial-gradient(closest-side, rgba(0,0,0,0.35), rgba(0,0,0,0) 75%)',
        }}
      />
      <div className="pointer-events-auto flex flex-col items-end gap-2.5">
        {portas.map((w) => (
          <button
            key={w.id}
            type="button"
            className="flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-all duration-200 hover:scale-[1.02] active:scale-95"
            style={{
              background: 'rgba(79,142,247,0.15)',
              borderColor: 'rgba(79,142,247,0.3)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(79,142,247,0.25)';
              e.currentTarget.style.borderColor = 'rgba(79,142,247,0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(79,142,247,0.15)';
              e.currentTarget.style.borderColor = 'rgba(79,142,247,0.3)';
            }}
            onClick={() => {
              window.location.href = w.next_tour_href!;
            }}
            aria-label={w.label!}
          >
            <DoorOpen className="h-4 w-4" style={{ color: '#4F8EF7' }} aria-hidden />
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}
