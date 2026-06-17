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

interface DirectionIndicator {
  id: string;
  label: string;
  sx: number;
  sy: number;
  visible: boolean;
  opacity: number;
  isClose: boolean;
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
  const [indicators, setIndicators] = useState<DirectionIndicator[]>([]);

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

      const newIndicators: DirectionIndicator[] = [];

      for (const wp of portaWaypoints) {
        const dist = dist3d(cx, cy, cz, wp.position_x, wp.position_y, wp.position_z);
        const labelDist = wp.label_distance ?? 3.0;
        const longRangeDist = labelDist * 5;

        if (dist > longRangeDist) continue;

        const isClose = dist <= labelDist;
        if (isClose) continue;

        const proj = api.worldToScreen(wp.position_x, wp.position_y, wp.position_z);
        if (!proj || !proj.visible) continue;

        const opacity = Math.min(0.8, (longRangeDist - dist) / (longRangeDist * 0.6));
        if (opacity <= 0) continue;

        newIndicators.push({
          id: wp.id,
          label: wp.label!,
          sx: proj.sx,
          sy: proj.sy,
          visible: true,
          opacity,
          isClose,
        });
      }

      setIndicators(newIndicators);
    }, POLL_MS);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, portaWaypoints.length]);

  if (labels.length === 0 && indicators.length === 0) return null;

  return (
    <>
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
              background: 'rgba(79,142,247,0.2)',
              color: '#fff',
              border: '1px solid rgba(79,142,247,0.4)',
              backdropFilter: 'blur(6px)',
              borderRadius: '9999px',
              padding: '5px 12px',
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: '14px',
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
    {indicators.length > 0 ? (
      <div className="pointer-events-none absolute inset-0 z-[19]" aria-hidden>
        {indicators.map((ind) => (
          <div
            key={`dir-${ind.id}`}
            style={{
              position: 'absolute',
              left: ind.sx,
              top: ind.sy,
              transform: 'translate(-50%, -50%)',
              opacity: ind.opacity,
              transition: 'opacity 200ms ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <div
                className="animate-pulse"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 5 5 12" />
                </svg>
              </div>
              <div
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  color: 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {ind.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : null}
    </>
  );
}

