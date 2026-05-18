'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Progress } from '@/components/ui/Progress';

interface LoadingScreenProps {
  visible: boolean;
  progress: number;
}

export function LoadingScreen({ visible, progress }: LoadingScreenProps) {
  const t = useTranslations('viewer');
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
    } else {
      const timerId = window.setTimeout(() => setShouldRender(false), 650);
      return () => window.clearTimeout(timerId);
    }
  }, [visible]);

  if (!shouldRender) return null;

  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-7 bg-background px-8"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 600ms ease-out',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      role="status"
      aria-live="polite"
      aria-label={t('loading')}
    >
      <div className="animate-pulse-soft">
        <Image src="/logo-mark.svg" alt="Imerso" width={64} height={64} priority />
      </div>

      <div className="text-center">
        <p className="font-display font-medium text-2xl text-text-primary">{t('loading')}</p>
        <p className="mt-1.5 text-sm text-text-secondary">{t('loading_sub')}</p>
      </div>

      <div className="w-72 max-w-[80vw] space-y-2">
        <Progress value={pct} />
        <div className="text-right font-mono text-xs text-text-muted">{pct}%</div>
      </div>
    </div>
  );
}
