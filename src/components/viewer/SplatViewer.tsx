'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import type { JoystickManager, JoystickOutputData } from 'nipplejs';
import { loadSplatViewer } from '@/lib/splat/viewer-loader';
import { QUALITY_PRESETS, detectInitialQuality, type QualityLevel } from '@/lib/splat/lod';

export type MoveSpeedLevel = 'slow' | 'medium' | 'fast';

export const MOVE_SPEED_VALUES: Record<MoveSpeedLevel, number> = {
  slow: 0.033,
  medium: 0.066,
  fast: 0.11,
};

interface SplatViewerProps {
  splatUrl: string;
  splatUrlLite?: string | null;
  cameraUpInverted?: boolean;
  splatRotationDeg?: number;
  moveSpeedLevel?: MoveSpeedLevel;
  onReady?: (api: SplatViewerAPI) => void;
  onProgress?: (percent: number) => void;
  onError?: (error: Error) => void;
  onLiteReady?: () => void;
  onFullReady?: () => void;
  initialQuality?: QualityLevel;
  pickMode?: boolean;
  onPickWorld?: (point: [number, number, number]) => void;
}

export interface SceneBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface SplatViewerAPI {
  setQuality: (q: QualityLevel) => void;
  resetCamera: () => void;
  getCameraState: () => { position: number[]; target: number[] };
  isMoveInputActive: () => boolean;
  isLookInputActive: () => boolean;
  setCameraState: (state: { position: number[]; target: number[] }) => void;
  takeScreenshot: () => Promise<Blob>;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  destroy: () => void;
  worldToScreen: (x: number, y: number, z: number) => { sx: number; sy: number; visible: boolean } | null;
  getSceneBounds: () => SceneBounds | null;
  getCameraElevationLimits: () => { yMin: number; yMax: number; currentY: number } | null;
  setCameraElevation: (y: number) => void;
  pickWorldAtPointer: (clientX: number, clientY: number) => [number, number, number] | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewerInstance = any;

function pickWorldFromViewer(
  viewer: ViewerInstance,
  clientX: number,
  clientY: number,
  bounds: SceneBounds | null
): [number, number, number] | null {
  const canvas = viewer.renderer?.domElement as HTMLCanvasElement | undefined;
  const camera = viewer.camera;
  if (!canvas || !camera) return null;
  const rect = canvas.getBoundingClientRect();
  const mouse = new Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const mesh =
    viewer.splatMesh ??
    viewer.splatScenes?.[0]?.splatMesh ??
    viewer.splatScenes?.[0];
  if (mesh) {
    const hits = raycaster.intersectObject(mesh as Object3D, true);
    if (hits.length > 0) {
      const pt = hits[0].point;
      return [pt.x, pt.y, pt.z];
    }
  }
  if (bounds) {
    const cy = (bounds.min[1] + bounds.max[1]) / 2;
    const plane = new Plane(new Vector3(0, 1, 0), -cy);
    const target = new Vector3();
    if (raycaster.ray.intersectPlane(plane, target)) {
      return [target.x, target.y, target.z];
    }
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function expandBboxXZ(bounds: SceneBounds, factor: number): SceneBounds {
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const halfX = ((bounds.max[0] - bounds.min[0]) / 2) * factor;
  const halfZ = ((bounds.max[2] - bounds.min[2]) / 2) * factor;
  return {
    min: [cx - halfX, bounds.min[1], cz - halfZ],
    max: [cx + halfX, bounds.max[1], cz + halfZ],
  };
}

// Diagonal mínima plausível para um cômodo real (unidades da cena) — rede de segurança contra bounds prematuros
const MIN_PLAUSIBLE_BOUNDS_DIAGONAL = 2;
// Exclui ~99% da distribuição normal — pontos fantasma além de 2.5σ em cada eixo
const SIGMA_THRESHOLD = 1.5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getSplatMeshFromViewer(viewer: ViewerInstance): ViewerInstance | null {
  return viewer?.splatMesh ?? viewer?.splatScenes?.[0]?.splatMesh ?? viewer?.splatScenes?.[0] ?? null;
}

function readSplatCounts(viewer: ViewerInstance): { built: number; total: number } {
  const mesh = getSplatMeshFromViewer(viewer);
  if (!mesh || typeof mesh.getSplatCount !== 'function') return { built: 0, total: 0 };
  const built = mesh.getSplatCount(false) as number;
  const total = mesh.getSplatCount(true) as number;
  return { built, total };
}

/** Aguarda splatCount estabilizar — progressiveLoad pode resolver antes do buffer estar completo. */
async function waitForStableSplatCount(
  viewer: ViewerInstance,
  intervalMs = 250,
  maxAttempts = 10
): Promise<number> {
  let lastBuilt = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(intervalMs);
    const { built, total } = readSplatCounts(viewer);
    console.log('[Imerso splatCount stabilize]', { attempt, built, total });
    if (built > 0 && built === lastBuilt && built === total) return built;
    lastBuilt = built;
  }
  const { built } = readSplatCounts(viewer);
  return built;
}

async function fitCameraToSplatStable(
  viewer: ViewerInstance,
  cameraUpInverted: boolean
): Promise<ReturnType<typeof fitCameraToSplat>> {
  await waitForStableSplatCount(viewer);
  return fitCameraToSplat(viewer, cameraUpInverted);
}

function boundsDiagonalXZ(bounds: SceneBounds): number {
  const sizeX = bounds.max[0] - bounds.min[0];
  const sizeZ = bounds.max[2] - bounds.min[2];
  return Math.sqrt(sizeX * sizeX + sizeZ * sizeZ);
}

function fitCameraToSplat(
  viewer: ViewerInstance,
  cameraUpInverted: boolean
): { position: [number, number, number]; target: [number, number, number]; bounds: SceneBounds } | null {
  console.log('[Imerso fitCameraToSplat] CHAMADA', { hasViewer: !!viewer });
  try {
    const splatMesh =
      viewer?.splatMesh ?? viewer?.splatScenes?.[0]?.splatMesh ?? viewer?.splatScenes?.[0];
    if (!splatMesh) {
      console.log('[Imerso fitCameraToSplat] return null: !splatMesh');
      return null;
    }
    if (typeof splatMesh.getSplatCount !== 'function' || typeof splatMesh.getSplatCenter !== 'function') {
      console.log('[Imerso fitCameraToSplat] return null: getSplatCount/getSplatCenter indisponível');
      return null;
    }
    const splatCount = splatMesh.getSplatCount() as number;
    if (!splatCount) {
      console.log('[Imerso fitCameraToSplat] return null: splatCount === 0', { splatCount });
      return null;
    }
    // Bounds manual — setFromObject retorna vazio porque splats não usam geometria Three.js convencional
    const tempCenter = new Vector3();
    const boundsStart = performance.now();

    // Passe 1 — centróide, desvio padrão e bounds ingênuo (fallback)
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    let sumZ2 = 0;
    let naiveMinX = Infinity;
    let naiveMinY = Infinity;
    let naiveMinZ = Infinity;
    let naiveMaxX = -Infinity;
    let naiveMaxY = -Infinity;
    let naiveMaxZ = -Infinity;
    for (let i = 0; i < splatCount; i++) {
      splatMesh.getSplatCenter(i, tempCenter);
      const x = tempCenter.x;
      const y = tempCenter.y;
      const z = tempCenter.z;
      sumX += x;
      sumY += y;
      sumZ += z;
      sumX2 += x * x;
      sumY2 += y * y;
      sumZ2 += z * z;
      if (x < naiveMinX) naiveMinX = x;
      if (y < naiveMinY) naiveMinY = y;
      if (z < naiveMinZ) naiveMinZ = z;
      if (x > naiveMaxX) naiveMaxX = x;
      if (y > naiveMaxY) naiveMaxY = y;
      if (z > naiveMaxZ) naiveMaxZ = z;
    }
    const cx = sumX / splatCount;
    const cy = sumY / splatCount;
    const cz = sumZ / splatCount;
    const sigmaX = Math.sqrt(Math.max(0, sumX2 / splatCount - cx * cx));
    const sigmaY = Math.sqrt(Math.max(0, sumY2 / splatCount - cy * cy));
    const sigmaZ = Math.sqrt(Math.max(0, sumZ2 / splatCount - cz * cz));

    // Passe 2 — bounds filtrado (exclui outliers além de SIGMA_THRESHOLD σ)
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let splatsFiltrados = 0;
    for (let i = 0; i < splatCount; i++) {
      splatMesh.getSplatCenter(i, tempCenter);
      const x = tempCenter.x;
      const y = tempCenter.y;
      const z = tempCenter.z;
      if (
        Math.abs(x - cx) <= SIGMA_THRESHOLD * sigmaX &&
        Math.abs(y - cy) <= SIGMA_THRESHOLD * sigmaY &&
        Math.abs(z - cz) <= SIGMA_THRESHOLD * sigmaZ
      ) {
        splatsFiltrados++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
    }
    if (splatsFiltrados === 0) {
      minX = naiveMinX;
      minY = naiveMinY;
      minZ = naiveMinZ;
      maxX = naiveMaxX;
      maxY = naiveMaxY;
      maxZ = naiveMaxZ;
    }

    const boundsMs = performance.now() - boundsStart;
    console.log('[Imerso bounds] tempo de calculo (ms):', boundsMs, 'splatCount:', splatCount);
    const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
    const boundsForDiagonal: SceneBounds = {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };
    const filteredDiagonal = boundsDiagonalXZ(boundsForDiagonal);
    console.log('[Imerso bounds] filtrado', {
      splatCount,
      splatsFiltrados,
      filteredDiagonal,
      sigmaX,
      sigmaY,
      sigmaZ,
    });
    // TODO(founder): diagnóstico speedScale — remover após coleta (sala vs quarto)
    console.log('[Imerso fitCameraToSplat]', {
      boxMin: [minX, minY, minZ],
      boxMax: [maxX, maxY, maxZ],
      size: [size.x, size.y, size.z],
    });
    const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim === 0) {
      console.log('[Imerso fitCameraToSplat] return null: !Number.isFinite(maxDim) || maxDim === 0', {
        maxDim,
      });
      return null;
    }
    const distance = maxDim * 1.2;
    const offsetZ = cameraUpInverted ? -distance : distance;
    const camPos: [number, number, number] = [center.x, center.y, center.z + offsetZ];
    const tgt: [number, number, number] = [center.x, center.y, center.z];
    if (viewer.camera) {
      viewer.camera.position.set(...camPos);
      viewer.camera.lookAt(center);
      viewer.camera.updateProjectionMatrix?.();
    }
    const bounds: SceneBounds = {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };
    const diagonal = boundsDiagonalXZ(bounds);
    if (diagonal < MIN_PLAUSIBLE_BOUNDS_DIAGONAL) {
      console.log('[Imerso fitCameraToSplat] return null: diagonal prematura/inválida', {
        diagonal,
        splatCount,
      });
      return null;
    }
    return { position: camPos, target: tgt, bounds };
  } catch (e) {
    console.error('[Imerso fitCameraToSplat] EXCEPTION', e);
    return null;
  }
}

function navFromBounds(bounds: SceneBounds | null, fallbackY: number) {
  console.log('[Imerso navFromBounds] CHAMADA', { hasBounds: !!bounds, fallbackY });
  if (!bounds) {
    return { expandedBounds: null as SceneBounds | null, targetY: fallbackY, speedScale: 1.0 };
  }
  const expandedBounds = expandBboxXZ(bounds, 1.1);
  const targetY = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.4;
  const sizeX = bounds.max[0] - bounds.min[0];
  const sizeZ = bounds.max[2] - bounds.min[2];
  const diagonal = Math.sqrt(sizeX * sizeX + sizeZ * sizeZ);
  // Referência: cena com diagonal ~10 unidades = speedScale 1.0
  const speedScale = Math.max(0.25, Math.min(4.0, diagonal / 10.0));
  // TODO(founder): diagnóstico speedScale — remover após coleta (sala vs quarto)
  console.log('[Imerso navFromBounds]', {
    boundsMin: bounds.min,
    boundsMax: bounds.max,
    sizeX,
    sizeZ,
    diagonal,
    speedScale,
  });
  return { expandedBounds, targetY, speedScale };
}

function elevationYRange(bounds: SceneBounds | null, fallbackY: number) {
  if (!bounds) return { yMin: fallbackY - 2, yMax: fallbackY + 6 };
  const span = bounds.max[1] - bounds.min[1];
  return { yMin: bounds.min[1] + span * 0.25, yMax: bounds.max[1] + span * 0.5 };
}

export function SplatViewer({
  splatUrl, splatUrlLite, cameraUpInverted = true, splatRotationDeg = 0,
  moveSpeedLevel = 'medium', onReady, onProgress, onError,
  onLiteReady, onFullReady, initialQuality, pickMode = false, onPickWorld,
}: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerInstance>(null);
  const boundsRef = useRef<SceneBounds | null>(null);
  const fpsCleanupRef = useRef<(() => void) | null>(null);
  const pickModeRef = useRef(pickMode);
  const moveSpeedRef = useRef<number>(MOVE_SPEED_VALUES[moveSpeedLevel]);
  const [loading, setLoading] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const callbacksRef = useRef({ onReady, onProgress, onError, onLiteReady, onFullReady });
  useEffect(() => {
    callbacksRef.current = { onReady, onProgress, onError, onLiteReady, onFullReady };
  }, [onReady, onProgress, onError, onLiteReady, onFullReady]);
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);
  useEffect(() => { moveSpeedRef.current = MOVE_SPEED_VALUES[moveSpeedLevel]; }, [moveSpeedLevel]);
  const homeStateRef = useRef<{ position: [number, number, number]; target: [number, number, number] } | null>(null);
  const pickHandlerRef = useRef(onPickWorld);
  useEffect(() => { pickHandlerRef.current = onPickWorld; }, [onPickWorld]);

  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;
    let fitRetryTimer: number | null = null;
    void (async () => {
      try {
        const { Viewer, RenderMode } = await loadSplatViewer();
        const quality = initialQuality ?? detectInitialQuality();
        const preset = QUALITY_PRESETS[quality];
        const isCoarsePointer =
          typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
        const isTablet =
          isCoarsePointer && window.matchMedia('(min-width: 768px)').matches;
        let viewer: ViewerInstance = new Viewer({
          rootElement: containerRef.current!,
          cameraUp: cameraUpInverted ? [0, -1, 0] : [0, 1, 0],
          initialCameraPosition: [0, 0, cameraUpInverted ? -5 : 5],
          initialCameraLookAt: [0, 0, 0],
          sphericalHarmonicsDegree: preset.sphericalHarmonicsDegree,
          antialiased: isCoarsePointer ? false : preset.antialiased,
          renderMode: RenderMode.Always,
          gpuAcceleratedSort: false,
          enableSIMDInSort: false,
          useBuiltInControls: false,
        });
        viewerRef.current = viewer;
        const liteTrimmed = splatUrlLite?.trim() ?? '';
        const LITE_TIMEOUT_MS = 5000;
        let liteLoadedOk = false;
        if (liteTrimmed) {
          try {
            await Promise.race([
              viewer.addSplatScene(liteTrimmed, {
                progressiveLoad: true, showLoadingUI: false,
                onProgress: (percent: number) => {
                  callbacksRef.current.onProgress?.(percent);
                  if (percent >= 99) callbacksRef.current.onProgress?.(100);
                },
              }),
              new Promise<never>((_, rej) => {
                window.setTimeout(() => rej(new Error('LITE_TIMEOUT')), LITE_TIMEOUT_MS);
              }),
            ]);
            if (!mounted) return;
            liteLoadedOk = true;
          } catch {
            callbacksRef.current.onError?.(new Error('LITE_TIMEOUT'));
            try { await viewer.dispose?.(); } catch { /* ignore */ }
            if (!mounted) return;
            viewer = new Viewer({
              rootElement: containerRef.current!,
              cameraUp: cameraUpInverted ? [0, -1, 0] : [0, 1, 0],
              initialCameraPosition: [0, 0, cameraUpInverted ? -5 : 5],
              initialCameraLookAt: [0, 0, 0],
              sphericalHarmonicsDegree: preset.sphericalHarmonicsDegree,
              antialiased: isCoarsePointer ? false : preset.antialiased,
              renderMode: RenderMode.Always,
              gpuAcceleratedSort: false,
              enableSIMDInSort: false,
              useBuiltInControls: false,
            });
            viewerRef.current = viewer;
          }
        }
        if (!liteLoadedOk) {
          await viewer.addSplatScene(splatUrl, {
            progressiveLoad: true, showLoadingUI: false,
            onProgress: (percent: number) => {
              callbacksRef.current.onProgress?.(percent);
              if (percent >= 99) callbacksRef.current.onProgress?.(100);
            },
          });
          if (!mounted) return;
        }
        if (viewer.renderer) {
          const dpr = isCoarsePointer
            ? Math.min(preset.pixelRatio, 1.5)
            : preset.pixelRatio;
          viewer.renderer.setPixelRatio(dpr);
        }
        let cachedNav: ReturnType<typeof navFromBounds>;
        let fitted = await fitCameraToSplatStable(viewer, cameraUpInverted);

        if (!fitted) {
          await new Promise<void>((resolve) => {
            let attempts = 0;
            const retry = () => {
              void fitCameraToSplatStable(viewer, cameraUpInverted).then((result) => {
                fitted = result;
                if (fitted || ++attempts >= 20 || !mounted) {
                  resolve();
                } else {
                  window.setTimeout(retry, 150);
                }
              });
            };
            window.setTimeout(retry, 150);
          });
        }

        if (fitted) {
          homeStateRef.current = { position: fitted.position, target: fitted.target };
          boundsRef.current = fitted.bounds;
          cachedNav = navFromBounds(fitted.bounds, (viewer.camera as PerspectiveCamera).position.y);
        } else {
          cachedNav = navFromBounds(boundsRef.current, (viewer.camera as PerspectiveCamera).position.y);
        }

        viewer.start();
        callbacksRef.current.onProgress?.(100);
        setLoading(false);
        setViewerReady(true);

        const cam = viewer.camera as PerspectiveCamera;

        const PITCH_LIMIT = Math.PI / 2.2;
        const LOOK_SPEED = isCoarsePointer ? 0.0025 : 0.003;
        let yaw = 0, pitch = 0, lastYaw = -1, lastPitch = -1;

        const b0 = boundsRef.current;
        const nav0 = navFromBounds(b0, cam.position.y);

        if (b0) {
          cam.position.set((b0.min[0]+b0.max[0])/2, nav0.targetY, (b0.min[2]+b0.max[2])/2);
          yaw = (-splatRotationDeg * Math.PI) / 180;
        } else {
          cam.position.y = nav0.targetY;
          yaw = (-splatRotationDeg * Math.PI) / 180;
        }
        cam.updateMatrixWorld(true);
        cachedNav = navFromBounds(boundsRef.current, cam.position.y);
        const initElevationRange = elevationYRange(boundsRef.current, cam.position.y);
        let cachedYMin = initElevationRange.yMin;
        let cachedYMax = initElevationRange.yMax;

        let fitRetryInFlight = false;
        const applySceneFit = async (): Promise<boolean> => {
          if (fitRetryInFlight) return false;
          fitRetryInFlight = true;
          try {
            const fittedNow = await fitCameraToSplatStable(viewer, cameraUpInverted);
            if (!fittedNow) return false;
            homeStateRef.current = { position: fittedNow.position, target: fittedNow.target };
            boundsRef.current = fittedNow.bounds;
            const navFit = navFromBounds(fittedNow.bounds, cam.position.y);
            cachedNav = navFit;
            cam.position.set(
              (fittedNow.bounds.min[0] + fittedNow.bounds.max[0]) / 2,
              navFit.targetY,
              (fittedNow.bounds.min[2] + fittedNow.bounds.max[2]) / 2
            );
            yaw = (-splatRotationDeg * Math.PI) / 180;
            pitch = 0;
            lastYaw = -1;
            lastPitch = -1;
            const elevRange = elevationYRange(fittedNow.bounds, cam.position.y);
            cachedYMin = elevRange.yMin;
            cachedYMax = elevRange.yMax;
            cam.updateMatrixWorld(true);
            return true;
          } finally {
            fitRetryInFlight = false;
          }
        };

        if (!boundsRef.current) {
          let fitAttempts = 0;
          fitRetryTimer = window.setInterval(() => {
            void applySceneFit().then((ok) => {
              if (ok || ++fitAttempts >= 30) {
                if (fitRetryTimer !== null) window.clearInterval(fitRetryTimer);
                fitRetryTimer = null;
              }
            });
          }, 300);
        }

        const moveInput = { x: 0, z: 0 };
        const keysHeld = new Set<string>();
        let lastPointer: { x: number; y: number; id: number } | null = null;

        const joystickZone = document.createElement('div');
        joystickZone.className = 'splat-joystick-zone';
        joystickZone.setAttribute('aria-hidden', 'true');
        joystickZone.style.cssText = `
          position: absolute; left: 0; top: 0; bottom: 0; width: ${isTablet ? '35%' : '50%'};
          z-index: 30;
          pointer-events: ${isCoarsePointer ? 'auto' : 'none'};
          touch-action: none;
        `;
        if (containerRef.current && !containerRef.current.contains(joystickZone)) {
          containerRef.current.appendChild(joystickZone);
        }

        let zoomDelta = 0;
        const pinchActivePointers = new Map<number, { x: number; y: number }>();
        let pinchLastDistance: number | null = null;

        let joystickManager: JoystickManager | null = null;
        if (isCoarsePointer) {
          const { default: nipplejs } = await import('nipplejs');
          joystickManager = nipplejs.create({
            zone: joystickZone, mode: 'dynamic', color: 'white', size: 100, fadeTime: 200,
          });
          joystickManager.on('move', (_evt, data: JoystickOutputData) => {
            if (!data.vector) return;
            moveInput.x = data.vector.x;
            moveInput.z = -data.vector.y;
          });
          joystickManager.on('end', () => { moveInput.x = 0; moveInput.z = 0; });
        }

        const canvasEl = viewer.renderer?.domElement as HTMLCanvasElement | undefined;

        const onPointerDown = (e: PointerEvent) => {
          if (pickModeRef.current) return;
          if (!isCoarsePointer && e.button !== 0) return;
          if (isCoarsePointer && canvasEl) {
            const rect = canvasEl.getBoundingClientRect();
            if (e.clientX - rect.left < rect.width * 0.5) return;
          }
          if (lastPointer !== null) return;
          lastPointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
          try { canvasEl?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        };
        const onPointerMove = (e: PointerEvent) => {
          if (!lastPointer || lastPointer.id !== e.pointerId) return;
          if (pickModeRef.current) return;
          const dx = e.clientX - lastPointer.x;
          const dy = e.clientY - lastPointer.y;
          yaw -= dx * LOOK_SPEED;
          pitch -= dy * LOOK_SPEED;
          pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
          lastPointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
        };
        const onPointerUp = (e: PointerEvent) => {
          if (lastPointer?.id !== e.pointerId) return;
          lastPointer = null;
          try { canvasEl?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        };

        const ZOOM_SCROLL_SPEED = 0.08;
        const onWheel = (e: WheelEvent) => {
          if (pickModeRef.current) return;
          if (e.shiftKey) return;
          e.preventDefault();
          let delta = e.deltaY;
          if (e.deltaMode === 1) delta *= 16;
          if (e.deltaMode === 2) delta *= 400;
          zoomDelta += (Math.max(-120, Math.min(120, delta)) / 120) * ZOOM_SCROLL_SPEED;
        };

        const ZOOM_PINCH_SPEED = 0.003;
        function getPinchDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
          return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
        }

        // Pinch só ativa quando AMBOS os dedos estão na metade direita da tela.
        // Joystick (esquerda) + dedo de rotação (direita) NÃO ativa pinch.
        const isRightHalf = (clientX: number): boolean => {
          if (!canvasEl) return true;
          const rect = canvasEl.getBoundingClientRect();
          const threshold = isTablet ? rect.width * 0.35 : rect.width * 0.5;
          return clientX - rect.left >= threshold;
        };

        const onPinchPointerDown = (e: PointerEvent) => {
          if (pickModeRef.current) return;
          if (e.pointerType === 'mouse') return;
          if (!isRightHalf(e.clientX)) return;
          pinchActivePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinchActivePointers.size === 2) {
            const pts = Array.from(pinchActivePointers.values());
            pinchLastDistance = getPinchDistance(pts[0]!, pts[1]!);
          }
        };
        const onPinchPointerMove = (e: PointerEvent) => {
          if (pickModeRef.current) return;
          if (!pinchActivePointers.has(e.pointerId)) return;
          pinchActivePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinchActivePointers.size === 2 && pinchLastDistance !== null) {
            const pts = Array.from(pinchActivePointers.values());
            const currentDistance = getPinchDistance(pts[0]!, pts[1]!);
            zoomDelta -= (currentDistance - pinchLastDistance) * ZOOM_PINCH_SPEED;
            pinchLastDistance = currentDistance;
            if (lastPointer !== null) lastPointer = null;
          }
        };
        const onPinchPointerUp = (e: PointerEvent) => {
          pinchActivePointers.delete(e.pointerId);
          if (pinchActivePointers.size < 2) pinchLastDistance = null;
        };

        if (canvasEl) {
          canvasEl.addEventListener('pointerdown', onPointerDown);
          canvasEl.addEventListener('pointermove', onPointerMove);
          canvasEl.addEventListener('pointerup', onPointerUp);
          canvasEl.addEventListener('pointercancel', onPointerUp);
          canvasEl.addEventListener('wheel', onWheel, { passive: false });
        }
        // Pinch no window: isRightHalf() garante que joystick+look não dispara pinch.
        window.addEventListener('pointerdown', onPinchPointerDown);
        window.addEventListener('pointermove', onPinchPointerMove);
        window.addEventListener('pointerup', onPinchPointerUp);
        window.addEventListener('pointercancel', onPinchPointerUp);

        let keyCleanup: (() => void) | null = null;
        if (!isCoarsePointer) {
          const onKeyDown = (e: KeyboardEvent) => { keysHeld.add(e.key.toLowerCase()); };
          const onKeyUp = (e: KeyboardEvent) => { keysHeld.delete(e.key.toLowerCase()); };
          const onBlur = () => { keysHeld.clear(); };
          window.addEventListener('keydown', onKeyDown);
          window.addEventListener('keyup', onKeyUp);
          window.addEventListener('blur', onBlur);
          keyCleanup = () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
          };
        }

        const tmpForward = new Vector3(), tmpRight = new Vector3(), tmpZoomForward = new Vector3();
        const tmpQuat = new Quaternion(), tmpYawQ = new Quaternion();
        const tmpPitchQ = new Quaternion(), tmpBaseQ = new Quaternion(), tmpRightVec = new Vector3();
        const worldUpAxis = new Vector3(0, cameraUpInverted ? -1 : 1, 0);
        if (cameraUpInverted) tmpBaseQ.set(1, 0, 0, 0);

        let rafId = 0;
        // Referência 60fps — moveSpeed foi calibrado para ~16.6ms por frame
        const REFERENCE_DELTA_S = 1 / 60;
        let lastFrameTime = performance.now();

        function fpsLoop() {
          rafId = requestAnimationFrame(fpsLoop);
          if (!mounted || !viewerRef.current) return;

          const now = performance.now();
          // Limita delta para evitar salto após tab em background
          const deltaS = Math.min((now - lastFrameTime) / 1000, 0.1);
          lastFrameTime = now;
          const deltaFactor = deltaS / REFERENCE_DELTA_S;

          if (!isCoarsePointer) {
            let mx = 0, mz = 0;
            if (keysHeld.has('w') || keysHeld.has('arrowup')) mz -= 1;
            if (keysHeld.has('s') || keysHeld.has('arrowdown')) mz += 1;
            if (keysHeld.has('a') || keysHeld.has('arrowleft')) mx -= 1;
            if (keysHeld.has('d') || keysHeld.has('arrowright')) mx += 1;
            const len = Math.hypot(mx, mz);
            if (len > 0) { moveInput.x = mx / len; moveInput.z = mz / len; }
            else { moveInput.x = 0; moveInput.z = 0; }
          }

          if (yaw !== lastYaw || pitch !== lastPitch) {
            lastYaw = yaw; lastPitch = pitch;
            tmpYawQ.setFromAxisAngle(worldUpAxis, yaw);
            tmpQuat.multiplyQuaternions(tmpYawQ, tmpBaseQ);
            tmpRightVec.set(1, 0, 0).applyQuaternion(tmpQuat);
            tmpPitchQ.setFromAxisAngle(tmpRightVec, pitch);
            cam.quaternion.multiplyQuaternions(tmpPitchQ, tmpQuat);
            cam.updateMatrixWorld();
          }

          if (moveInput.x !== 0 || moveInput.z !== 0) {
            tmpForward.set(0, 0, -1).applyQuaternion(cam.quaternion);
            tmpForward.y = 0;
            if (tmpForward.lengthSq() > 0.001) tmpForward.normalize();
            tmpRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
            tmpRight.y = 0;
            if (tmpRight.lengthSq() > 0.001) tmpRight.normalize();
            const { expandedBounds, targetY } = cachedNav;
            const moveSpeed =
              moveSpeedRef.current * (cachedNav.speedScale ?? 1.0) * deltaFactor;
            cam.position.addScaledVector(tmpForward, -moveInput.z * moveSpeed);
            cam.position.addScaledVector(tmpRight, moveInput.x * moveSpeed);
            cam.position.y = targetY;
            if (expandedBounds) {
              cam.position.x = clamp(cam.position.x, expandedBounds.min[0], expandedBounds.max[0]);
              cam.position.z = clamp(cam.position.z, expandedBounds.min[2], expandedBounds.max[2]);
            }
          }

          // zoomDelta acumula eventos wheel/pinch entre frames — independente de FPS, sem deltaFactor
          if (zoomDelta !== 0) {
            const { expandedBounds } = cachedNav;
            tmpZoomForward.set(0, 0, -1).applyQuaternion(cam.quaternion);
            tmpZoomForward.y = 0;
            if (tmpZoomForward.lengthSq() > 0.001) tmpZoomForward.normalize();
            const ZOOM_ARC_RATIO = 0.6;
            cam.position.addScaledVector(tmpZoomForward, zoomDelta);
            cam.position.y += zoomDelta * ZOOM_ARC_RATIO * (cameraUpInverted ? -1 : 1);
            cam.position.y = clamp(cam.position.y, cachedYMin, cachedYMax);
            if (expandedBounds) {
              cam.position.x = clamp(cam.position.x, expandedBounds.min[0], expandedBounds.max[0]);
              cam.position.z = clamp(cam.position.z, expandedBounds.min[2], expandedBounds.max[2]);
            }
            cachedNav.targetY = cam.position.y;
            zoomDelta = 0;
          }
        }
        rafId = requestAnimationFrame(fpsLoop);

        const fpsCleanup = () => {
          if (fitRetryTimer !== null) window.clearInterval(fitRetryTimer);
          cancelAnimationFrame(rafId);
          keyCleanup?.();
          if (canvasEl) {
            canvasEl.removeEventListener('pointerdown', onPointerDown);
            canvasEl.removeEventListener('pointermove', onPointerMove);
            canvasEl.removeEventListener('pointerup', onPointerUp);
            canvasEl.removeEventListener('pointercancel', onPointerUp);
            canvasEl.removeEventListener('wheel', onWheel);
          }
          window.removeEventListener('pointerdown', onPinchPointerDown);
          window.removeEventListener('pointermove', onPinchPointerMove);
          window.removeEventListener('pointerup', onPinchPointerUp);
          window.removeEventListener('pointercancel', onPinchPointerUp);
          joystickManager?.destroy();
          if (joystickZone.parentNode) joystickZone.remove();
        };
        fpsCleanupRef.current = fpsCleanup;

        const api: SplatViewerAPI = {
          setQuality: (q) => { viewer.renderer?.setPixelRatio(QUALITY_PRESETS[q].pixelRatio); },
          resetCamera: () => {
            const br = boundsRef.current;
            const { targetY: ty } = navFromBounds(br, cam.position.y);
            if (br) cam.position.set((br.min[0]+br.max[0])/2, ty, (br.min[2]+br.max[2])/2);
            else cam.position.set(0, ty, 0);
            yaw = 0; pitch = 0;
          },
          getCameraState: () => {
            const pos = cam.position;
            const fwd = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
            const tgt = new Vector3().addVectors(pos, fwd);
            return { position: pos.toArray(), target: [tgt.x, tgt.y, tgt.z] };
          },
          isMoveInputActive: () => moveInput.x !== 0 || moveInput.z !== 0,
          isLookInputActive: () => lastPointer !== null,
          setCameraState: (state) => {
            const { expandedBounds: ex } = navFromBounds(boundsRef.current, cam.position.y);
            cam.position.fromArray(state.position);
            if (boundsRef.current) {
              cam.position.y = clamp(cam.position.y, cachedYMin, cachedYMax);
            }
            cachedNav.targetY = cam.position.y;
            if (ex) {
              cam.position.x = clamp(cam.position.x, ex.min[0], ex.max[0]);
              cam.position.z = clamp(cam.position.z, ex.min[2], ex.max[2]);
            }
            const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
            const dx = state.target[0]-cx, dy = state.target[1]-cy, dz = state.target[2]-cz;
            yaw = Math.atan2(-dx, cameraUpInverted ? dz : -dz);
            pitch = clamp(Math.atan2(cameraUpInverted ? -dy : dy, Math.sqrt(dx*dx+dz*dz)), -PITCH_LIMIT, PITCH_LIMIT);
          },
          takeScreenshot: async () => {
            const canvas = viewer.renderer?.domElement as HTMLCanvasElement | undefined;
            if (!canvas) throw new Error('No canvas');
            return new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('Screenshot failed'))),
                'image/png'
              );
            });
          },
          enterFullscreen: () => void containerRef.current?.requestFullscreen?.(),
          exitFullscreen: () => void document.exitFullscreen?.(),
          destroy: () => {
            fpsCleanupRef.current?.();
            fpsCleanupRef.current = null;
            void viewer.dispose?.();
            viewerRef.current = null;
          },
          worldToScreen: (wx, wy, wz) => {
            const canvas = viewer.renderer?.domElement as HTMLCanvasElement | undefined;
            if (!canvas) return null;
            const v = new Vector3(wx, wy, wz);
            v.project(cam as Camera);
            const w = canvas.clientWidth, h = canvas.clientHeight;
            return { sx: (v.x*0.5+0.5)*w, sy: (-v.y*0.5+0.5)*h, visible: v.z>-1&&v.z<1 };
          },
          getSceneBounds: () => boundsRef.current,
          getCameraElevationLimits: () => {
            if (!boundsRef.current) return null;
            return { yMin: cachedYMin, yMax: cachedYMax, currentY: cam.position.y };
          },
          setCameraElevation: (y) => {
            const newY = clamp(y, cachedYMin, cachedYMax);
            cam.position.y = newY;
            cachedNav.targetY = newY;
          },
          pickWorldAtPointer: (cx, cy) => pickWorldFromViewer(viewer, cx, cy, boundsRef.current),
        };

        callbacksRef.current.onReady?.(api);

        if (liteLoadedOk) {
          callbacksRef.current.onLiteReady?.();
          void (async () => {
            const v = viewerRef.current;
            if (!v || !mounted) return;
            try {
              // Remove lite antes do full: evita coexistência (sort dobrado) e permite
              // progressiveLoad — a lib ignora progressiveLoad quando já há cena ativa.
              if (fitRetryTimer !== null) {
                window.clearInterval(fitRetryTimer);
                fitRetryTimer = null;
              }
              if (typeof v.removeSplatScene === 'function') {
                await v.removeSplatScene(0, false);
              }
              if (!mounted) return;
              await v.addSplatScene(splatUrl, {
                progressiveLoad: true,
                showLoadingUI: false,
                onProgress: (pct: number) => {
                  callbacksRef.current.onProgress?.(Math.min(100, Math.round(55 + (pct * 45) / 100)));
                  if (pct >= 99) callbacksRef.current.onProgress?.(100);
                },
              });
              if (!mounted) return;
              const posLoadCounts = readSplatCounts(v);
              console.log('[Imerso splatCount pos-load]', posLoadCounts);
              let fitted2 = await fitCameraToSplatStable(v, cameraUpInverted);
              if (!fitted2) {
                for (let attempt = 0; attempt < 10 && !fitted2 && mounted; attempt++) {
                  await sleep(250);
                  fitted2 = await fitCameraToSplatStable(v, cameraUpInverted);
                }
              }
              if (fitted2) {
                boundsRef.current = fitted2.bounds;
                homeStateRef.current = { position: fitted2.position, target: fitted2.target };
                cachedNav = navFromBounds(fitted2.bounds, cam.position.y);
                const newRange = elevationYRange(fitted2.bounds, cam.position.y);
                cachedYMin = newRange.yMin;
                cachedYMax = newRange.yMax;
              }
              callbacksRef.current.onFullReady?.();
            } catch (e) {
              callbacksRef.current.onError?.(e instanceof Error ? e : new Error(String(e)));
              callbacksRef.current.onFullReady?.();
            }
          })();
        } else {
          callbacksRef.current.onFullReady?.();
        }
      } catch (err) {
        callbacksRef.current.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      mounted = false;
      setViewerReady(false);
      if (fitRetryTimer !== null) window.clearInterval(fitRetryTimer);
      fpsCleanupRef.current?.();
      fpsCleanupRef.current = null;
      const v = viewerRef.current;
      viewerRef.current = null;
      if (v) void v.dispose?.();
    };
  }, [splatUrl, splatUrlLite, cameraUpInverted, splatRotationDeg, initialQuality]);

  useEffect(() => {
    if (!pickMode || !viewerReady) return;
    const viewer = viewerRef.current;
    const canvas = viewer?.renderer?.domElement as HTMLCanvasElement | undefined;
    if (!canvas || !pickHandlerRef.current) return;
    const handler = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const p = pickWorldFromViewer(viewer, e.clientX, e.clientY, boundsRef.current);
      if (p) pickHandlerRef.current?.(p);
    };
    canvas.addEventListener('pointerdown', handler);
    return () => canvas.removeEventListener('pointerdown', handler);
  }, [pickMode, viewerReady]);

  return (
    <div className="relative h-full min-h-[50dvh] w-full md:min-h-dvh">
      <div ref={containerRef} className="relative h-full w-full touch-none" />
      {loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="text-text-secondary">…</div>
        </div>
      ) : null}
    </div>
  );
}
