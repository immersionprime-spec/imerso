'use client';

import { useEffect, useRef } from 'react';
import type { SplatViewerAPI } from './SplatViewer';

interface ElevationSliderProps {
  api: SplatViewerAPI | null;
}

/**
 * Botões ▲▼ de elevação da câmera — touch e desktop.
 *
 * Por que os botões não funcionavam antes:
 * O div wrapper do SplatViewer tem `touch-action: none` via Tailwind.
 * Em iOS/Android, isso faz o browser cancelar (pointercancel) todos os
 * eventos de toque em elementos filhos/sobrepostos herdando esse contexto.
 * Os botões recebiam pointerdown seguido de pointercancel imediato.
 *
 * Solução: os botões ficam em `position: fixed` fora do fluxo do canvas,
 * com `touch-action: none` explícito diretamente neles (não herdado),
 * e usam `setPointerCapture` para garantir que o browser não cancele o toque.
 *
 * Por que pinch não funcionava:
 * O onPinchPointerDown estava registrado apenas no canvasEl. Em tablet,
 * o primeiro dedo cai no joystick (div separada, metade esquerda) e o
 * segundo no canvas — o canvas só via 1 dedo, nunca ativava o pinch.
 * Corrigido no SplatViewer: pinch registrado no window.
 */
export function ElevationSlider({ api }: ElevationSliderProps) {
  const upRafRef = useRef<number>(0);
  const downRafRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(upRafRef.current);
      cancelAnimationFrame(downRafRef.current);
    };
  }, []);

  function startRepeat(rafRef: React.MutableRefObject<number>, direction: 1 | -1) {
    cancelAnimationFrame(rafRef.current);
    const step = () => {
      if (!api) return;
      const limits = api.getCameraElevationLimits();
      if (!limits) return;
      const STEP = (limits.yMax - limits.yMin) * 0.012;
      api.setCameraElevation(limits.currentY + direction * STEP);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  function stopRepeat(rafRef: React.MutableRefObject<number>) {
    cancelAnimationFrame(rafRef.current);
  }

  return (
    <div
      className="pointer-events-none fixed bottom-28 right-3 z-50 flex flex-col items-center gap-2 sm:right-4 md:bottom-36"
    >
      <button
        type="button"
        aria-label="Subir câmera"
        className="pointer-events-auto flex h-11 w-11 select-none items-center justify-center rounded-full border border-border-strong bg-surface/80 text-base text-white/80 backdrop-blur-md active:bg-white/20"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          startRepeat(upRafRef, 1);
        }}
        onPointerUp={() => stopRepeat(upRafRef)}
        onPointerCancel={() => stopRepeat(upRafRef)}
        onPointerLeave={() => stopRepeat(upRafRef)}
      >
        ▲
      </button>

      <button
        type="button"
        aria-label="Descer câmera"
        className="pointer-events-auto flex h-11 w-11 select-none items-center justify-center rounded-full border border-border-strong bg-surface/80 text-base text-white/80 backdrop-blur-md active:bg-white/20"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          e.preventDefault();
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
