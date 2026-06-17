'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface ShareNudgeProps {
  visible: boolean;
  onShare: () => void;
  onDismiss: () => void;
}

export function ShareNudge({ visible, onShare, onDismiss }: ShareNudgeProps) {
  const t = useTranslations('viewer');
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      return;
    }
    const id = window.setTimeout(() => setShouldRender(false), 400);
    return () => window.clearTimeout(id);
  }, [visible]);

  if (!shouldRender) return null;

  return (
    <div
      className="fixed left-1/2 top-20 z-[35] -translate-x-1/2"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 400ms ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      role="status"
    >
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/75 px-4 py-2.5 shadow-lg backdrop-blur-md">
        <span className="text-sm text-white/85">{t('share_nudge_text')}</span>
        <button
          type="button"
          onClick={onShare}
          className="rounded-full border border-primary/30 bg-primary/20 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/30"
        >
          {t('share_nudge_cta')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-white/40 transition-colors hover:text-white/70"
          aria-label="Dispensar"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
