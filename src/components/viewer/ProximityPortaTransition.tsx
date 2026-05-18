'use client';

import { useEffect, useRef, useState } from 'react';
import type { SplatViewerAPI } from './SplatViewer';
import type { PublicTourPayload } from '@/types/public-tour';

/** Cooldown em ms após mount antes de ativar a detecção. */
const ACTIVATION_DELAY_MS = 3000;

/** Intervalo de polling da posição da câmera em ms. */
const POLL_INTERVAL_MS = 150;

/** Duração do fade-out antes de navegar (ms). */
const FADE_DURATION_MS = 600;

/**
 * Largura máxima do plano da porta em cada lado (unidades da cena).
 * O visitante precisa estar dentro dessa distância lateral ao cruzar.
 * Evita trigger quando passa muito longe do waypoint pelos lados.
 */
const PLANE_HALF_WIDTH = 2.5;

/** Distância mínima que o visitante precisa se afastar do plano antes de poder
 * disparar a transição. Evita trigger imediato quando câmera começa próxima ao plano. */
const MOVED_AWAY_THRESHOLD = 0.8;

interface ProximityPortaTransitionProps {
  api: SplatViewerAPI | null;
  waypoints: PublicTourPayload['waypoints'];
  /** Tour atual (origem da transição) — passado como ?from= na URL de destino */
  currentTourId: string;
  /** Sinaliza que o viewer terminou de inicializar e a câmera está na posição correta.
   * O timer de ativação só começa após viewerReady = true. */
  viewerReady: boolean;
}

/** Normaliza um vetor 3D. Retorna null se magnitude zero. */
function normalize(x: number, y: number, z: number): [number, number, number] | null {
  const mag = Math.sqrt(x * x + y * y + z * z);
  if (mag < 0.0001) return null;
  return [x / mag, y / mag, z / mag];
}

/** Produto escalar de dois vetores 3D. */
function dot(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): number {
  return ax * bx + ay * by + az * bz;
}

/** Distância de um ponto a um plano definido por ponto + normal. */
function distToPlane(
  px: number, py: number, pz: number,   // ponto a testar
  ox: number, oy: number, oz: number,   // origem do plano (waypoint position)
  nx: number, ny: number, nz: number    // normal do plano (normalizada)
): number {
  return dot(px - ox, py - oy, pz - oz, nx, ny, nz);
}

/**
 * Distância lateral ao eixo do plano (quanto o visitante está deslocado
 * horizontalmente em relação ao centro da porta, ignorando o eixo normal).
 * Usada para limitar a largura do trigger.
 */
function lateralDist(
  px: number, pz: number,   // posição XZ da câmera (ignora Y — altura livre)
  ox: number, oz: number,   // origem XZ do waypoint
  nx: number, nz: number    // normal XZ (normalizada)
): number {
  // Componente perpendicular à normal no plano XZ
  const dx = px - ox;
  const dz = pz - oz;
  const proj = dx * nx + dz * nz;
  const perpX = dx - proj * nx;
  const perpZ = dz - proj * nz;
  return Math.sqrt(perpX * perpX + perpZ * perpZ);
}

export function ProximityPortaTransition({ api, waypoints, currentTourId, viewerReady }: ProximityPortaTransitionProps) {
  const [fading, setFading] = useState(false);
  const triggeredRef = useRef(false);
  const activeRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Filtra apenas waypoints de porta com href válido
  const portaWaypoints = waypoints.filter((w) => w.next_tour_href && w.next_tour_id);

  useEffect(() => {
    if (!fading) return;
    const frame = requestAnimationFrame(() => {
      overlayRef.current?.classList.add('opacity-100');
    });
    return () => cancelAnimationFrame(frame);
  }, [fading]);

  useEffect(() => {
    if (!api || portaWaypoints.length === 0 || !viewerReady) return;

    triggeredRef.current = false;
    activeRef.current = false;

    const initialSides: Map<string, number> = new Map();
    const hasMovedAwayMap: Map<string, boolean> = new Map();

    const activationTimer = window.setTimeout(() => {
      const { position } = api.getCameraState();
      const [cx, cy, cz] = position;

      for (const wp of portaWaypoints) {
        const ndx = wp.target_x - wp.position_x;
        const ndy = wp.target_y - wp.position_y;
        const ndz = wp.target_z - wp.position_z;
        const n = normalize(ndx, ndy, ndz);
        if (!n) continue;

        const side = distToPlane(cx, cy, cz, wp.position_x, wp.position_y, wp.position_z, n[0], n[1], n[2]);
        initialSides.set(wp.id, side >= 0 ? 1 : -1);

        const absDist = Math.abs(side);
        hasMovedAwayMap.set(wp.id, absDist > MOVED_AWAY_THRESHOLD);
      }

      activeRef.current = true;
    }, ACTIVATION_DELAY_MS);

    const interval = window.setInterval(() => {
      if (!activeRef.current || triggeredRef.current) return;

      const { position } = api.getCameraState();
      const [cx, cy, cz] = position;

      for (const wp of portaWaypoints) {
        const ndx = wp.target_x - wp.position_x;
        const ndy = wp.target_y - wp.position_y;
        const ndz = wp.target_z - wp.position_z;
        const n = normalize(ndx, ndy, ndz);
        if (!n) continue;

        const currentSide = distToPlane(
          cx, cy, cz,
          wp.position_x, wp.position_y, wp.position_z,
          n[0], n[1], n[2]
        );
        const currentSign = currentSide >= 0 ? 1 : -1;
        const initialSign = initialSides.get(wp.id);

        if (initialSign === undefined) continue;

        if (!hasMovedAwayMap.get(wp.id) && Math.abs(currentSide) > MOVED_AWAY_THRESHOLD) {
          hasMovedAwayMap.set(wp.id, true);
        }

        if (currentSign === initialSign) continue;

        if (!hasMovedAwayMap.get(wp.id)) {
          initialSides.set(wp.id, currentSign);
          continue;
        }

        const lat = lateralDist(cx, cz, wp.position_x, wp.position_z, n[0], n[2]);
        if (lat > PLANE_HALF_WIDTH) {
          initialSides.set(wp.id, currentSign);
          continue;
        }

        triggeredRef.current = true;
        setFading(true);
        const href = `${wp.next_tour_href!}?from=${encodeURIComponent(currentTourId)}`;
        window.setTimeout(() => {
          window.location.href = href;
        }, FADE_DURATION_MS);
        break;
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(activationTimer);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, portaWaypoints.length, viewerReady]);

  if (!fading) return null;

  return (
    <div
      ref={overlayRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9998] bg-black opacity-0"
      style={{ transition: `opacity ${FADE_DURATION_MS}ms ease-in` }}
    />
  );
}
