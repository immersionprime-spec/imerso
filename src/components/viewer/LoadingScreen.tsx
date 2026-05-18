'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Progress } from '@/components/ui/Progress';

const HINT_KEYS = ['loading_hint_1', 'loading_hint_2', 'loading_hint_3', 'loading_hint_4'] as const;

interface LoadingScreenProps {
  visible: boolean;
  progress: number;
  coverImageUrl?: string | null;
  tourTitle?: string | null;
}

export function LoadingScreen({ visible, progress, coverImageUrl, tourTitle }: LoadingScreenProps) {
  const t = useTranslations('viewer');
  const [shouldRender, setShouldRender] = useState(visible);
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
    } else {
      const timerId = window.setTimeout(() => setShouldRender(false), 650);
      return () => window.clearTimeout(timerId);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => {
      setHintIndex((prev) => (prev + 1) % HINT_KEYS.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [visible]);

  if (!shouldRender) return null;

  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-7 overflow-hidden px-8"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 600ms ease-out',
          pointerEvents: visible ? 'auto' : 'none',
        }}
        role="status"
        aria-live="polite"
        aria-label={t('loading')}
      >
        {coverImageUrl ? (
          <>
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `url(${coverImageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-black/65" />
          </>
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-background" />
        )}

        <div className="relative z-10 flex flex-col items-center gap-7">
          <div className="animate-pulse-soft">
            <Image src="/logo-mark.svg" alt="Imerso" width={64} height={64} priority />
          </div>

          <div className="text-center">
            <p className="font-display font-medium text-2xl text-text-primary">
              {tourTitle ? (
                <>
                  Preparando <span className="text-accent">{tourTitle}</span>…
                </>
              ) : (
                t('loading')
              )}
            </p>
            <p
              key={hintIndex}
              className="mt-1.5 text-sm text-text-secondary"
              style={{ animation: 'fadeInUp 0.4s ease' }}
            >
              {t(HINT_KEYS[hintIndex])}
            </p>
          </div>

          <div className="w-72 max-w-[80vw] space-y-2">
            <Progress value={pct} />
            <div className="text-right font-mono text-xs text-text-muted">{pct}%</div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-xs text-text-muted tracking-wide">
              {t('loading_3d_badge')}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}