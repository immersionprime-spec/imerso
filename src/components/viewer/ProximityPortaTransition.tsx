'use client';

import { useEffect, useRef, useState } from 'react';
import type { SplatViewerAPI } from './SplatViewer';
import type { PublicTourPayload } from '@/types/public-tour';

/** Cooldown em ms após mount antes de ativar a detecção (evita trigger no ponto de entrada). */
const ACTIVATION_DELAY_MS = 3000;

/** Intervalo de polling da posição da câmera em ms. */
const POLL_INTERVAL_MS = 300;

/** Duração do fade-out antes de navegar (ms). */
const FADE_DURATION_MS = 600;

interface ProximityPortaTransitionProps {
  api: SplatViewerAPI | null;
  waypoints: PublicTourPayload['waypoints'];
}

function dist3d(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): number {
  const dx = ax - bx,
    dy = ay - by,
    dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function ProximityPortaTransition({ api, waypoints }: ProximityPortaTransitionProps) {
  const [fading, setFading] = useState(false);
  const triggeredRef = useRef(false);
  const activeRef = useRef(false); // true após ACTIVATION_DELAY_MS

  // Filtra apenas waypoints de porta com href válido
  const portaWaypoints = waypoints.filter((w) => w.next_tour_href && w.next_tour_id);

  useEffect(() => {
    if (!api || portaWaypoints.length === 0) return;

    triggeredRef.current = false;
    activeRef.current = false;

    // Cooldown antes de ativar
    const activationTimer = window.setTimeout(() => {
      activeRef.current = true;
    }, ACTIVATION_DELAY_MS);

    const interval = window.setInterval(() => {
      if (!activeRef.current || triggeredRef.current) return;

      const { position } = api.getCameraState();
      const [cx, cy, cz] = position;

      for (const wp of portaWaypoints) {
        const d = dist3d(cx, cy, cz, wp.position_x, wp.position_y, wp.position_z);
        if (d < wp.proximity_threshold) {
          triggeredRef.current = true;
          setFading(true);
          window.setTimeout(() => {
            window.location.href = wp.next_tour_href!;
          }, FADE_DURATION_MS);
          break;
        }
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(activationTimer);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, portaWaypoints.length]);

  if (!fading) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        backgroundColor: '#000',
        opacity: fading ? 1 : 0,
        transition: `opacity ${FADE_DURATION_MS}ms ease-in`,
        pointerEvents: 'none',
      }}
    />
  );
}
