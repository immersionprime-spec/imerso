'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SplatViewerAPI } from './SplatViewer';

const LS_KEY = 'imerso_wizard_count';
const MAX_SHOWS = 2;
const MOVE_THRESHOLD = 0.05;
const MOVE_REQUIRED_MS = 2000;
const POLL_INTERVAL_MS = 100;

export type WizardMode = 'entry' | 'waypoint';

interface OnboardingWizardProps {
  api: SplatViewerAPI | null;
  mode: WizardMode;
  viewerReady: boolean;
  cameFromWaypoint?: boolean;
}

export function OnboardingWizard({ api, mode, viewerReady, cameFromWaypoint }: OnboardingWizardProps) {
  const t = useTranslations('viewer');

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);

  const isPortrait = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(orientation: portrait)').matches;
  }, []);

  const [step, setStep] = useState<'fullscreen' | 'move' | 'rotate' | 'done'>('fullscreen');
  const [visible, setVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const moveDurationRef = useRef(0);
  const lastPosRef = useRef<number[] | null>(null);
  const lastCheckRef = useRef<number>(0);

  // Snapshot do mode no ref para uso em callbacks sem re-criar close
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const cameFromWaypointRef = useRef(cameFromWaypoint);
  cameFromWaypointRef.current = cameFromWaypoint;

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(() => setShouldRender(false), 400);
    if (modeRef.current === 'entry') {
      try {
        const count = parseInt(localStorage.getItem(LS_KEY) ?? '0', 10);
        localStorage.setItem(LS_KEY, String(count + 1));
      } catch {
        // localStorage indisponível
      }
    }
  }, []);

  // Decide se e qual passo mostrar ao viewer ficar pronto
  useEffect(() => {
    if (!viewerReady) return;

    const noFullscreen = typeof document !== 'undefined' && !document.fullscreenElement;

    // Chegou via waypoint no mobile sem fullscreen: mostrar apenas passo F
    if (cameFromWaypoint && isMobile && noFullscreen) {
      setShouldRender(true);
      setStep('fullscreen');
      requestAnimationFrame(() => setVisible(true));
      return;
    }

    // Modo waypoint sem cameFromWaypoint: nada a fazer
    if (mode === 'waypoint') return;

    // Modo entry: verificar contador
    let count = 0;
    try {
      count = parseInt(localStorage.getItem(LS_KEY) ?? '0', 10);
    } catch {
      // localStorage indisponível
    }
    if (count >= MAX_SHOWS) return;

    const firstStep = isMobile ? 'fullscreen' : 'move';
    setStep(firstStep);
    setShouldRender(true);
    requestAnimationFrame(() => setVisible(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerReady]);

  const handleFullscreenClick = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // requestFullscreen pode ser rejeitado sem gesto do usuário em alguns browsers
    }
    try {
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      // screen.orientation.lock() não disponível em todos os dispositivos — silencioso
    }

    if (modeRef.current === 'waypoint' || cameFromWaypointRef.current) {
      close();
      return;
    }
    setStep('move');
  }, [close]);

  // Passo 1 (move): polling de câmera a cada 100ms, acumula 2s contínuos de movimento
  useEffect(() => {
    if (step !== 'move' || !api || !visible) return;

    moveDurationRef.current = 0;
    lastPosRef.current = null;
    lastCheckRef.current = Date.now();

    const interval = window.setInterval(() => {
      if (!api) return;

      const now = Date.now();
      const elapsed = now - lastCheckRef.current;
      lastCheckRef.current = now;

      const { position } = api.getCameraState();
      const prev = lastPosRef.current;
      lastPosRef.current = position;

      if (!prev) return;

      const dx = position[0] - prev[0];
      const dy = position[1] - prev[1];
      const dz = position[2] - prev[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > MOVE_THRESHOLD) {
        moveDurationRef.current += elapsed;
        if (moveDurationRef.current >= MOVE_REQUIRED_MS) {
          if (isMobile && isPortrait) {
            setStep('rotate');
          } else {
            close();
          }
        }
      } else {
        // Pausa no movimento: reseta acumulador
        moveDurationRef.current = 0;
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [step, api, visible, isMobile, isPortrait, close]);

  // Passo 2 (rotate): auto-fechar após 3s
  useEffect(() => {
    if (step !== 'rotate') return;
    const id = window.setTimeout(() => close(), 3000);
    return () => window.clearTimeout(id);
  }, [step, close]);

  if (!shouldRender) return null;

  return (
    <>
      <style>{`
        @keyframes imerso-rotate-phone {
          from { transform: rotate(0deg); }
          to   { transform: rotate(90deg); }
        }
      `}</style>

      <div
        className="pointer-events-none fixed inset-0 z-[36]"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 400ms ease' }}
        aria-live="polite"
      >
        {/* ── Passo F: fullscreen ─────────────────────────────────────────── */}
        {step === 'fullscreen' && (
          <div className="pointer-events-auto flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 rounded-xl border border-accent/30 bg-black/70 px-8 py-8 text-center backdrop-blur-md">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-accent"
                aria-hidden
              >
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              </svg>
              <p className="text-base font-medium text-white">{t('wizard.fullscreen_title')}</p>
              <p className="text-sm text-white/60">{t('wizard.fullscreen_sub')}</p>
              <button
                onClick={() => void handleFullscreenClick()}
                className="mt-2 rounded-lg bg-accent px-8 py-4 text-lg font-semibold text-white transition-opacity hover:opacity-90 active:scale-95"
              >
                {t('wizard.fullscreen_btn')}
              </button>
            </div>
          </div>
        )}

        {/* ── Passo 1: mover ──────────────────────────────────────────────── */}
        {step === 'move' && (
          <>
            {isMobile ? (
              <>
                {/* Anotação esquerda: joystick */}
                <div
                  className="pointer-events-none absolute"
                  style={{ left: '15%', top: '50%', transform: 'translate(-50%, -50%)' }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="animate-pulse text-accent"
                      aria-hidden
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    <div className="rounded-lg border border-accent/30 bg-black/70 px-3 py-2 text-center backdrop-blur-md">
                      <p className="text-xs font-medium text-white">{t('wizard.move_left_label')}</p>
                      <p className="text-[10px] text-white/60">{t('wizard.move_left_sub')}</p>
                    </div>
                  </div>
                </div>

                {/* Anotação direita: arrastar para olhar */}
                <div
                  className="pointer-events-none absolute"
                  style={{ right: '15%', top: '50%', transform: 'translate(50%, -50%)' }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="animate-pulse text-accent"
                      aria-hidden
                    >
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    <div className="rounded-lg border border-accent/30 bg-black/70 px-3 py-2 text-center backdrop-blur-md">
                      <p className="text-xs font-medium text-white">{t('wizard.move_right_label')}</p>
                      <p className="text-[10px] text-white/60">{t('wizard.move_right_sub')}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="pointer-events-none flex flex-col items-center gap-3 rounded-xl border border-accent/30 bg-black/70 px-8 py-6 text-center backdrop-blur-md">
                  <div className="flex items-center gap-4">
                    {/* Teclas WASD */}
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex justify-center">
                        <kbd className="rounded bg-white/20 px-2 py-1 font-mono text-xs text-white">W</kbd>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="rounded bg-white/20 px-2 py-1 font-mono text-xs text-white">A</kbd>
                        <kbd className="rounded bg-white/20 px-2 py-1 font-mono text-xs text-white">S</kbd>
                        <kbd className="rounded bg-white/20 px-2 py-1 font-mono text-xs text-white">D</kbd>
                      </div>
                    </div>
                    <span className="text-white/40">·</span>
                    {/* Ícone do mouse */}
                    <svg
                      width="18"
                      height="24"
                      viewBox="0 0 14 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-accent"
                      aria-hidden
                    >
                      <rect x="1" y="1" width="12" height="16" rx="6" />
                      <line x1="7" y1="1" x2="7" y2="7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-white">{t('wizard.move_desktop_label')}</p>
                  <p className="text-xs text-white/60">{t('wizard.move_desktop_sub')}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Passo 2: rotacionar (mobile portrait) ───────────────────────── */}
        {step === 'rotate' && (
          <div className="flex h-full w-full items-center justify-center">
            <div className="pointer-events-none flex flex-col items-center gap-4 rounded-xl border border-accent/30 bg-black/70 px-8 py-6 text-center backdrop-blur-md">
              <div
                style={{
                  animation: 'imerso-rotate-phone 1s ease-in-out infinite alternate',
                  display: 'inline-block',
                }}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-accent"
                  aria-hidden
                >
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <circle cx="12" cy="17" r="1" fill="currentColor" />
                </svg>
              </div>
              <p className="text-sm font-medium text-white">{t('wizard.rotate_title')}</p>
              <p className="text-xs text-white/60">{t('wizard.rotate_sub')}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
