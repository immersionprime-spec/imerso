'use client';

import {
  Home,
  Info,
  Maximize,
  Minimize,
  Share2,
  Map,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import type { SplatViewerAPI, MoveSpeedLevel } from './SplatViewer';
import type { ReactNode } from 'react';

interface TooltipBtnProps {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  variant?: 'outline' | 'primary' | 'ghost';
  pressed?: boolean;
}

function TooltipBtn({ label, children, onClick, variant = 'outline', pressed }: TooltipBtnProps) {
  return (
    <div className="group relative">
      <Button
        type="button"
        variant={variant}
        size="icon"
        className="glass border-border-strong bg-surface/80 h-11 w-11 md:h-9 md:w-9"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
      >
        {children}
      </Button>
      <span
        className="pointer-events-none absolute left-1/2 top-full mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white backdrop-blur-sm md:group-hover:block"
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}

interface ViewerControlsProps {
  api: SplatViewerAPI | null;
  onInfo: () => void;
  moveSpeed: MoveSpeedLevel;
  onMoveSpeedChange: (s: MoveSpeedLevel) => void;
  onShare: () => void;
  onScreenshot?: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  minimapOpen?: boolean;
  onMinimapToggle?: () => void;
}

export function ViewerControls({
  api,
  onInfo,
  onShare,
  isFullscreen,
  onToggleFullscreen,
  minimapOpen,
  onMinimapToggle,
}: ViewerControlsProps) {
  const t = useTranslations('viewer');

  return (
    <>
      <div className="pointer-events-none fixed left-3 top-3 z-30 flex flex-col gap-2 sm:left-4 sm:top-4">
        <div className="pointer-events-auto flex gap-2">
          <TooltipBtn label={t('reset_view')} onClick={() => api?.resetCamera()}>
            <Home className="h-4 w-4" />
          </TooltipBtn>
          <TooltipBtn label={t('info_button')} onClick={onInfo}>
            <Info className="h-4 w-4" />
          </TooltipBtn>
          {onMinimapToggle ? (
            <TooltipBtn
              label={t('minimap.toggle')}
              onClick={onMinimapToggle}
              variant={minimapOpen ? 'primary' : 'outline'}
              pressed={minimapOpen}
            >
              <Map className="h-4 w-4" />
            </TooltipBtn>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none fixed right-3 top-3 z-30 flex flex-col items-end gap-2 sm:right-4 sm:top-4">
        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          <TooltipBtn label={t('share')} onClick={onShare}>
            <Share2 className="h-4 w-4" />
          </TooltipBtn>
          <TooltipBtn label={t('fullscreen')} onClick={onToggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </TooltipBtn>
        </div>
      </div>
    </>
  );
}
