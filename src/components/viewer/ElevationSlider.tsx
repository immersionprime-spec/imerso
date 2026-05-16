'use client';

import { useEffect, useRef, useState } from 'react';
import type { SplatViewerAPI } from './SplatViewer';

interface ElevationSliderProps {
  api: SplatViewerAPI | null;
}

/**
 * Slider vertical de altura da câmera — visível em touch E desktop.
 *
 * Arquitetura de eventos:
 * - onPointerDown no track (React) inicia o drag
 * - pointermove / pointerup registrados no WINDOW (nativo) durante o drag
 *   → evita perder eventos quando o dedo sai do elemento
 * - data-elevation-slider no track é lido pelo SplatViewer para ignorar
 *   o toque nessa área no sistema de look da câmera
 * - setCameraElevation atualiza cam.position.y E cachedNav.targetY no closure
 *   do viewer → altura mantida após andar com joystick
 */
export function ElevationSlider({ api }: ElevationSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const syncRafRef = useRef<number>(0);
  const applyRafRef = useRef<number>(0);
  const [ariaValue, setAriaValue] = useState(50);

  // ── helpers de geometria ──────────────────────────────────────────
  function getMaxTop(): number {
    if (!trackRef.current || !thumbRef.current) return 0;
    return Math.max(0, trackRef.current.clientHeight - thumbRef.current.clientHeight);
  }

  function thumbTopFromY(camY: number, limits: { yMin: number; yMax: number }): number {
    const span = limits.yMax - limits.yMin;
    const ratio = span > 0 ? Math.max(0, Math.min(1, (camY - limits.yMin) / span)) : 0.5;
    return getMaxTop() * (1 - ratio);
  }

  function yFromClientY(clientY: number, limits: { yMin: number; yMax: number }): number {
    if (!trackRef.current || !thumbRef.current) return limits.yMin;
    const rect = trackRef.current.getBoundingClientRect();
    const thumbH = thumbRef.current.clientHeight;
    const maxTop = getMaxTop();
    const relY = clientY - rect.top - thumbH / 2;
    const clampedTop = Math.max(0, Math.min(maxTop, relY));
    const ratio = maxTop > 0 ? 1 - clampedTop / maxTop : 0.5;
    return limits.yMin + ratio * (limits.yMax - limits.yMin);
  }

  function setThumbTop(top: number) {
    if (thumbRef.current) thumbRef.current.style.top = `${top}px`;
  }

  // ── aplicar elevação a partir de clientY ─────────────────────────
  function applyFromClientY(clientY: number) {
    if (!api) return;
    const limits = api.getCameraElevationLimits();
    if (!limits) return;

    // move thumb imediatamente (sem RAF para não perder frames de toque)
    if (trackRef.current && thumbRef.current) {
      const rect = trackRef.current.getBoundingClientRect();
      const thumbH = thumbRef.current.clientHeight;
      const maxTop = getMaxTop();
      const relY = clientY - rect.top - thumbH / 2;
      const clampedTop = Math.max(0, Math.min(maxTop, relY));
      setThumbTop(clampedTop);
      setAriaValue(maxTop > 0 ? Math.round((1 - clampedTop / maxTop) * 100) : 50);
    }

    const newY = yFromClientY(clientY, limits);
    cancelAnimationFrame(applyRafRef.current);
    applyRafRef.current = requestAnimationFrame(() => {
      api.setCameraElevation(newY);
    });
  }

  // ── listeners nativos de drag (window) ───────────────────────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      if (e.pointerId !== activePointerRef.current) return;
      e.preventDefault();
      applyFromClientY(e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerRef.current) return;
      draggingRef.current = false;
      activePointerRef.current = null;
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // ── sincroniza thumb com câmera quando não está arrastando ───────
  useEffect(() => {
    if (!api) return;
    let alive = true;

    const sync = () => {
      if (!alive) return;
      if (!draggingRef.current) {
        const limits = api.getCameraElevationLimits();
        if (limits && trackRef.current && thumbRef.current) {
          const top = thumbTopFromY(limits.currentY, limits);
          setThumbTop(top);
          const maxTop = getMaxTop();
          setAriaValue(maxTop > 0 ? Math.round((1 - top / maxTop) * 100) : 50);
        }
      }
      syncRafRef.current = requestAnimationFrame(sync);
    };
    syncRafRef.current = requestAnimationFrame(sync);

    return () => {
      alive = false;
      cancelAnimationFrame(syncRafRef.current);
      cancelAnimationFrame(applyRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // ── handler React só para iniciar drag ───────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!api) return;
    e.preventDefault();
    draggingRef.current = true;
    activePointerRef.current = e.pointerId;
    applyFromClientY(e.clientY);
  };

  return (
    <div
      className="pointer-events-none fixed bottom-28 right-3 z-40 flex flex-col items-center gap-1 sm:right-4"
      aria-hidden="true"
    >
      <span className="select-none text-[9px] font-medium leading-none text-white/60">▲</span>

      <div
        ref={trackRef}
        data-elevation-slider="true"
        className="pointer-events-auto relative touch-none select-none rounded-full border border-border-strong bg-surface/70 backdrop-blur-md"
        style={{ width: 40, height: 148 }}
        onPointerDown={onPointerDown}
        role="slider"
        aria-label="Altura da câmera"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ariaValue}
      >
        {/* trilho */}
        <div
          className="absolute inset-x-0 mx-auto rounded-full bg-white/20"
          style={{ width: 4, top: 8, bottom: 8 }}
        />
        {/* thumb */}
        <div
          ref={thumbRef}
          className="absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-white/50 bg-white/90 shadow-md-dark"
          style={{ width: 28, height: 28, top: 60, touchAction: 'none' }}
        />
      </div>

      <span className="select-none text-[9px] font-medium leading-none text-white/60">▼</span>
    </div>
  );
}
