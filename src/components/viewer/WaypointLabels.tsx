'use client';

import { useEffect, useState } from 'react';
import type { SplatViewerAPI } from './SplatViewer';
import type { PublicTourPayload } from '@/types/public-tour';

interface WaypointLabelsProps {
  api: SplatViewerAPI | null;
  waypoints: PublicTourPayload['waypoints'];
}

interface LabelState {
  id: string;
  label: string;
  sx: number;
  sy: number;
  opacity: number;
  visible: boolean;
}

function dist3d(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Intervalo de polling das labels de waypoint.
 * 200ms é suficiente para fade suave (transition 150ms no CSS) sem desperdiçar
 * CPU competindo com o requestAnimationFrame do SplatViewer. */
const POLL_MS = 200;

export function WaypointLabels({ api, waypoints }: WaypointLabelsProps) {
  const [labels, setLabels] = useState<LabelState[]>([]);

  const portaWaypoints = waypoints.filter((w) => w.next_tour_id && w.label);

  useEffect(() => {
    if (!api || portaWaypoints.length === 0) return;

    const interval = window.setInterval(() => {
      const { position } = api.getCameraState();
      const [cx, cy, cz] = position;

      const next: LabelState[] = [];

      for (const wp of portaWaypoints) {
        const dist = dist3d(cx, cy, cz, wp.position_x, wp.position_y, wp.position_z);
        const labelDist = wp.label_distance ?? 3.0;

        if (dist > labelDist * 2) continue;

        const proj = api.worldToScreen(wp.position_x, wp.position_y, wp.position_z);
        if (!proj || !proj.visible) continue;

        const opacity =
          dist >= labelDist ? 0 : Math.min(1, (labelDist - dist) / (labelDist * 0.75));

        if (opacity <= 0) continue;

        next.push({
          id: wp.id,
          label: wp.label!,
          sx: proj.sx,
          sy: proj.sy,
          opacity,
          visible: true,
        });
      }

      setLabels(next);
    }, POLL_MS);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, portaWaypoints.length]);

  if (labels.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {labels.map((l) => (
        <div
          key={l.id}
          style={{
            position: 'absolute',
            left: l.sx,
            top: l.sy,
            transform: 'translate(-50%, -100%)',
            opacity: l.opacity,
            transition: 'opacity 150ms ease',
          }}
        >
          <div
            style={{
              background: 'rgba(0,0,0,0.65)',
              color: '#fff',
              backdropFilter: 'blur(6px)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '13px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {l.label}
          </div>
        </div>
      ))}
    </div>
  );
}

