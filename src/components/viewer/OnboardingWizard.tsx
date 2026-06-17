'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SplatViewerAPI } from './SplatViewer';

const LS_KEY = 'imerso_wizard_count';
const MAX_SHOWS = 2;
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

  const [step, setStep] = useState<'fullscreen' | 'move-joystick' | 'move-look' | 'rotate' | 'done'>('fullscreen');
  const [visible, setVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const moveDurationRef = useRef(0);
  const lastCheckRef = useRef<number>(0);

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

  useEffect(() => {
    if (!viewerReady) return;

    const noFullscreen = typeof document !== 'undefined' && !document.fullscreenElement;

    if (cameFromWaypoint && isMobile && noFullscreen) {
      setShouldRender(true);
      setStep('fullscreen');
      requestAnimationFrame(() => setVisible(true));
      return;
    }

    if (mode === 'waypoint') return;

    let count = 0;
    try {
      count = parseInt(localStorage.getItem(LS_KEY) ?? '0', 10);
    } catch {
      // localStorage indisponível
    }
    if (count >= MAX_SHOWS) return;

    const firstStep = isMobile ? 'fullscreen' : 'move-joystick';
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
    setStep('move-joystick');
  }, [close]);

  // Sub-etapa A (move-joystick): detecta INPUT real de movimento (joystick/teclado),
  // não distância 3D. Corrige bug onde speedScale pequeno em cenas compactas nunca
  // atingia o threshold de distância, fazendo o wizard nunca fechar.
  useEffect(() => {
    if (step !== 'move-joystick' || !api || !visible) return;

    moveDurationRef.current = 0;
    lastCheckRef.current = Date.now();

    const interval = window.setInterval(() => {
      if (!api) return;

      const now = Date.now();
      const elapsed = now - lastCheckRef.current;
      lastCheckRef.current = now;

      if (api.isMoveInputActive()) {
        moveDurationRef.current += elapsed;
        if (moveDurationRef.current >= MOVE_REQUIRED_MS) {
          // Desktop não tem sub-etapa de "olhar" separada — um único hint já mostra WASD + mouse.
          if (isMobile) {
            setStep('move-look');
          } else if (isPortrait) {
            setStep('rotate');
          } else {
            close();
          }
        }
      } else {
        moveDurationRef.current = 0;
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [step, api, visible, isMobile, isPortrait, close]);

  // Sub-etapa B (move-look): mobile only — detecta INPUT real de "olhar" (drag ativo).
  useEffect(() => {
    if (step !== 'move-look' || !api || !visible) return;

    moveDurationRef.current = 0;
    lastCheckRef.current = Date.now();

    const interval = window.setInterval(() => {
      if (!api) return;

      const now = Date.now();
      const elapsed = now - lastCheckRef.current;
      lastCheckRef.current = now;

      if (api.isLookInputActive()) {
        moveDurationRef.current += elapsed;
        if (moveDurationRef.current >= MOVE_REQUIRED_MS) {
          if (isPortrait) {
            setStep('rotate');
          } else {
            close();
          }
        }
      } else {
        moveDurationRef.current = 0;
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [step, api, visible, isPortrait, close]);

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
        @keyframes imerso-wizard-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.12); }
        }
        @keyframes imerso-wizard-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes imerso-joystick-demo {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(18px, -10px); }
          50% { transform: translate(0, 14px); }
          75% { transform: translate(-18px, -10px); }
        }
      `}</style>

      <div
        className="pointer-events-none fixed inset-0 z-[36]"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 400ms ease' }}
        aria-live="polite"
      >
        {/* ── Passo F: fullscreen ─────────────────────────────────────────── */}
        {step === 'fullscreen' && (
          <div
            className="pointer-events-auto absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          >
            <div
              className="mx-6 flex w-full max-w-[280px] flex-col items-center gap-1 rounded-3xl p-6 text-center"
              style={{
                background: 'rgba(15,23,41,0.7)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
              }}
            >
              <div
                className="mb-3 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.2)' }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </div>
              <p className="font-display text-xl font-semibold text-white">{t('wizard.fullscreen_title')}</p>
              <p className="mt-1 text-sm text-white/50">{t('wizard.fullscreen_sub')}</p>
              <button
                type="button"
                onClick={() => void handleFullscreenClick()}
                className="mt-4 w-full rounded-2xl py-3.5 text-base font-semibold text-white transition-colors active:scale-[0.98]"
                style={{ background: '#4F8EF7', boxShadow: '0 0 24px rgba(79,142,247,0.35)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#6BA0F9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#4F8EF7')}
              >
                {t('wizard.fullscreen_btn')}
              </button>
            </div>
          </div>
        )}

        {/* ── Sub-etapa A: joystick (mobile) ou WASD+mouse (desktop) ──────── */}
        {step === 'move-joystick' && (
          <>
            {isMobile ? (
              <div
                className="pointer-events-none absolute bottom-0 left-0 top-0 flex items-center justify-center"
                style={{ width: '50%' }}
              >
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="relative flex items-center justify-center rounded-full"
                    style={{
                      width: 96,
                      height: 96,
                      background: 'rgba(79,142,247,0.08)',
                      border: '1.5px dashed rgba(79,142,247,0.35)',
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: '#4F8EF7',
                        boxShadow: '0 0 16px rgba(79,142,247,0.6)',
                        animation: 'imerso-joystick-demo 1.8s ease-in-out infinite',
                      }}
                    />
                  </div>
                  <div
                    className="rounded-xl px-3 py-2 text-center"
                    style={{ background: 'rgba(15,23,41,0.7)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}
                  >
                    <p className="text-sm font-medium text-white">{t('wizard.move_joystick_text')}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className="flex flex-col items-center gap-3 rounded-2xl px-8 py-6 text-center"
                  style={{ background: 'rgba(15,23,41,0.7)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <kbd className="rounded-md px-2 py-1 font-mono text-xs text-white" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>W</kbd>
                      <div className="flex gap-1">
                        <kbd className="rounded-md px-2 py-1 font-mono text-xs text-white" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>A</kbd>
                        <kbd className="rounded-md px-2 py-1 font-mono text-xs text-white" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>S</kbd>
                        <kbd className="rounded-md px-2 py-1 font-mono text-xs text-white" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>D</kbd>
                      </div>
                    </div>
                    <span className="text-white/30">·</span>
                    <svg width="18" height="24" viewBox="0 0 14 18" fill="none" stroke="#4F8EF7" strokeWidth="1.5" aria-hidden>
                      <rect x="1" y="1" width="12" height="16" rx="6" />
                      <line x1="7" y1="1" x2="7" y2="7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-white">{t('wizard.move_desktop_label')}</p>
                  <p className="text-xs text-white/50">{t('wizard.move_desktop_sub')}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Sub-etapa B: arrastar para olhar (mobile only) ───────────────── */}
        {step === 'move-look' && (
          <div
            className="pointer-events-none absolute bottom-0 right-0 top-0 flex items-center justify-center"
            style={{ width: '50%' }}
          >
            <div className="flex flex-col items-center gap-3">
              <svg width="90" height="60" viewBox="0 0 90 60" fill="none" aria-hidden>
                <path
                  d="M15 45 Q 45 10 75 45"
                  stroke="rgba(79,142,247,0.35)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  fill="none"
                />
                <circle r="7" fill="#4F8EF7" style={{ filter: 'drop-shadow(0 0 8px rgba(79,142,247,0.6))' }}>
                  <animateMotion path="M15 45 Q 45 10 75 45" dur="1.8s" repeatCount="indefinite" />
                </circle>
              </svg>
              <div
                className="rounded-xl px-3 py-2 text-center"
                style={{ background: 'rgba(15,23,41,0.7)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}
              >
                <p className="text-sm font-medium text-white">{t('wizard.move_look_text')}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Passo 2: rotacionar (mobile portrait) ───────────────────────── */}
        {step === 'rotate' && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          >
            <div
              className="flex flex-col items-center gap-1 rounded-2xl px-8 py-6 text-center"
              style={{ background: 'rgba(15,23,41,0.7)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}
            >
              <div style={{ animation: 'imerso-rotate-phone 1s ease-in-out infinite alternate', display: 'inline-block' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="1.5" aria-hidden>
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <circle cx="12" cy="17" r="1" fill="#4F8EF7" />
                </svg>
              </div>
              <p className="mt-2 text-sm font-medium text-white">{t('wizard.rotate_title')}</p>
              <p className="text-xs text-white/50">{t('wizard.rotate_sub')}</p>
              <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full" style={{ background: '#4F8EF7', animation: 'imerso-wizard-progress 3s linear forwards' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
