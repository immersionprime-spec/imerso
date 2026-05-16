'use client';

import { useEffect, useRef } from 'react';
import type { SplatViewerAPI } from './SplatViewer';
import type { PublicTourPayload } from '@/types/public-tour';

interface MiniMapProps {
  api: SplatViewerAPI | null;
  hotspots: PublicTourPayload['hotspots'];
  open: boolean;
}

export function MiniMap({ api, hotspots, open }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !api) return;
    const viewerApi = api;
    let rafId = 0;
    let timeoutId = 0;

    function scheduleNext() {
      timeoutId = window.setTimeout(() => {
        rafId = requestAnimationFrame(frame);
      }, 100);
    }

    function frame() {
      const canvas = canvasRef.current;
      const bounds = viewerApi.getSceneBounds();
      if (!canvas || !bounds) {
        scheduleNext();
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        scheduleNext();
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      const pad = 10;
      const minX = bounds.min[0];
      const maxX = bounds.max[0];
      const minZ = bounds.min[2];
      const maxZ = bounds.max[2];
      const dx = Math.max(maxX - minX, 1e-6);
      const dz = Math.max(maxZ - minZ, 1e-6);

      const toCanvas = (x: number, z: number) => {
        const nx = pad + ((x - minX) / dx) * (w - 2 * pad);
        const ny = h - (pad + ((z - minZ) / dz) * (h - 2 * pad));
        return { nx, ny };
      };

      ctx.fillStyle = 'rgba(15, 23, 41, 0.92)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(42, 56, 86, 1)';
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      ctx.fillStyle = 'rgba(107, 122, 153, 0.35)';
      for (const hp of hotspots) {
        const p = toCanvas(hp.posicao_x, hp.posicao_z);
        ctx.beginPath();
        ctx.arc(p.nx, p.ny, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const cam = viewerApi.getCameraState();
      const px = cam.position[0] ?? 0;
      const pz = cam.position[2] ?? 0;
      const cp = toCanvas(px, pz);
      ctx.fillStyle = '#4F8EF7';
      ctx.beginPath();
      ctx.arc(cp.nx, cp.ny, 5, 0, Math.PI * 2);
      ctx.fill();

      scheduleNext();
    }

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [api, hotspots, open]);

  if (!open) return null;

  return (
    <div className="pointer-events-none absolute bottom-20 left-3 z-[26] rounded-lg border border-border-strong bg-surface/90 p-1 shadow-lg-dark backdrop-blur-sm sm:bottom-24 sm:left-4">
      <canvas ref={canvasRef} width={144} height={144} className="rounded-md" aria-hidden />
    </div>
  );
}
