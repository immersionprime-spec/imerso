'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/Button';
import type { SplatViewerAPI } from './SplatViewer';
import type { PublicTourPayload } from '@/types/public-tour';
import { cn } from '@/lib/utils/cn';

interface CinematicPlayerProps {
  api: SplatViewerAPI | null;
  waypoints: PublicTourPayload['waypoints'];
}

export function CinematicPlayer({ api, waypoints }: CinematicPlayerProps) {
  const t = useTranslations('viewer.cinematic');
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const segmentRef = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  const sorted = useMemo(
    () => [...waypoints].sort((a, b) => a.ordem - b.ordem),
    [waypoints]
  );
  const canPlay = sorted.length >= 2;

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    if (!playing || !api || !canPlay) return;

    const posA = new Vector3();
    const posB = new Vector3();
    const tgtA = new Vector3();
    const tgtB = new Vector3();
    const posCur = new Vector3();
    const tgtCur = new Vector3();

    function tick(now: number) {
      if (!playingRef.current || !api) return;

      const i = segmentRef.current;
      if (i >= sorted.length - 1) {
        setPlaying(false);
        segmentRef.current = 0;
        startRef.current = 0;
        return;
      }

      const from = sorted[i];
      const to = sorted[i + 1];
      const dur = Math.max(500, from.duration_ms ?? 4000);

      if (startRef.current === 0) startRef.current = now;

      posA.set(from.position_x, from.position_y, from.position_z);
      posB.set(to.position_x, to.position_y, to.position_z);
      tgtA.set(from.target_x, from.target_y, from.target_z);
      tgtB.set(to.target_x, to.target_y, to.target_z);

      const elapsed = now - startRef.current;
      const alpha = Math.min(1, elapsed / dur);
      posCur.lerpVectors(posA, posB, alpha);
      tgtCur.lerpVectors(tgtA, tgtB, alpha);

      api.setCameraState({
        position: posCur.toArray(),
        target: tgtCur.toArray(),
      });

      if (alpha >= 1) {
        segmentRef.current = i + 1;
        startRef.current = now;
        if (segmentRef.current >= sorted.length - 1) {
          setPlaying(false);
          segmentRef.current = 0;
          startRef.current = 0;
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    segmentRef.current = 0;
    startRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, api, canPlay, sorted]);

  useEffect(() => {
    if (!playing) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('[data-cinematic-ui]')) return;
      setPlaying(false);
      segmentRef.current = 0;
      startRef.current = 0;
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [playing]);

  if (!canPlay) return null;

  return (
    <div className="pointer-events-auto fixed bottom-24 left-1/2 z-[27] -translate-x-1/2 sm:bottom-28">
      <button
        type="button"
        data-cinematic-ui
        className={cn(
          buttonVariants({ variant: playing ? 'outline' : 'accent', size: 'lg' }),
          'shadow-glow-accent'
        )}
        aria-pressed={playing}
        aria-label={playing ? t('stop') : t('play')}
        onClick={(e) => {
          e.stopPropagation();
          if (playing) {
            setPlaying(false);
            segmentRef.current = 0;
            startRef.current = 0;
          } else {
            segmentRef.current = 0;
            startRef.current = 0;
            setPlaying(true);
          }
        }}
      >
        {playing ? t('stop') : t('play')}
      </button>
    </div>
  );
}
