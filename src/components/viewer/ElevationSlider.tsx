'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SplatViewerAPI, SceneBounds } from './SplatViewer';

interface ElevationSliderProps {
  api: SplatViewerAPI | null;
}

/**
 * Slider vertical de altura da câmera — visível apenas em dispositivos touch.
 *
 * Design: barra vertical fina na borda direita da tela (acima do botão WhatsApp),
 * com thumb arrastável. Arrastar para cima sobe a câmera; para baixo desce.
 * Não conflita com joystick (esquerda) nem com drag de rotação (qualquer área).
 *
 * Funcionamento interno:
 * - Lê os limites verticais do bbox via api.getSceneBounds()
 * - A cada frame de drag, calcula o novo Y proporcional à posição do thumb
 * - Chama setCameraState movendo apenas Y, mantendo X/Z e direção do olhar
 * - Atualiza o thumb para refletir a posição real da câmera (bidirecional)
 */
export function ElevationSlider({ api }: ElevationSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef<number>(0);
  const [visible, setVisible] = useState(false);

  // Detecta touch apenas no cliente
  useEffect(() => {
    setVisible(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // Sincroniza o thumb com a posição real da câmera (polling leve a 10fps)
  useEffect(() => {
    if (!visible || !api) return;
    let alive = true;
    let last = -1;

    function sync() {
      if (!alive || !api) return;
      if (!isDraggingRef.current) {
        const bounds = api.getSceneBounds();
        const state = api.getCameraState();
        if (bounds && state && trackRef.current && thumbRef.current) {
          const yMin = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.25;
          const yMax = bounds.max[1] + (bounds.max[1] - bounds.min[1]) * 0.5;
          const camY = state.position[1] ?? 0;
          const ratio = Math.max(0, Math.min(1, (camY - yMin) / (yMax - yMin)));
          // ratio 0 = yMin (baixo visual) → thumb no fundo da track
          // ratio 1 = yMax (cima visual) → thumb no topo da track
          const trackH = trackRef.current.clientHeight;
          const thumbH = thumbRef.current.clientHeight;
          const maxTop = trackH - thumbH;
          // Inverter: alto Y (longe) = thumb no topo = top pequeno
          const topPx = maxTop * (1 - ratio);
          if (Math.abs(topPx - last) > 0.5) {
            thumbRef.current.style.top = `${topPx}px`;
            last = topPx;
          }
        }
      }
      window.setTimeout(sync, 100);
    }
    sync();
    return () => { alive = false; };
  }, [visible, api]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!api || !trackRef.current || !thumbRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
  }, [api]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !api || !trackRef.current || !thumbRef.current) return;

    const track = trackRef.current;
    const thumb = thumbRef.current;
    const rect = track.getBoundingClientRect();
    const thumbH = thumb.clientHeight;
    const trackH = rect.height;
    const maxTop = trackH - thumbH;

    // Posição relativa do dedo dentro da track (0 = topo, trackH = fundo)
    const relY = e.clientY - rect.top - thumbH / 2;
    const clampedTop = Math.max(0, Math.min(maxTop, relY));
    thumb.style.top = `${clampedTop}px`;

    // ratio: 0 = topo (thumb no topo = câmera alta), 1 = fundo (câmera baixa)
    const ratio = 1 - clampedTop / maxTop;

    // Calcular novo Y com base nos bounds
    const bounds = api.getSceneBounds();
    if (!bounds) return;
    const yMin = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.25;
    const yMax = bounds.max[1] + (bounds.max[1] - bounds.min[1]) * 0.5;
    const newY = yMin + ratio * (yMax - yMin);

    // Aplicar via setCameraState — mantém X, Z e direção do olhar
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!api) return;
      const state = api.getCameraState();
      if (!state) return;
      const [px, , pz] = state.position;
      const [tx, ty, tz] = state.target;
      // Move o target proporcionalmente para manter o olhar coerente
      const deltaY = newY - (state.position[1] ?? 0);
      api.setCameraState({
        position: [px ?? 0, newY, pz ?? 0],
        target: [tx ?? 0, (ty ?? 0) + deltaY, tz ?? 0],
      });
    });
  }, [api]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-24 right-3 z-30 flex flex-col items-center gap-1"
      aria-hidden="true"
    >
      {/* Label topo */}
      <span className="text-[9px] font-medium leading-none text-white/60 select-none">▲</span>

      {/* Track */}
      <div
        ref={trackRef}
        className="pointer-events-auto relative flex items-center justify-center"
        style={{ width: 36, height: 140 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Trilho de fundo */}
        <div
          className="absolute inset-x-0 mx-auto rounded-full"
          style={{
            width: 4,
            top: 0,
            bottom: 0,
            background: 'rgba(255,255,255,0.18)',
          }}
        />
        {/* Thumb */}
        <div
          ref={thumbRef}
          className="absolute left-1/2 -translate-x-1/2 rounded-full shadow-md"
          style={{
            width: 28,
            height: 28,
            top: 56, // posição inicial: meio da track
            background: 'rgba(255,255,255,0.85)',
            border: '2px solid rgba(255,255,255,0.5)',
            cursor: 'grab',
            touchAction: 'none',
          }}
        />
      </div>

      {/* Label fundo */}
      <span className="text-[9px] font-medium leading-none text-white/60 select-none">▼</span>
    </div>
  );
}
