'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { Button, buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { SplatViewer, type SplatViewerAPI } from '@/components/viewer/SplatViewer';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface TourPreviewClientProps {
  tourId: string;
  titulo: string;
  splatUrl: string;
  initialPosition: Vec3 | null;
  initialTarget: Vec3 | null;
  splatRotationDeg: number;
  cameraUpInverted: boolean;
}

export function TourPreviewClient({
  tourId,
  titulo,
  splatUrl,
  initialPosition,
  initialTarget,
  splatRotationDeg,
  cameraUpInverted,
}: TourPreviewClientProps) {
  const t = useTranslations('admin.tours.preview');
  const apiRef = useRef<SplatViewerAPI | null>(null);
  const [saving, setSaving] = useState(false);

  const onReady = useCallback(
    (api: SplatViewerAPI) => {
      apiRef.current = api;
      if (initialPosition && initialTarget) {
        api.setCameraState({
          position: [initialPosition.x, initialPosition.y, initialPosition.z],
          target: [initialTarget.x, initialTarget.y, initialTarget.z],
        });
      }
    },
    [initialPosition, initialTarget]
  );

  async function saveCameraStart() {
    const api = apiRef.current;
    if (!api) {
      toast.error(t('no_viewer'));
      return;
    }
    setSaving(true);
    try {
      const { position, target } = api.getCameraState();
      const res = await fetch(`/api/admin/tours/${tourId}/camera-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position, target }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(j?.error?.message ?? t('save_error'));
        return;
      }
      toast.success(t('save_ok'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-surface/90 px-4 py-3 shadow-md-dark backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-lg font-semibold text-text-primary">{titulo}</h1>
            <p className="text-xs text-text-muted">{t('hint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={saveCameraStart}>
              {saving ? t('saving') : t('set_start')}
            </Button>
            <Link
              href={`/painel/tours/${tourId}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex')}
            >
              {t('back')}
            </Link>
          </div>
        </div>
      </header>
      <div className="w-full flex-1 pt-[120px]">
        <div className="h-[calc(100vh-120px)] w-full min-h-[320px]">
          <SplatViewer
            splatUrl={splatUrl}
            cameraUpInverted={cameraUpInverted}
            splatRotationDeg={splatRotationDeg}
            pickMode={false}
            onReady={onReady}
          />
        </div>
      </div>
    </div>
  );
}
