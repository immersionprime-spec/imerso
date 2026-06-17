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
import type { SplatViewerAPI, MoveSpeedLevel } from './SplatViewer';
import type { ReactNode } from 'react';

interface PillButtonProps {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
}

function PillButton({ label, children, onClick, pressed }: PillButtonProps) {
  return (
    <div className="group relative flex">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-150 md:h-10 md:w-10 ${
          pressed ? 'bg-primary/20 text-white' : 'text-white/80 hover:text-white'
        }`}
      >
        {children}
      </button>
      <span
        className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-[11px] text-white md:group-hover:block"
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="h-5 w-px shrink-0 bg-white/10" />;
}

function PillGroup({ children }: { children: ReactNode }) {
  return (
    <div
      className="inline-flex items-center gap-0 rounded-full border border-white/10 p-1 backdrop-blur-md"
      style={{ background: 'rgba(15,23,41,0.7)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
    >
      {children}
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
      <div className="pointer-events-none fixed left-3 top-3 z-30 sm:left-4 sm:top-4">
        <div className="pointer-events-auto">
          <PillGroup>
            <PillButton label={t('reset_view')} onClick={() => api?.resetCamera()}>
              <Home className="h-[18px] w-[18px]" />
            </PillButton>
            <Divider />
            <PillButton label={t('info_button')} onClick={onInfo}>
              <Info className="h-[18px] w-[18px]" />
            </PillButton>
            {onMinimapToggle ? (
              <>
                <Divider />
                <PillButton label={t('minimap.toggle')} onClick={onMinimapToggle} pressed={minimapOpen}>
                  <Map className="h-[18px] w-[18px]" />
                </PillButton>
              </>
            ) : null}
          </PillGroup>
        </div>
      </div>

      <div className="pointer-events-none fixed right-3 top-3 z-30 sm:right-4 sm:top-4">
        <div className="pointer-events-auto">
          <PillGroup>
            <PillButton label={t('share')} onClick={onShare}>
              <Share2 className="h-[18px] w-[18px]" />
            </PillButton>
            <Divider />
            <PillButton label={t('fullscreen')} onClick={onToggleFullscreen}>
              {isFullscreen ? <Minimize className="h-[18px] w-[18px]" /> : <Maximize className="h-[18px] w-[18px]" />}
            </PillButton>
          </PillGroup>
        </div>
      </div>
    </>
  );
}
