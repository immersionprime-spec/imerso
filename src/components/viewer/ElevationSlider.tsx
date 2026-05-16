'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SplatViewerAPI } from './SplatViewer';

interface ElevationSliderProps {
  api: SplatViewerAPI | null;
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    (window.matchMedia('(hover: none)').matches && navigator.maxTouchPoints > 0)
  );
}

/**
 * Slider vertical de altura da câmera — apenas em touch (mobile/tablet).
 *
 * CORREÇÃO APLICADA:
 * O problema original era que e.stopPropagation() em handlers React sintéticos
 * NÃO interrompe listeners nativos adicionados diretamente no canvas do Three.js
 * via canvasEl.addEventListener(). Quando o usuário tocava o slider, o onPointerDown
 * nativo do canvas também disparava, iniciando o drag de rotação simultâneo.
 *
 * Solução: o elemento track recebe data-elevation-slider="true", e o SplatViewer
 * verifica e.target.closest('[data-elevation-slider]') antes de processar o look.
 * Isso quebra o conflito na origem, sem precisar de hacks de z-index ou setCapture
 * no canvas.
 *
 * A lógica de setCameraElevation + cachedNav.targetY no SplatViewer garante que
 * a altura se mantém após o usuário soltar o slider e andar com o joystick.
 */
export function ElevationSlider({ api }: ElevationSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef<number>(0);
  const [visible, setVisible] = useState(false);
  const [ariaValue, setAriaValue] = useState(50);

  useEffect(() => {
    const mqCoarse = window.matchMedia('(pointer: coarse)');
    const mqHover = window.matchMedia('(hover: none)');
    const update = () => setVisible(isTouchDevice());
    update();
    mqCoarse.addEventListener('change', update);
    mqHover.addEventListener('change', update);
    return () => {
      mqCoarse.removeEventListener('change', update);
      mqHover.removeEventListener('change', update);
    };
  }, []);

  const applyThumbTop = useCallback((topPx: number) => {
    if (thumbRef.current) {
      thumbRef.current.style.top = `${topPx}px`;
    }
  }, []);

  const yFromThumbTop = useCallback(
    (clampedTop: number, maxTop: number, limits: { yMin: number; yMax: number }) => {
      const ratio = maxTop > 0 ? 1 - clampedTop / maxTop : 0.5;
      return limits.yMin + ratio * (limits.yMax - limits.yMin);
    },
    []
  );

  const thumbTopFromY = useCallback(
    (camY: number, maxTop: number, limits: { yMin: number; yMax: number }) => {
      const span = limits.yMax - limits.yMin;
      const ratio = span > 0 ? Math.max(0, Math.min(1, (camY - limits.yMin) / span)) : 0.5;
      return maxTop * (1 - ratio);
    },
    []
  );

  const applyElevationFromClientY = useCallback(
    (clientY: number) => {
      if (!api || !trackRef.current || !thumbRef.current) return;
      const limits = api.getCameraElevationLimits();
      if (!limits) return;

      const track = trackRef.current;
      const thumb = thumbRef.current;
      const rect = track.getBoundingClientRect();
      const thumbH = thumb.clientHeight;
      const trackH = rect.height;
      const maxTop = Math.max(0, trackH - thumbH);

      const relY = clientY - rect.top - thumbH / 2;
      const clampedTop = Math.max(0, Math.min(maxTop, relY));
      applyThumbTop(clampedTop);

      const newY = yFromThumbTop(clampedTop, maxTop, limits);
      setAriaValue(maxTop > 0 ? Math.round((1 - clampedTop / maxTop) * 100) : 50);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // setCameraElevation atualiza cam.position.y E cachedNav.targetY no closure
        // do SplatViewer — a altura persiste quando o usuário anda com o joystick.
        api.setCameraElevation(newY);
      });
    },
    [api, applyThumbTop, yFromThumbTop]
  );

  // Sincroniza thumb com a altura real (quando o usuário não está arrastando).
  // Cobre zoom pinch, waypoints, reset câmera e qualquer mudança externa de Y.
  useEffect(() => {
    if (!visible || !api) return;
    let alive = true;
    let rafId = 0;

    const sync = () => {
      if (!alive || !api) return;
      if (!isDraggingRef.current && trackRef.current && thumbRef.current) {
        const limits = api.getCameraElevationLimits();
        if (limits) {
          const thumbH = thumbRef.current.clientHeight;
          const maxTop = Math.max(0, trackRef.current.clientHeight - thumbH);
          const top = thumbTopFromY(limits.currentY, maxTop, limits);
          applyThumbTop(top);
          setAriaValue(maxTop > 0 ? Math.round((1 - top / maxTop) * 100) : 50);
        }
      }
      rafId = requestAnimationFrame(sync);
    };
    rafId = requestAnimationFrame(sync);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, [visible, api, applyThumbTop, thumbTopFromY]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!api) return;
      e.preventDefault();
      // NÃO chamamos stopPropagation aqui — o SplatViewer já filtra pelo
      // data-elevation-slider. stopPropagation React não para listeners nativos.
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      applyElevationFromClientY(e.clientY);
    },
    [api, applyElevationFromClientY]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      applyElevationFromClientY(e.clientY);
    },
    [applyElevationFromClientY]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-28 right-3 z-40 flex flex-col items-center gap-1 sm:right-4">
      <span className="select-none text-[9px] font-medium leading-none text-white/60">▲</span>
      <div
        ref={trackRef}
        // data-elevation-slider é lido pelo onPointerDown nativo do canvas no SplatViewer
        // para evitar que toques no slider iniciem o drag de rotação da câmera.
        data-elevation-slider="true"
        className="pointer-events-auto relative flex touch-none select-none items-center justify-center rounded-full border border-border-strong bg-surface/70 backdrop-blur-md"
        style={{ width: 40, height: 148 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        aria-label="Altura da câmera"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ariaValue}
      >
        {/* trilho central */}
        <div
          className="absolute inset-x-0 mx-auto rounded-full bg-white/20"
          style={{ width: 4, top: 8, bottom: 8 }}
        />
        {/* thumb */}
        <div
          ref={thumbRef}
          className="absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-white/50 bg-white/90 shadow-md-dark"
          style={{
            width: 28,
            height: 28,
            top: 60,
            touchAction: 'none',
          }}
        />
      </div>
      <span className="select-none text-[9px] font-medium leading-none text-white/60">▼</span>
    </div>
  );
}
