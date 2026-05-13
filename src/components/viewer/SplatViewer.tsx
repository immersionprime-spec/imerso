'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Box3,
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
  /** URL opcional do splat lite (P08); carrega primeiro com timeout 5s. */
  splatUrlLite?: string | null;
  /** true = eixo Y invertido (capturas comuns em GS). false = Y up padrão. Default true. */
  cameraUpInverted?: boolean;
  /** Rotação inicial da cena em graus (eixo Y). 0 = sem rotação. Típico: 0, 90, -90, 180. */
  splatRotationDeg?: number;
  /** Velocidade de movimento WASD. Default: 'medium'. */
  moveSpeedLevel?: MoveSpeedLevel;
  onReady?: (api: SplatViewerAPI) => void;
  onProgress?: (percent: number) => void;
  onError?: (error: Error) => void;
  /** Chamado quando o preview lite está visível e interativo (antes do full em background). */
  onLiteReady?: () => void;
  /** Chamado quando o splat full substituiu o lite (ou tour sem lite terminou de carregar). */
  onFullReady?: () => void;
  initialQuality?: QualityLevel;
  /** Admin hotspot editor: click na cena envia ponto 3D */
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
  setCameraState: (state: { position: number[]; target: number[] }) => void;
  takeScreenshot: () => Promise<Blob>;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  destroy: () => void;
  /** Projetado em coords relativas ao canvas do renderer (0…width/height). */
  worldToScreen: (
    x: number,
    y: number,
    z: number
  ) => { sx: number; sy: number; visible: boolean } | null;
  getSceneBounds: () => SceneBounds | null;
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

/** Clamp simples para valores numéricos. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Expande bbox horizontal em fator dado (1.1 = +10% em cada eixo XZ). */
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

/**
 * Tries to fit the camera to the splat's bounding box.
 */
function fitCameraToSplat(
  viewer: ViewerInstance,
  cameraUpInverted: boolean
): {
  position: [number, number, number];
  target: [number, number, number];
  bounds: SceneBounds;
} | null {
  try {
    const splatMesh =
      viewer?.splatMesh ?? viewer?.splatScenes?.[0]?.splatMesh ?? viewer?.splatScenes?.[0];
    if (!splatMesh) return null;

    const box = new Box3().setFromObject(splatMesh);
    if (box.isEmpty()) return null;

    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim === 0) return null;

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
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    };

    return { position: camPos, target: tgt, bounds };
  } catch {
    return null;
  }
}

/** Deriva alvo de altura, bbox expandido e velocidade a partir do bbox atual (atualiza após swap lite→full). */
function navFromBounds(bounds: SceneBounds | null, fallbackY: number) {
  if (!bounds) {
    return { expandedBounds: null as SceneBounds | null, targetY: fallbackY, moveSpeed: 0.005 };
  }
  const expandedBounds = expandBboxXZ(bounds, 1.1);
  const targetY = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.4;
  // Velocidade fixa de ~2 unidades/segundo a 60fps.
  // Independente do tamanho do bbox — garante sensação consistente de caminhada.
  const moveSpeed = 0.033;
  return { expandedBounds, targetY, moveSpeed };
}

export function SplatViewer({
  splatUrl,
  splatUrlLite,
  cameraUpInverted = true,
  splatRotationDeg = 0,
  moveSpeedLevel = 'medium',
  onReady,
  onProgress,
  onError,
  onLiteReady,
  onFullReady,
  initialQuality,
  pickMode = false,
  onPickWorld,
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

  useEffect(() => {
    pickModeRef.current = pickMode;
  }, [pickMode]);

  useEffect(() => {
    moveSpeedRef.current = MOVE_SPEED_VALUES[moveSpeedLevel];
  }, [moveSpeedLevel]);

  const homeStateRef = useRef<{ position: [number, number, number]; target: [number, number, number] } | null>(
    null
  );

  const pickHandlerRef = useRef(onPickWorld);
  useEffect(() => {
    pickHandlerRef.current = onPickWorld;
  }, [onPickWorld]);

  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    void (async () => {
      try {
        const { Viewer, RenderMode } = await loadSplatViewer();
        const quality = initialQuality ?? detectInitialQuality();
        const preset = QUALITY_PRESETS[quality];

        let viewer: ViewerInstance = new Viewer({
          rootElement: containerRef.current!,
          cameraUp: cameraUpInverted ? [0, -1, 0] : [0, 1, 0],
          initialCameraPosition: [0, 0, cameraUpInverted ? -5 : 5],
          initialCameraLookAt: [0, 0, 0],
          sphericalHarmonicsDegree: preset.sphericalHarmonicsDegree,
          antialiased: preset.antialiased,
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
                progressiveLoad: true,
                showLoadingUI: false,
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
            try {
              await viewer.dispose?.();
            } catch {
              /* ignore */
            }
            if (!mounted) return;
            viewer = new Viewer({
              rootElement: containerRef.current!,
              cameraUp: cameraUpInverted ? [0, -1, 0] : [0, 1, 0],
              initialCameraPosition: [0, 0, cameraUpInverted ? -5 : 5],
              initialCameraLookAt: [0, 0, 0],
              sphericalHarmonicsDegree: preset.sphericalHarmonicsDegree,
              antialiased: preset.antialiased,
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
            progressiveLoad: true,
            showLoadingUI: false,
            onProgress: (percent: number) => {
              callbacksRef.current.onProgress?.(percent);
              if (percent >= 99) callbacksRef.current.onProgress?.(100);
            },
          });
          if (!mounted) return;
        }

        if (viewer.renderer) {
          viewer.renderer.setPixelRatio(preset.pixelRatio);
        }

        let cachedNav: ReturnType<typeof navFromBounds>;
        const fitted = fitCameraToSplat(viewer, cameraUpInverted);
        if (fitted) {
          homeStateRef.current = { position: fitted.position, target: fitted.target };
          boundsRef.current = fitted.bounds;
          cachedNav = navFromBounds(
            fitted.bounds,
            (viewer.camera as PerspectiveCamera).position.y
          );
        } else {
          cachedNav = navFromBounds(
            boundsRef.current,
            (viewer.camera as PerspectiveCamera).position.y
          );
        }

        viewer.start();
        callbacksRef.current.onProgress?.(100);
        setLoading(false);
        setViewerReady(true);

        const cam = viewer.camera as PerspectiveCamera;

        // ========================================
        // SISTEMA DE CONTROLES FPS CUSTOMIZADO
        // ========================================
        // Substitui OrbitControls (desligado via useBuiltInControls: false).
        // Altura fixa tipo "olho humano", clamp XZ no bbox expandido,
        // pitch limitado para não virar de cabeça pra baixo.

        const isCoarsePointer =
          typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

        const PITCH_LIMIT = Math.PI / 2.2;
        const LOOK_SPEED = 0.003;

        let yaw = 0;
        let pitch = 0;
        let lastYaw = yaw - 1;
        let lastPitch = pitch - 1;

        const b0 = boundsRef.current;
        const nav0 = navFromBounds(b0, cam.position.y);
        console.log('[FPS] bbox:', b0, '| moveSpeed:', nav0.moveSpeed, '| targetY:', nav0.targetY, '| cameraUpInverted:', cameraUpInverted);

        // Pose inicial "dentro do splat" — não usa o quaternion vindo de fitCameraToSplat
        // (que posiciona a câmera FORA do splat em modo maquete, inadequado pra FPS).
        //
        // Posiciona a câmera no centro horizontal do bbox, na altura olho humano,
        // e calcula yaw apontando pra um dos eixos curtos do bbox (geralmente o "fundo"
        // do ambiente). Isso garante que o usuário começa vendo a cena, não o vazio.
        if (b0) {
          const centerX = (b0.min[0] + b0.max[0]) / 2;
          const centerZ = (b0.min[2] + b0.max[2]) / 2;
          cam.position.set(centerX, nav0.targetY, centerZ);
          // Olhar pra um dos eixos do bbox. Em cenas com cameraUpInverted (Y invertido
          // visualmente), Math.atan2(0, 1) = 0 → câmera apontando pra +Z, o que costuma
          // estar alinhado com a captura original (operador entrou no ambiente).
          yaw = (-splatRotationDeg * Math.PI) / 180;
          pitch = 0;
        } else {
          // Sem bbox (cena vazia ou erro): aplica só o Y-clamp ao que veio do fitted
          cam.position.y = nav0.targetY;
          yaw = (-splatRotationDeg * Math.PI) / 180;
          pitch = 0;
        }
        cam.updateMatrixWorld(true);

        cachedNav = navFromBounds(boundsRef.current, cam.position.y);

        const moveInput = { x: 0, z: 0 };
        const keysHeld = new Set<string>();
        let lastPointer: { x: number; y: number; id: number } | null = null;

        const joystickZone = document.createElement('div');
        joystickZone.className = 'splat-joystick-zone';
        joystickZone.setAttribute('aria-hidden', 'true');
        joystickZone.style.cssText = `
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 50%;
          z-index: 30;
          pointer-events: ${isCoarsePointer ? 'auto' : 'none'};
          touch-action: none;
        `;
        containerRef.current!.appendChild(joystickZone);

        let joystickManager: JoystickManager | null = null;
        if (isCoarsePointer) {
          const { default: nipplejs } = await import('nipplejs');
          joystickManager = nipplejs.create({
            zone: joystickZone,
            mode: 'dynamic',
            color: 'white',
            size: 100,
            fadeTime: 200,
          });
          joystickManager.on('move', (_evt, data: JoystickOutputData) => {
            if (!data.vector) return;
            moveInput.x = data.vector.x;
            moveInput.z = -data.vector.y;
          });
          joystickManager.on('end', () => {
            moveInput.x = 0;
            moveInput.z = 0;
          });
        }

        const canvasEl = viewer.renderer?.domElement as HTMLCanvasElement | undefined;

        const onPointerDown = (e: PointerEvent) => {
          if (pickModeRef.current) return;
          if (!isCoarsePointer && e.button !== 0) return;
          lastPointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
          try {
            canvasEl?.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
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
          try {
            canvasEl?.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        };

        if (canvasEl) {
          canvasEl.addEventListener('pointerdown', onPointerDown);
          canvasEl.addEventListener('pointermove', onPointerMove);
          canvasEl.addEventListener('pointerup', onPointerUp);
          canvasEl.addEventListener('pointercancel', onPointerUp);
        }

        let keyCleanup: (() => void) | null = null;
        if (!isCoarsePointer) {
          const onKeyDown = (e: KeyboardEvent) => {
            keysHeld.add(e.key.toLowerCase());
          };
          const onKeyUp = (e: KeyboardEvent) => {
            keysHeld.delete(e.key.toLowerCase());
          };
          const onBlur = () => {
            keysHeld.clear();
          };
          window.addEventListener('keydown', onKeyDown);
          window.addEventListener('keyup', onKeyUp);
          window.addEventListener('blur', onBlur);
          keyCleanup = () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
          };
        }

        const tmpForward = new Vector3();
        const tmpRight = new Vector3();
        // Quaternions reutilizáveis (sem alloc por frame)
        const tmpQuat = new Quaternion();    // base * yaw (intermediário)
        const tmpYawQ = new Quaternion();
        const tmpPitchQ = new Quaternion();
        const tmpBaseQ = new Quaternion();   // orientação inicial da cena
        const tmpRightVec = new Vector3();
        // Eixo "cima" do mundo para cálculo do yaw
        const worldUpAxis = new Vector3(0, cameraUpInverted ? -1 : 1, 0);
        // Quaternion base: R_x(180°) para Y-invertido (câmera aponta +Z, up=-Y).
        // Sem isso, yaw=0/pitch=0 gera identidade → câmera aponta -Z → cena fica atrás.
        if (cameraUpInverted) {
          // R_x(π) = Quaternion(x=1, y=0, z=0, w=0)
          tmpBaseQ.set(1, 0, 0, 0);
        }

        // Cache do nav — recalculado só quando o bbox muda (swap lite→full),
        // não por frame. Elimina alocação desnecessária no hot path do loop.
        let rafId = 0;
        function fpsLoop() {
          rafId = requestAnimationFrame(fpsLoop);
          if (!mounted || !viewerRef.current) return;

          if (!isCoarsePointer) {
            let mx = 0;
            let mz = 0;
            if (keysHeld.has('w') || keysHeld.has('arrowup')) mz -= 1;
            if (keysHeld.has('s') || keysHeld.has('arrowdown')) mz += 1;
            if (keysHeld.has('a') || keysHeld.has('arrowleft')) mx -= 1;
            if (keysHeld.has('d') || keysHeld.has('arrowright')) mx += 1;
            const len = Math.hypot(mx, mz);
            if (len > 0) {
              moveInput.x = mx / len;
              moveInput.z = mz / len;
            } else {
              moveInput.x = 0;
              moveInput.z = 0;
            }
          }

          // Reconstrói quaternion apenas quando yaw ou pitch mudaram.
          // Evita 6 operações matriciais por frame quando o usuário só anda sem olhar.
          if (yaw !== lastYaw || pitch !== lastPitch) {
            lastYaw = yaw;
            lastPitch = pitch;
            // Construção correta do quaternion FPS (sem Euler):
            // 1. base   = orientação inicial da cena (R_x(180°) para Y-invertido)
            // 2. yaw    = rotação ao redor do worldUp (virar esq/dir)
            // 3. pitch  = rotação ao redor do right local (inclinar cima/baixo)
            // Ordem: Q = pitchQ * (yawQ * baseQ)
            tmpYawQ.setFromAxisAngle(worldUpAxis, yaw);
            // base + yaw juntos
            tmpQuat.multiplyQuaternions(tmpYawQ, tmpBaseQ);
            // right após base+yaw (para pitch girar ao redor do eixo correto)
            tmpRightVec.set(1, 0, 0).applyQuaternion(tmpQuat);
            // pitch ao redor do right local
            tmpPitchQ.setFromAxisAngle(tmpRightVec, pitch);
            // quaternion final
            cam.quaternion.multiplyQuaternions(tmpPitchQ, tmpQuat);
            cam.updateMatrixWorld();
          }

          // Movimento: forward/right extraídos do quaternion real da câmera.
          // Isso garante que WASD sempre corresponda à direção visual percebida,
          // sem bugs de sinal por inversão de eixos.
          if (moveInput.x !== 0 || moveInput.z !== 0) {
            // forward: local -Z da câmera projetado em XZ
            tmpForward.set(0, 0, -1).applyQuaternion(cam.quaternion);
            tmpForward.y = 0;
            if (tmpForward.lengthSq() > 0.001) tmpForward.normalize();

            // right: local +X da câmera projetado em XZ
            tmpRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
            tmpRight.y = 0;
            if (tmpRight.lengthSq() > 0.001) tmpRight.normalize();

            // W/S = frente/trás (mz=-1 para W); A/D = strafe esquerda/direita
            const { expandedBounds, targetY } = cachedNav;
            const moveSpeed = moveSpeedRef.current;
            cam.position.addScaledVector(tmpForward, -moveInput.z * moveSpeed);
            cam.position.addScaledVector(tmpRight, moveInput.x * moveSpeed);
            cam.position.y = targetY;
            if (expandedBounds) {
              cam.position.x = clamp(cam.position.x, expandedBounds.min[0], expandedBounds.max[0]);
              cam.position.z = clamp(cam.position.z, expandedBounds.min[2], expandedBounds.max[2]);
            }
          }
        }
        rafId = requestAnimationFrame(fpsLoop);

        const fpsCleanup = () => {
          cancelAnimationFrame(rafId);
          keyCleanup?.();
          if (canvasEl) {
            canvasEl.removeEventListener('pointerdown', onPointerDown);
            canvasEl.removeEventListener('pointermove', onPointerMove);
            canvasEl.removeEventListener('pointerup', onPointerUp);
            canvasEl.removeEventListener('pointercancel', onPointerUp);
          }
          joystickManager?.destroy();
          joystickZone.remove();
        };
        fpsCleanupRef.current = fpsCleanup;

        const api: SplatViewerAPI = {
          setQuality: (q) => {
            const p = QUALITY_PRESETS[q];
            viewer.renderer?.setPixelRatio(p.pixelRatio);
          },
          resetCamera: () => {
            const br = boundsRef.current;
            const { targetY: ty } = navFromBounds(br, cam.position.y);
            if (br) {
              cam.position.set((br.min[0] + br.max[0]) / 2, ty, (br.min[2] + br.max[2]) / 2);
            } else {
              cam.position.set(0, ty, 0);
            }
            yaw = 0;
            pitch = 0;
          },
          getCameraState: () => {
            const pos = cam.position;
            const fwd = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
            const tgt = new Vector3().addVectors(pos, fwd);
            return {
              position: pos.toArray(),
              target: [tgt.x, tgt.y, tgt.z],
            };
          },
          setCameraState: (state) => {
            const { expandedBounds: ex, targetY: ty } = navFromBounds(
              boundsRef.current,
              cam.position.y
            );
            cam.position.fromArray(state.position);
            cam.position.y = ty;
            if (ex) {
              cam.position.x = clamp(cam.position.x, ex.min[0], ex.max[0]);
              cam.position.z = clamp(cam.position.z, ex.min[2], ex.max[2]);
            }
            const cx = cam.position.x;
            const cy = cam.position.y;
            const cz = cam.position.z;
            const dx = state.target[0] - cx;
            const dy = state.target[1] - cy;
            const dz = state.target[2] - cz;
            const horizLen = Math.sqrt(dx * dx + dz * dz);
            // Câmera Y-invertida: forward=+Z em yaw=0. Y normal: forward=-Z em yaw=0.
            // atan2(-dx, dz) para invertido; atan2(-dx, -dz) para normal.
            yaw = Math.atan2(-dx, cameraUpInverted ? dz : -dz);
            // Pitch positivo = olhar pra cima. Em Y-invertido, "cima" = -Y (dy negativo).
            pitch = clamp(
              Math.atan2(cameraUpInverted ? -dy : dy, horizLen),
              -PITCH_LIMIT,
              PITCH_LIMIT
            );
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
            const camera = cam as Camera;
            const canvas = viewer.renderer?.domElement as HTMLCanvasElement | undefined;
            if (!canvas) return null;
            const v = new Vector3(wx, wy, wz);
            v.project(camera);
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            const sx = (v.x * 0.5 + 0.5) * w;
            const sy = (-v.y * 0.5 + 0.5) * h;
            const visible = v.z > -1 && v.z < 1;
            return { sx, sy, visible };
          },
          getSceneBounds: () => boundsRef.current,
          pickWorldAtPointer: (cx, cy) =>
            pickWorldFromViewer(viewer, cx, cy, boundsRef.current),
        };

        callbacksRef.current.onReady?.(api);
        if (liteLoadedOk) {
          callbacksRef.current.onLiteReady?.();
          void (async () => {
            const v = viewerRef.current;
            if (!v || !mounted) return;
            try {
              await v.addSplatScene(splatUrl, {
                progressiveLoad: true,
                showLoadingUI: false,
                onProgress: (pct: number) => {
                  callbacksRef.current.onProgress?.(
                    Math.min(100, Math.round(55 + (pct * 45) / 100))
                  );
                  if (pct >= 99) callbacksRef.current.onProgress?.(100);
                },
              });
              if (!mounted) return;
              if (typeof v.removeSplatScene === 'function') {
                try {
                  await v.removeSplatScene(0, false);
                } catch {
                  /* plan B: duas cenas coexistem */
                }
              }
              const fitted2 = fitCameraToSplat(v, cameraUpInverted);
              if (fitted2) {
                boundsRef.current = fitted2.bounds;
                homeStateRef.current = { position: fitted2.position, target: fitted2.target };
                cachedNav = navFromBounds(fitted2.bounds, cam.position.y);
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
