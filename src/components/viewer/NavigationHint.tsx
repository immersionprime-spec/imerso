'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

interface NavigationHintProps {
  visible: boolean;
  onDismiss: () => void;
}

export function NavigationHint({ visible, onDismiss }: NavigationHintProps) {
  const t = useTranslations('viewer');
  const [shouldRender, setShouldRender] = useState(visible);
  const [opacityOn, setOpacityOn] = useState(visible);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      requestAnimationFrame(() => setOpacityOn(true));
    } else {
      setOpacityOn(false);
      const id = window.setTimeout(() => setShouldRender(false), 400);
      return () => window.clearTimeout(id);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const onInteract = () => {
      onDismiss();
    };

    const autoId = window.setTimeout(onDismiss, 5000);
    window.addEventListener('pointermove', onInteract);
    window.addEventListener('pointerdown', onInteract);
    window.addEventListener('keydown', onInteract);

    return () => {
      window.clearTimeout(autoId);
      window.removeEventListener('pointermove', onInteract);
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
  }, [visible, onDismiss]);

  if (!shouldRender) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-1/2 z-[35] -translate-x-1/2 -translate-y-1/2"
      style={{
        opacity: opacityOn ? 1 : 0,
        transition: 'opacity 400ms ease',
      }}
      role="status"
    >
      {isMobile ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-black/55 px-5 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-sm font-medium text-white/90">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="shrink-0 text-white/80"
              aria-hidden
            >
              <path d="M9 3a2 2 0 0 0-2 2v6.5l-1.8-1.8A1.5 1.5 0 0 0 3 11.8l3.8 3.8A6 6 0 0 0 9 20h4a6 6 0 0 0 6-6v-5a2 2 0 0 0-4 0v-1a2 2 0 0 0-4 0V5a2 2 0 0 0-2-2z" />
            </svg>
            <span>{t('nav_hint_mobile')}</span>
          </div>
          <p className="text-xs text-white/50">{t('nav_hint_mobile_sub')}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-black/55 px-5 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-4 text-sm font-medium text-white/90">
            <div className="flex flex-col items-center gap-1">
              <div className="flex gap-1">
                <kbd className="rounded bg-white/20 px-2 py-0.5 font-mono text-xs text-white">W</kbd>
              </div>
              <div className="flex gap-1">
                <kbd className="rounded bg-white/20 px-2 py-0.5 font-mono text-xs text-white">A</kbd>
                <kbd className="rounded bg-white/20 px-2 py-0.5 font-mono text-xs text-white">S</kbd>
                <kbd className="rounded bg-white/20 px-2 py-0.5 font-mono text-xs text-white">D</kbd>
              </div>
            </div>
            <span className="text-white/50">·</span>
            <div className="flex items-center gap-1.5 text-xs text-white/80">
              <svg
                width="14"
                height="18"
                viewBox="0 0 14 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <rect x="1" y="1" width="12" height="16" rx="6" />
                <line x1="7" y1="1" x2="7" y2="7" />
              </svg>
              <span>{t('nav_hint_desktop')}</span>
            </div>
          </div>
          <p className="text-xs text-white/50">{t('nav_hint_desktop_sub')}</p>
        </div>
      )}
    </div>
  );
}
