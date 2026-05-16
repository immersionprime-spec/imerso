'use client';

import { useEffect, useRef } from 'react';
import {
  Armchair,
  Bath,
  Bed,
  Car,
  ChefHat,
  Droplets,
  Flame,
  Flower2,
  Laptop,
  LayoutGrid,
  MapPin,
  Sun,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { SplatViewerAPI } from './SplatViewer';
import type { PublicTourPayload } from '@/types/public-tour';
import { cn } from '@/lib/utils/cn';

const ICONS: Record<string, LucideIcon> = {
  suite: Bed,
  cozinha: ChefHat,
  varanda: Sun,
  banheiro: Bath,
  garagem: Car,
  sala: Armchair,
  piscina: Waves,
  jardim: Flower2,
  churrasqueira: Flame,
  home_office: Laptop,
  lavabo: Droplets,
  closet: LayoutGrid,
  area_servico: LayoutGrid,
  generico: MapPin,
};

interface HotspotMarkersProps {
  api: SplatViewerAPI | null;
  hotspots: PublicTourPayload['hotspots'];
}

export function HotspotMarkers({ api, hotspots }: HotspotMarkersProps) {
  const wrapperRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!api || hotspots.length === 0) return;
    const viewerApi = api;

    let rafId = 0;
    let lastTick = 0;
    const HOTSPOT_INTERVAL = 1000 / 20;
    const map = wrapperRefs.current;

    function tick(now: number) {
      if (now - lastTick >= HOTSPOT_INTERVAL) {
        lastTick = now;
        for (const h of hotspots) {
          const el = map.get(h.id);
          if (!el) continue;

          const projected = viewerApi.worldToScreen(h.posicao_x, h.posicao_y, h.posicao_z);
          if (!projected || !projected.visible) {
            el.style.display = 'none';
          } else {
            el.style.display = '';
            el.style.transform = `translate3d(${projected.sx}px, ${projected.sy}px, 0) translate(-50%, -100%)`;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [api, hotspots]);

  if (!api || hotspots.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[25] overflow-hidden">
      {hotspots.map((h) => {
        const Icon = ICONS[h.icone] ?? MapPin;
        return (
          <div
            key={h.id}
            ref={(el) => {
              if (el) wrapperRefs.current.set(h.id, el);
              else wrapperRefs.current.delete(h.id);
            }}
            className="group pointer-events-auto absolute left-0 top-0"
          >
            <button
              type="button"
              title={h.titulo}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full border border-border-strong',
                'bg-surface/95 shadow-md-dark backdrop-blur-sm transition-transform hover:scale-110'
              )}
              aria-label={h.titulo}
            >
              <Icon className="h-4 w-4 text-accent" aria-hidden />
            </button>
            {h.descricao ? (
              <span className="absolute left-1/2 top-full z-10 mt-1 hidden max-w-[200px] -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-text-secondary shadow-lg group-hover:block group-focus-within:block">
                {h.descricao}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
