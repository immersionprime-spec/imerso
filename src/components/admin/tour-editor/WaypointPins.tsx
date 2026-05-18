'use client';

import { useEffect, useState } from 'react';
import type { SplatViewerAPI } from '@/components/viewer/SplatViewer';
import { cn } from '@/lib/utils/cn';
import { isWaypointEntryComplete, type SavedWaypoint } from './types';

interface WaypointPinsProps {
  api: SplatViewerAPI | null;
  waypoints: SavedWaypoint[];
  selectedId: string | null;
  onSelect: (wp: SavedWaypoint) => void;
}

interface PinState {
  id: string;
  sx: number;
  sy: number;
}

const POLL_MS = 100;

export function WaypointPins({ api, waypoints, selectedId, onSelect }: WaypointPinsProps) {
  const [pins, setPins] = useState<PinState[]>([]);

  useEffect(() => {
    if (!api || waypoints.length === 0) {
      setPins([]);
      return;
    }

    const interval = window.setInterval(() => {
      const next: PinState[] = [];
      for (const wp of waypoints) {
        const proj = api.worldToScreen(wp.position_x, wp.position_y, wp.position_z);
        if (!proj || !proj.visible) continue;
        next.push({ id: wp.id, sx: proj.sx, sy: proj.sy });
      }
      setPins(next);
    }, POLL_MS);

    return () => window.clearInterval(interval);
  }, [api, waypoints]);

  if (pins.length === 0) return null;

  const wpById = new Map(waypoints.map((w) => [w.id, w]));

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]" aria-hidden>
      {pins.map((pin) => {
        const wp = wpById.get(pin.id);
        if (!wp) return null;
        const complete = isWaypointEntryComplete(wp);
        const selected = selectedId === wp.id;

        return (
          <div
            key={wp.id}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(wp);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(wp);
              }
            }}
            style={{
              position: 'absolute',
              left: pin.sx,
              top: pin.sy,
              transform: 'translate(-50%, -100%)',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            <div
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium shadow-md',
                complete ? 'bg-green-700/90 text-white' : 'bg-orange-600/90 text-white',
                selected ? 'animate-pulse ring-2 ring-white' : ''
              )}
            >
              {!complete ? <span aria-hidden>⚠</span> : null}
              {wp.label ?? 'Sem nome'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
