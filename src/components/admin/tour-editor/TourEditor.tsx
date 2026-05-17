'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SplatViewer, type SplatViewerAPI } from '@/components/viewer/SplatViewer';

const COORD_INTERVAL_MS = 200;
const FIT_RETRY_MS = 300;
const FIT_MAX_ATTEMPTS = 30;

interface TourEditorProps {
  tourId: string;
  splatUrl: string;
  cameraUpInverted?: boolean;
  splatRotationDeg?: number | null;
}

function formatCoord(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : '0.000';
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
  const fitTimeoutIdsRef = useRef<number[]>([]);

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
  }, [splatUrl]);

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
      <div className="pointer-events-none absolute inset-0 z-10" aria-hidden />
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


