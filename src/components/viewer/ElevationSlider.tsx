'use client';

import { useEffect, useRef } from 'react';
import type { SplatViewerAPI } from './SplatViewer';

interface ElevationSliderProps {
  api: SplatViewerAPI | null;
}

/**
 * Controle de elevação da câmera — botões ▲ / ▼ com repeat ao segurar.
 *
 * Por que botões em vez de slider drag:
 * - Drag no canvas do Three.js usa pointer events nativos no canvas.
 *   Qualquer elemento React sobreposto que também use pointer events
 *   compete com o sistema de look/joystick e causa lag ou conflito.
 * - Botões com pointerdown/pointerup são eventos discretos, não contínuos.
 *   Não interferem com o RAF do fpsLoop nem com o drag de rotação.
 *
 * Funcionamento:
 * - Toque curto: sobe/desce um passo
 * - Segurar: repeat automático a 60fps via RAF
 * - setCameraElevation atualiza cam.position.y + cachedNav.targetY no closure
 *   do viewer → altura mantida quando o usuário anda com joystick/WASD
 */
export function ElevationSlider({ api }: ElevationSliderProps) {
  const upRafRef = useRef<number>(0);
  const downRafRef = useRef<number>(0);

  // Limpa os loops de repeat ao desmontar ou trocar de api
  useEffect(() => {
    return () => {
      cancelAnimationFrame(upRafRef.current);
      cancelAnimationFrame(downRafRef.current);
    };
  }, [api]);

  function startRepeat(rafRef: React.MutableRefObject<number>, direction: 1 | -1) {
    cancelAnimationFrame(rafRef.current);

    const step = () => {
      if (!api) return;
      const limits = api.getCameraElevationLimits();
      if (!limits) return;
      const STEP = (limits.yMax - limits.yMin) * 0.008; // ~0.8% do range por frame
      api.setCameraElevation(limits.currentY + direction * STEP);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }

  function stopRepeat(rafRef: React.MutableRefObject<number>) {
    cancelAnimationFrame(rafRef.current);
  }

  const btnClass =
    'pointer-events-auto flex h-10 w-10 select-none items-center justify-center ' +
    'rounded-full border border-border-strong bg-surface/70 backdrop-blur-md ' +
    'text-white/80 active:bg-white/20 touch-none cursor-pointer text-lg leading-none';

  return (
    <div className="pointer-events-none fixed bottom-28 right-3 z-40 flex flex-col items-center gap-2 sm:right-4">
      {/* Botão SUBIR */}
      <button
        type="button"
        aria-label="Subir câmera"
        className={btnClass}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          startRepeat(upRafRef, 1);
        }}
        onPointerUp={() => stopRepeat(upRafRef)}
        onPointerCancel={() => stopRepeat(upRafRef)}
        onPointerLeave={() => stopRepeat(upRafRef)}
      >
        ▲
      </button>

      {/* Botão DESCER */}
      <button
        type="button"
        aria-label="Descer câmera"
        className={btnClass}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          startRepeat(downRafRef, -1);
        }}
        onPointerUp={() => stopRepeat(downRafRef)}
        onPointerCancel={() => stopRepeat(downRafRef)}
        onPointerLeave={() => stopRepeat(downRafRef)}
      >
        ▼
      </button>
    </div>
  );
}
