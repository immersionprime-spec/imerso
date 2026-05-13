'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { Trash2, Camera } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';
import { SplatViewer, type SplatViewerAPI } from '@/components/viewer/SplatViewer';
import { CinematicPlayer } from '@/components/viewer/CinematicPlayer';
import type { PublicTourPayload } from '@/types/public-tour';

type WpRow = PublicTourPayload['waypoints'][number];

export function WaypointsEditorClient({
  tourId,
  tourTitulo,
  splatUrl,
  cameraUpInverted,
  hasCinematicMode,
  tourStatus,
  initialWaypoints,
}: {
  tourId: string;
  tourTitulo: string;
  splatUrl: string | null;
  cameraUpInverted: boolean;
  hasCinematicMode: boolean;
  tourStatus: string;
  initialWaypoints: WpRow[];
}) {
  const t = useTranslations('admin.tours.waypoints');
  const router = useRouter();
  const [waypoints, setWaypoints] = useState<WpRow[]>(initialWaypoints);
  const [api, setApi] = useState<SplatViewerAPI | null>(null);

  useEffect(() => {
    setWaypoints(initialWaypoints);
  }, [initialWaypoints]);

  const canViewer = Boolean(splatUrl) && tourStatus === 'ready';
  const canAdd = canViewer && hasCinematicMode && api != null;

  async function addFromCamera() {
    if (!api) return;
    const { position, target } = api.getCameraState();
    const res = await fetch(`/api/admin/tours/${tourId}/waypoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_x: position[0],
        position_y: position[1],
        position_z: position[2],
        target_x: target[0],
        target_y: target[1],
        target_z: target[2],
        duration_ms: 4000,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error?.message ?? t('error_save'));
      return;
    }
    toast.success(t('saved'));
    router.refresh();
  }

  async function updateDuration(id: string, ms: number) {
    const res = await fetch(`/api/admin/waypoints/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_ms: ms }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error?.message ?? t('error_save'));
      return;
    }
    router.refresh();
  }

  async function removeWp(id: string) {
    if (!window.confirm(t('confirm_delete'))) return;
    const res = await fetch(`/api/admin/waypoints/${id}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error?.message ?? t('error_delete'));
      return;
    }
    setWaypoints((w) => w.filter((x) => x.id !== id));
    toast.success(t('deleted'));
    router.refresh();
  }

  const sorted = [...waypoints].sort((a, b) => a.ordem - b.ordem);
  const showPlayer = hasCinematicMode && sorted.length >= 2;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 space-y-4 lg:w-80">
        <Link href={`/painel/tours/${tourId}`} className="text-sm text-primary hover:underline">
          ← {t('back_tour')}
        </Link>
        <h2 className="font-display text-lg font-semibold text-text-primary">{tourTitulo}</h2>
        <p className="text-sm text-text-secondary">{t('hint')}</p>
        {!hasCinematicMode ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            {t('need_cinematic')}{' '}
            <Link href={`/painel/tours/${tourId}`} className="underline">
              {t('open_tour')}
            </Link>
          </p>
        ) : null}
        {!canViewer ? (
          <p className="rounded-md border border-border p-3 text-sm text-text-muted">{t('need_ready')}</p>
        ) : null}
        <Button type="button" variant="accent" className="w-full" disabled={!canAdd} onClick={() => void addFromCamera()}>
          <Camera className="mr-2 h-4 w-4" />
          {t('add_from_camera')}
        </Button>
        <ul className="max-h-[40vh] space-y-2 overflow-y-auto rounded-lg border border-border bg-surface p-3">
          {sorted.length === 0 ? (
            <li className="text-sm text-text-muted">{t('empty')}</li>
          ) : (
            sorted.map((w, idx) => (
              <li
                key={w.id}
                className="space-y-2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-text-primary">{t('waypoint_label', { n: idx + 1 })}</span>
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'text-error')}
                    aria-label={t('delete')}
                    onClick={() => void removeWp(w.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <label className="block text-xs text-text-muted">{t('duration_ms')}</label>
                <Input
                  type="number"
                  min={1000}
                  max={60000}
                  step={500}
                  defaultValue={w.duration_ms}
                  key={`${w.id}-${w.duration_ms}`}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    void updateDuration(w.id, v);
                  }}
                />
              </li>
            ))
          )}
        </ul>
      </aside>

      <div className="relative min-h-[min(70dvh,560px)] flex-1 overflow-hidden rounded-xl border border-border bg-background">
        {canViewer && splatUrl ? (
          <>
            <SplatViewer splatUrl={splatUrl} cameraUpInverted={cameraUpInverted} onReady={setApi} />
            {showPlayer && api ? <CinematicPlayer api={api} waypoints={sorted} /> : null}
          </>
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center text-text-muted">{t('no_viewer')}</div>
        )}
      </div>
    </div>
  );
}
