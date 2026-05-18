'use client';

import { cn } from '@/lib/utils/cn';
import { isWaypointEntryComplete, type SavedWaypoint } from './types';

interface WaypointListProps {
  waypoints: SavedWaypoint[];
  selectedId: string | null;
  onSelect: (wp: SavedWaypoint) => void;
  pendingCount: number;
}

export function WaypointList({
  waypoints,
  selectedId,
  onSelect,
  pendingCount,
}: WaypointListProps) {
  return (
    <aside
      className="pointer-events-auto absolute left-3 top-3 z-20 flex max-h-[min(70%,420px)] w-[min(100%,240px)] flex-col gap-2 overflow-hidden rounded-lg border border-border bg-surface/95 p-3 shadow-lg-dark backdrop-blur-md"
      aria-label="Conexões do tour"
    >
      <p className="text-xs font-semibold text-text-primary">Conexões</p>

      {pendingCount > 0 ? (
        <p className="rounded-md bg-orange-600/20 px-2 py-1.5 text-[11px] leading-snug text-orange-200">
          ⚠ {pendingCount} waypoint{pendingCount > 1 ? 's' : ''} sem câmera de entrada configurada
        </p>
      ) : null}

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {waypoints.map((wp) => {
          const complete = isWaypointEntryComplete(wp);
          return (
            <li key={wp.id}>
              <button
                type="button"
                onClick={() => onSelect(wp)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs',
                  selectedId === wp.id ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/50'
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    complete ? 'bg-success' : 'bg-warning'
                  )}
                  aria-hidden
                />
                <span className="truncate text-text-primary">{wp.label ?? 'Sem nome'}</span>
              </button>
            </li>
          );
        })}
        {waypoints.length === 0 ? (
          <li className="px-2 py-2 text-[11px] text-text-muted">Nenhum waypoint configurado</li>
        ) : null}
      </ul>
    </aside>
  );
}
