'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SplatViewer, type SplatViewerAPI } from '@/components/viewer/SplatViewer';
import { Button } from '@/components/ui/Button';
import { WaypointPanel, type TourDestinationOption } from './WaypointPanel';
import { WaypointPins } from './WaypointPins';
import { WaypointList } from './WaypointList';
import type { PendingWaypoint, SavedWaypoint } from './types';
import { parseCamVec } from './types';

const COORD_INTERVAL_MS = 200;
const FIT_RETRY_MS = 300;
const FIT_MAX_ATTEMPTS = 30;
const ALTURA_STEP = 0.05;

interface TourEditorProps {
  tourId: string;
  splatUrl: string;
  cameraUpInverted?: boolean;
  splatRotationDeg?: number | null;
}

function formatCoord(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : '0.000';
}

function createPendingFromCamera(position: number[], target: number[]): PendingWaypoint {
  return {
    id: crypto.randomUUID(),
    position_x: position[0],
    position_y: position[1],
    position_z: position[2],
    target_x: target[0],
    target_y: target[1],
    target_z: target[2],
    next_tour_id: null,
    proximity_threshold: 1.8,
    label_distance: 3.0,
    status: 'pending',
  };
}

function savedToPending(wp: SavedWaypoint): PendingWaypoint {
  return {
    id: wp.id,
    position_x: wp.position_x,
    position_y: wp.position_y,
    position_z: wp.position_z,
    target_x: wp.target_x,
    target_y: wp.target_y,
    target_z: wp.target_z,
    next_tour_id: wp.next_tour_id,
    proximity_threshold: wp.proximity_threshold,
    label_distance: wp.label_distance,
    status: 'saved',
    next_cam_position: wp.next_cam_position,
    next_cam_target: wp.next_cam_target,
  };
}

function normalizePortaRow(row: Record<string, unknown>): SavedWaypoint {
  return {
    id: String(row.id),
    position_x: Number(row.position_x),
    position_y: Number(row.position_y),
    position_z: Number(row.position_z),
    target_x: Number(row.target_x),
    target_y: Number(row.target_y),
    target_z: Number(row.target_z),
    label: row.label != null ? String(row.label) : null,
    next_tour_id: row.next_tour_id != null ? String(row.next_tour_id) : null,
    next_cam_position: parseCamVec(row.next_cam_position),
    next_cam_target: parseCamVec(row.next_cam_target),
    proximity_threshold: Number(row.proximity_threshold) || 1.8,
    label_distance: Number(row.label_distance) || 3.0,
  };
}

export function TourEditor({
  tourId,
  splatUrl,
  cameraUpInverted,
  splatRotationDeg,
}: TourEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerReady, setContainerReady] = useState(false);
  const [api, setApi] = useState<SplatViewerAPI | null>(null);
  const [cameraCoords, setCameraCoords] = useState({ x: 0, y: 0, z: 0 });
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [pendingWaypoint, setPendingWaypoint] = useState<PendingWaypoint | null>(null);
  const [savedWaypoints, setSavedWaypoints] = useState<SavedWaypoint[]>([]);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [availableTours, setAvailableTours] = useState<TourDestinationOption[]>([]);
  const fitTimeoutIdsRef = useRef<number[]>([]);

  const fetchSavedWaypoints = useCallback(async () => {
    const res = await fetch(`/api/admin/tours/${tourId}/portas`);
    const data = (await res.json().catch(() => ({}))) as { portas?: Record<string, unknown>[] };
    const list = (data.portas ?? []).map(normalizePortaRow);
    setSavedWaypoints(list);
  }, [tourId]);

  const openWaypointFromCamera = useCallback((viewerApi: SplatViewerAPI) => {
    const { position, target } = viewerApi.getCameraState();
    setPanelMode('create');
    setSelectedWaypointId(null);
    setPendingWaypoint(createPendingFromCamera(position, target));
    setPanelOpen(true);
  }, []);

  const selectSavedWaypoint = useCallback((wp: SavedWaypoint, viewerApi: SplatViewerAPI | null) => {
    setSelectedWaypointId(wp.id);
    setPanelMode('edit');
    setPendingWaypoint(savedToPending(wp));
    setPanelOpen(true);
    viewerApi?.setCameraState({
      position: [wp.position_x, wp.position_y, wp.position_z],
      target: [wp.target_x, wp.target_y, wp.target_z],
    });
  }, []);

  const onReady = useCallback((viewerApi: SplatViewerAPI) => {
    setApi(viewerApi);
    setLoading(false);

    fitTimeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
    fitTimeoutIdsRef.current = [];

    let attempts = 0;
    const tryFit = () => {
      const bounds = viewerApi.getSceneBounds();
      if (bounds) {
        const cx = (bounds.min[0] + bounds.max[0]) / 2;
        const cy = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.4;
        const cz = (bounds.min[2] + bounds.max[2]) / 2;
        viewerApi.setCameraState({
          position: [cx, cy, cz + 2],
          target: [cx, cy, cz],
        });
        return;
      }
      attempts += 1;
      if (attempts < FIT_MAX_ATTEMPTS) {
        const id = window.setTimeout(tryFit, FIT_RETRY_MS);
        fitTimeoutIdsRef.current.push(id);
      }
    };

    const firstId = window.setTimeout(tryFit, FIT_RETRY_MS);
    fitTimeoutIdsRef.current.push(firstId);
  }, []);

  const onProgress = useCallback((percent: number) => {
    if (percent >= 100) setLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      fitTimeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      fitTimeoutIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    setContainerReady(false);
    setApi(null);
    setLoading(true);
    setPanelOpen(false);
    setPendingWaypoint(null);
    setSelectedWaypointId(null);
    setSavedWaypoints([]);
  }, [splatUrl]);

  useEffect(() => {
    void fetchSavedWaypoints();
  }, [fetchSavedWaypoints]);

  useEffect(() => {
    if (!tourId) return;
    void fetch(`/api/admin/tours/${tourId}/available-destinations`)
      .then((r) => r.json())
      .then((data: { tours?: TourDestinationOption[] }) => {
        setAvailableTours(data.tours ?? []);
      })
      .catch(() => setAvailableTours([]));
  }, [tourId]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !splatUrl) return;

    const check = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setContainerReady(true);
      }
    };

    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [splatUrl]);

  useEffect(() => {
    if (!api) return;
    const interval = window.setInterval(() => {
      const { position } = api.getCameraState();
      setCameraCoords({
        x: position[0],
        y: position[1],
        z: position[2],
      });
    }, COORD_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [api]);

  useEffect(() => {
    const container = wrapperRef.current;
    if (!container || !api) return;

    const handleClick = (e: MouseEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      openWaypointFromCamera(api);
    };

    const handleWheel = (e: WheelEvent) => {
      if (!e.shiftKey || !api) return;
      e.preventDefault();
      e.stopPropagation();
      const state = api.getCameraState();
      const delta = e.deltaY > 0 ? ALTURA_STEP : -ALTURA_STEP;
      api.setCameraState({
        position: [state.position[0], state.position[1] + delta, state.position[2]],
        target: [state.target[0], state.target[1] + delta, state.target[2]],
      });
    };

    container.addEventListener('click', handleClick, true);
    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    return () => {
      container.removeEventListener('click', handleClick, true);
      container.removeEventListener('wheel', handleWheel, true);
    };
  }, [api, openWaypointFromCamera]);

  function closePanel() {
    setPanelOpen(false);
    setPendingWaypoint(null);
    setSelectedWaypointId(null);
    setPanelMode('create');
  }

  function handleWaypointSaved() {
    void fetchSavedWaypoints();
    closePanel();
  }

  const pendingEntryCount = savedWaypoints.filter((w) => w.next_cam_position === null).length;

  if (!splatUrl) {
    return (
      <div
        data-tour-id={tourId}
        className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-secondary"
      >
        <p>Nenhum splat disponível. Faça o upload na aba Mídia para usar o editor.</p>
      </div>
    );
  }

  const showLoadingOverlay = !containerReady || loading;

  return (
    <div
      ref={wrapperRef}
      data-tour-id={tourId}
      className="relative h-[min(calc(100vh-14rem),720px)] min-h-[480px] w-full overflow-hidden rounded-lg border border-border bg-background"
    >
      <div className="absolute inset-0 h-full w-full min-h-0">
        {containerReady ? (
          <SplatViewer
            splatUrl={splatUrl}
            cameraUpInverted={cameraUpInverted}
            splatRotationDeg={splatRotationDeg ?? undefined}
            onReady={onReady}
            onProgress={onProgress}
          />
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <WaypointList
          waypoints={savedWaypoints}
          selectedId={selectedWaypointId}
          pendingCount={pendingEntryCount}
          onSelect={(wp) => selectSavedWaypoint(wp, api)}
        />

        <WaypointPins
          api={api}
          waypoints={savedWaypoints}
          selectedId={selectedWaypointId}
          onSelect={(wp) => selectSavedWaypoint(wp, api)}
        />

        <div className="pointer-events-auto absolute right-3 top-3 flex flex-col items-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="accent"
            disabled={!api}
            onClick={() => {
              if (!api) return;
              openWaypointFromCamera(api);
            }}
          >
            + Marcar waypoint aqui
          </Button>
          <p className="max-w-[200px] text-right text-[10px] text-text-muted">
            Ctrl+Click no viewer · Shift+Scroll ajusta altura
          </p>
        </div>
      </div>

      {panelOpen && pendingWaypoint ? (
        <WaypointPanel
          tourId={tourId}
          mode={panelMode}
          waypoint={pendingWaypoint}
          availableTours={availableTours}
          api={api}
          onClose={closePanel}
          onSaved={handleWaypointSaved}
          onRefresh={() => void fetchSavedWaypoints()}
          onChange={(patch) => setPendingWaypoint((prev) => (prev ? { ...prev, ...patch } : prev))}
        />
      ) : null}

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-md bg-background/75 px-2.5 py-1.5 font-mono text-xs text-text-primary backdrop-blur-sm" aria-live="polite" aria-label="Coordenadas da câmera">
        X: {formatCoord(cameraCoords.x)} Y: {formatCoord(cameraCoords.y)} Z:{' '}
        {formatCoord(cameraCoords.z)}
      </div>

      {showLoadingOverlay ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-background/80">
          <p className="text-sm text-text-secondary">Carregando tour 3D…</p>
        </div>
      ) : null}
    </div>
  );
}
