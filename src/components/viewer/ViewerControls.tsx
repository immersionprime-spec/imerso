'use client';

import {
  Home,
  Info,
  Maximize,
  Minimize,
  Camera,
  Share2,
  Map,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import type { SplatViewerAPI, MoveSpeedLevel } from './SplatViewer';

interface ViewerControlsProps {
  api: SplatViewerAPI | null;
  onInfo: () => void;
  moveSpeed: MoveSpeedLevel;
  onMoveSpeedChange: (s: MoveSpeedLevel) => void;
  onShare: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  minimapOpen?: boolean;
  onMinimapToggle?: () => void;
}

export function ViewerControls({
  api,
  onInfo,
  moveSpeed,
  onMoveSpeedChange,
  onShare,
  isFullscreen,
  onToggleFullscreen,
  minimapOpen,
  onMinimapToggle,
}: ViewerControlsProps) {
  const t = useTranslations('viewer');
  const sLabel = (k: MoveSpeedLevel) => t(`move_speed.${k}`);

  return (
    <>
      <div className="pointer-events-none fixed left-3 top-3 z-30 flex flex-col gap-2 sm:left-4 sm:top-4">
        <div className="pointer-events-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="glass border-border-strong bg-surface/80"
            aria-label={t('reset_view')}
            onClick={() => api?.resetCamera()}
          >
            <Home className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="glass border-border-strong bg-surface/80"
            aria-label={t('info_button')}
            onClick={onInfo}
          >
            <Info className="h-4 w-4" />
          </Button>
          {onMinimapToggle ? (
            <Button
              type="button"
              variant={minimapOpen ? 'primary' : 'outline'}
              size="icon"
              className="glass border-border-strong bg-surface/80"
              aria-label={t('minimap.toggle')}
              aria-pressed={minimapOpen}
              onClick={onMinimapToggle}
            >
              <Map className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none fixed right-3 top-3 z-30 flex flex-col items-end gap-2 sm:right-4 sm:top-4">
        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="glass border-border-strong bg-surface/80"
            aria-label={t('share')}
            onClick={onShare}
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="glass border-border-strong bg-surface/80"
            aria-label={t('screenshot')}
            onClick={async () => {
              try {
                const blob = await api?.takeScreenshot();
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'imerso-tour.png';
                a.click();
                URL.revokeObjectURL(url);
              } catch {
                /* ignore */
              }
            }}
          >
            <Camera className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="glass border-border-strong bg-surface/80"
            aria-label={t('fullscreen')}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
        <div
          className="pointer-events-auto glass flex rounded-md border border-border-strong bg-surface/80 p-1"
          role="group"
          aria-label={t('move_speed.label')}
        >
          {(['slow', 'medium', 'fast'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={cn(
                buttonVariants({ variant: moveSpeed === k ? 'primary' : 'ghost', size: 'sm' }),
                'h-8 px-2 text-xs'
              )}
              onClick={() => onMoveSpeedChange(k)}
            >
              {sLabel(k)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
