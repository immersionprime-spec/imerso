'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { SplatViewerAPI } from '@/components/viewer/SplatViewer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';
import { isWaypointEntryComplete, type PendingWaypoint } from './types';

export interface TourDestinationOption {
  id: string;
  titulo: string;
}

interface WaypointPanelProps {
  tourId: string;
  mode: 'create' | 'edit';
  waypoint: PendingWaypoint;
  availableTours: TourDestinationOption[];
  api: SplatViewerAPI | null;
  onClose: () => void;
  onSaved: () => void;
  onRefresh: () => void;
  onChange: (patch: Partial<PendingWaypoint>) => void;
}

function formatCoord(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : '0.000';
}

export function WaypointPanel({
  tourId,
  mode,
  waypoint,
  availableTours,
  api,
  onClose,
  onSaved,
  onRefresh,
  onChange,
}: WaypointPanelProps) {
  const [saving, setSaving] = useState(false);
  const [savingEntryCam, setSavingEntryCam] = useState(false);

  const destLabel =
    availableTours.find((t) => t.id === waypoint.next_tour_id)?.titulo ?? null;

  const entryComplete = isWaypointEntryComplete({
    next_cam_position: waypoint.next_cam_position ?? null,
  });

  async function patchWaypoint(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/tours/${tourId}/waypoints/${waypoint.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      toast.error(j?.error?.message ?? 'Erro ao atualizar waypoint.');
      return false;
    }
    return true;
  }

  async function handleSave() {
    if (!waypoint.next_tour_id) {
      toast.error('Selecione o tour de destino.');
      return;
    }

    setSaving(true);
    try {
      if (mode === 'edit') {
        const ok = await patchWaypoint({
          proximity_threshold: waypoint.proximity_threshold,
          label_distance: waypoint.label_distance,
        });
        if (!ok) return;
        toast.success('Waypoint atualizado.');
        onRefresh();
        return;
      }

      const res = await fetch(`/api/admin/tours/${tourId}/waypoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_x: waypoint.position_x,
          position_y: waypoint.position_y,
          position_z: waypoint.position_z,
          target_x: waypoint.target_x,
          target_y: waypoint.target_y,
          target_z: waypoint.target_z,
          next_tour_id: waypoint.next_tour_id,
          proximity_threshold: waypoint.proximity_threshold,
          label_distance: waypoint.label_distance,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(j?.error?.message ?? 'Erro ao salvar waypoint.');
        return;
      }
      toast.success('Waypoint salvo.');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleSetEntryCamera() {
    if (!api) {
      toast.error('Viewer ainda não está pronto.');
      return;
    }

    setSavingEntryCam(true);
    try {
      const { position, target } = api.getCameraState();
      const next_cam_position = { x: position[0], y: position[1], z: position[2] };
      const next_cam_target = { x: target[0], y: target[1], z: target[2] };

      const ok = await patchWaypoint({ next_cam_position, next_cam_target });
      if (!ok) return;

      onChange({ next_cam_position, next_cam_target });
      toast.success('Câmera de entrada definida.');
      onRefresh();
    } finally {
      setSavingEntryCam(false);
    }
  }

  return (
    <aside
      className={cn(
        'pointer-events-auto absolute right-3 top-3 z-30 flex w-[min(100%,320px)] flex-col gap-4',
        'rounded-lg border border-border bg-surface/95 p-4 shadow-lg-dark backdrop-blur-md'
      )}
      aria-label={mode === 'edit' ? 'Editar waypoint' : 'Novo waypoint'}
    >
      <div>
        <h3 className="font-semibold text-text-primary">
          {mode === 'edit' ? 'Editar waypoint' : 'Novo waypoint'}
        </h3>
        <p className="mt-0.5 text-xs text-text-muted">
          {mode === 'edit'
            ? 'Ajuste thresholds ou defina a câmera de entrada (lado B).'
            : 'Posição = câmera no momento do clique'}
        </p>
      </div>

      {mode === 'edit' ? (
        <p
          className={cn(
            'rounded-md px-2 py-1.5 text-xs',
            entryComplete
              ? 'bg-success/15 text-success'
              : 'bg-warning/15 text-warning'
          )}
        >
          {entryComplete ? '✓ Câmera de entrada configurada' : '⚠ Câmera de entrada não configurada'}
        </p>
      ) : null}

      <div className="space-y-1">
        <p className="text-xs font-medium text-text-secondary">Posição do waypoint</p>
        <p className="font-mono text-xs text-text-primary">
          X: {formatCoord(waypoint.position_x)} · Y: {formatCoord(waypoint.position_y)} · Z:{' '}
          {formatCoord(waypoint.position_z)}
        </p>
        <p className="font-mono text-[10px] text-text-muted">
          Alvo: {formatCoord(waypoint.target_x)} / {formatCoord(waypoint.target_y)} /{' '}
          {formatCoord(waypoint.target_z)}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-secondary" htmlFor="wp-dest-tour">
          Tour de destino
        </label>
        <select
          id="wp-dest-tour"
          disabled={mode === 'edit'}
          className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary disabled:opacity-60"
          value={waypoint.next_tour_id ?? ''}
          onChange={(e) => onChange({ next_tour_id: e.target.value || null })}
        >
          <option value="">Selecione…</option>
          {availableTours.map((t) => (
            <option key={t.id} value={t.id}>
              {t.titulo}
            </option>
          ))}
        </select>
        {destLabel ? (
          <p className="mt-1 text-[10px] text-text-muted">
            Legenda no tour: <span className="text-text-secondary">{destLabel}</span>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-text-secondary" htmlFor="wp-threshold">
            Threshold de trigger
          </label>
          <Input
            id="wp-threshold"
            type="number"
            step={0.1}
            min={0.1}
            value={waypoint.proximity_threshold}
            onChange={(e) =>
              onChange({ proximity_threshold: Number(e.target.value) || 1.8 })
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary" htmlFor="wp-label-dist">
            Distância da legenda
          </label>
          <Input
            id="wp-label-dist"
            type="number"
            step={0.1}
            min={0.1}
            value={waypoint.label_distance}
            onChange={(e) => onChange({ label_distance: Number(e.target.value) || 3.0 })}
          />
        </div>
      </div>

      {mode === 'edit' ? (
        <Button
          type="button"
          size="sm"
          variant="accent"
          disabled={savingEntryCam || !api}
          onClick={() => void handleSetEntryCamera()}
        >
          {savingEntryCam ? 'Salvando…' : 'Definir câmera de entrada aqui'}
        </Button>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Salvando…' : mode === 'edit' ? 'Salvar alterações' : 'Salvar waypoint'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </aside>
  );
}
