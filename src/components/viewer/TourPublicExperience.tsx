'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { PublicTourPayload } from '@/types/public-tour';
import { getOrCreateFingerprint } from '@/lib/utils/fingerprint';
import { normalizeWhatsAppDigits } from '@/lib/utils/whatsapp';
import { SplatViewer, type SplatViewerAPI, type MoveSpeedLevel } from './SplatViewer';
import { LoadingScreen } from './LoadingScreen';
import { ViewerControls } from './ViewerControls';
import { WhatsAppFloating } from './WhatsAppFloating';
import { InfoPanel } from './InfoPanel';
import { ShareTourDialog } from './ShareTourDialog';
import { HotspotMarkers } from './HotspotMarkers';
import { MiniMap } from './MiniMap';
import { CinematicPlayer } from './CinematicPlayer';
import { ElevationSlider } from './ElevationSlider';
import { PortaButtons } from './PortaButtons';
import { WaypointLabels } from './WaypointLabels';
import { ProximityPortaTransition } from './ProximityPortaTransition';
import { NavigationHint } from './NavigationHint';
import { PropertySummaryCard } from './PropertySummaryCard';
import { ShareNudge } from './ShareNudge';
import { AmbientAudio } from './AmbientAudio';

interface TourPublicExperienceProps {
  data: PublicTourPayload;
  shareUrl: string;
}

export function TourPublicExperience({ data, shareUrl }: TourPublicExperienceProps) {
  const t = useTranslations('viewer');

  const cameFromRef = useRef(false);
  const cameFromResolvedRef = useRef(false);
  if (!cameFromResolvedRef.current && typeof window !== 'undefined') {
    cameFromResolvedRef.current = true;
    cameFromRef.current = Boolean(new URLSearchParams(window.location.search).get('from'));
  }

  const [loadProgress, setLoadProgress] = useState(0);
  const [loadingOverlay, setLoadingOverlay] = useState(!cameFromRef.current);
  const [detailLoading, setDetailLoading] = useState(false);
  const [api, setApi] = useState<SplatViewerAPI | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [moveSpeed, setMoveSpeed] = useState<MoveSpeedLevel>('medium');
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [showNavHint, setShowNavHint] = useState(false);
  const [showShareNudge, setShowShareNudge] = useState(false);
  const shareNudgeDismissedRef = useRef(false);
  const [entryOverlayVisible, setEntryOverlayVisible] = useState(false);
  const [showTransitionLoading, setShowTransitionLoading] = useState(false);
  const transitionTimerRef = useRef<number | null>(null);
  const startedRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (cameFromRef.current) {
      setEntryOverlayVisible(true);
      transitionTimerRef.current = window.setTimeout(() => {
        setShowTransitionLoading(true);
      }, 1500);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const founderPhone = process.env.NEXT_PUBLIC_WHATSAPP_FOUNDER ?? '';
  const defaultMsg = process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE_DEFAULT ?? '';
  const corretorPhone = data.corretor?.whatsapp;
  const imobPhone = data.imobiliaria.whatsapp_principal;
  const phoneRaw = corretorPhone || imobPhone || founderPhone;
  const phone = normalizeWhatsAppDigits(phoneRaw);
  const messageForLink = t('whatsapp_prefill', { titulo: data.tour.titulo }) || defaultMsg;

  useEffect(() => {
    startedRef.current = Date.now();
    let fp = '';
    void (async () => {
      fp = await getOrCreateFingerprint();
      void fetch('/api/public/analytics/track-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourId: data.tour.id, fingerprint: fp }),
      });
    })();

    const sendDuration = (seconds: number) => {
      void getOrCreateFingerprint().then((f) =>
        fetch('/api/public/analytics/track-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tourId: data.tour.id, fingerprint: f, duration_seconds: seconds }),
          keepalive: true,
        })
      );
    };

    const onVis = () => {
      if (document.visibilityState === 'hidden' && startedRef.current) {
        const s = Math.floor((Date.now() - startedRef.current) / 1000);
        if (s > 3) sendDuration(s);
      }
    };

    const onUnload = () => {
      if (startedRef.current) {
        const s = Math.floor((Date.now() - startedRef.current) / 1000);
        if (s > 3) sendDuration(s);
      }
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onUnload);

    const interval = window.setInterval(() => {
      if (startedRef.current && document.visibilityState === 'visible') {
        const s = Math.floor((Date.now() - startedRef.current) / 1000);
        if (s > 0 && s % 30 === 0) sendDuration(s);
      }
    }, 30_000);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onUnload);
      window.clearInterval(interval);
    };
  }, [data.tour.id]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!loadingOverlay && !cameFromRef.current) {
      setShowNavHint(true);
    }
  }, [loadingOverlay]);

  useEffect(() => {
    if (loadingOverlay || !viewerReady) return;
    const nudgeTimer = window.setTimeout(() => {
      if (!shareNudgeDismissedRef.current) {
        setShowShareNudge(true);
        window.setTimeout(() => {
          setShowShareNudge(false);
          shareNudgeDismissedRef.current = true;
        }, 10_000);
      }
    }, 90_000);
    return () => window.clearTimeout(nudgeTimer);
  }, [loadingOverlay, viewerReady]);

  const hasLite = Boolean(data.tour.splat_url_lite);

  const apiRef = useRef<SplatViewerAPI | null>(null);

  // Lê tour de origem da query string (ex: ?from=<tour_id>)
  // e busca o next_cam_position do waypoint deste tour que aponta de volta para a origem
  const entryCamRef = useRef<{ position: number[]; target: number[] } | null>(null);
  const entryCamResolvedRef = useRef(false);
  if (!entryCamResolvedRef.current && typeof window !== 'undefined') {
    entryCamResolvedRef.current = true;
    const fromTourId = new URLSearchParams(window.location.search).get('from');
    if (fromTourId) {
      const wp = data.waypoints.find((w) => w.next_tour_id === fromTourId);
      if (wp?.next_cam_position && wp?.next_cam_target) {
        entryCamRef.current = {
          position: wp.next_cam_position,
          target: wp.next_cam_target,
        };
      }
    }
  }

  const onReady = useCallback(
    (viewerApi: SplatViewerAPI) => {
      setApi(viewerApi);
      apiRef.current = viewerApi;
      setViewerReady(true);
      const cam = entryCamRef.current;
      if (cam) {
        viewerApi.setCameraState({ position: cam.position, target: cam.target });
      } else {
        const p = data.tour.camera_start_position;
        const tgt = data.tour.camera_start_target;
        if (p && tgt) {
          viewerApi.setCameraState({ position: p, target: tgt });
        }
      }

      if (cameFromRef.current) {
        if (transitionTimerRef.current !== null) {
          window.clearTimeout(transitionTimerRef.current);
          transitionTimerRef.current = null;
        }
        setShowTransitionLoading(false);
        window.setTimeout(() => setEntryOverlayVisible(false), 200);
      }
    },
    [data.tour.camera_start_position, data.tour.camera_start_target, data.waypoints]
  );

  /** Após lite -> full: restaura câmera correta. */
  useEffect(() => {
    if (!hasLite || detailLoading) return;
    if (!api) return;
    const cam = entryCamRef.current;
    if (cam) {
      api.setCameraState({ position: cam.position, target: cam.target });
      return;
    }
    const p = data.tour.camera_start_position;
    const tgt = data.tour.camera_start_target;
    if (!p || !tgt) return;
    api.setCameraState({ position: p, target: tgt });
  }, [hasLite, detailLoading, api, data.tour.camera_start_position, data.tour.camera_start_target]);

  const onProgress = useCallback(
    (p: number) => {
      setLoadProgress(p);
      if (!hasLite && p >= 100) {
        window.setTimeout(() => setLoadingOverlay(false), 400);
      }
    },
    [hasLite]
  );

  const onLiteReady = useCallback(() => {
    setLoadProgress(100);
    window.setTimeout(() => setLoadingOverlay(false), 200);
    setDetailLoading(true);
  }, []);

  const onFullReady = useCallback(() => {
    setDetailLoading(false);
  }, []);

  const onViewerError = useCallback(
    (err: Error) => {
      setLoadingOverlay(false);
      setDetailLoading(false);
      if (hasLite && err.message === 'LITE_TIMEOUT') {
        toast.message(t('lite_load_error'));
      }
    },
    [hasLite, t]
  );

  const onMoveSpeedChange = useCallback((s: MoveSpeedLevel) => {
    setMoveSpeed(s);
  }, []);

  const handleScreenshot = useCallback(async () => {
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
  }, [api]);

  const cinematicWaypoints = data.waypoints.filter((w) => !w.next_tour_id);
  const showCinematic =
    data.tour.has_cinematic_mode && cinematicWaypoints.length >= 2;

  return (
    <div className="relative min-h-dvh w-full bg-background">
      <LoadingScreen
        visible={loadingOverlay}
        progress={loadProgress}
        coverImageUrl={data.tour.foto_capa_url}
        tourTitle={data.tour.titulo}
      />
      <NavigationHint visible={showNavHint} onDismiss={() => setShowNavHint(false)} />
      <div className="absolute inset-0">
        <SplatViewer
          splatUrl={data.tour.splat_url}
          splatUrlLite={data.tour.splat_url_lite}
          cameraUpInverted={data.tour.camera_up_inverted}
          splatRotationDeg={data.tour.splat_rotation_deg}
          moveSpeedLevel={moveSpeed}
          onReady={onReady}
          onProgress={onProgress}
          onLiteReady={onLiteReady}
          onFullReady={onFullReady}
          onError={onViewerError}
        />
      </div>
      <HotspotMarkers api={api} hotspots={data.hotspots} />
      <MiniMap api={api} hotspots={data.hotspots} open={minimapOpen} />
      {showCinematic ? <CinematicPlayer api={api} waypoints={cinematicWaypoints} /> : null}
      <ElevationSlider api={api} />
      <PortaButtons api={api} waypoints={data.waypoints} />
      <WaypointLabels api={api} waypoints={data.waypoints} />
      <ProximityPortaTransition
        api={api}
        waypoints={data.waypoints}
        currentTourId={data.tour.id}
        viewerReady={viewerReady}
      />
      <ViewerControls
        api={api}
        onInfo={() => setInfoOpen(true)}
        moveSpeed={moveSpeed}
        onMoveSpeedChange={onMoveSpeedChange}
        onShare={() => {
          setShowShareNudge(false);
          setShareOpen(true);
        }}
        isFullscreen={fullscreen}
        minimapOpen={minimapOpen}
        onMinimapToggle={() => setMinimapOpen((v) => !v)}
        onToggleFullscreen={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
        }}
      />
      <InfoPanel open={infoOpen} onOpenChange={setInfoOpen} data={data} />
      <ShareTourDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={shareUrl}
        onScreenshot={handleScreenshot}
      />
      <ShareNudge
        visible={showShareNudge}
        onShare={() => {
          setShowShareNudge(false);
          setShareOpen(true);
          shareNudgeDismissedRef.current = true;
        }}
        onDismiss={() => {
          setShowShareNudge(false);
          shareNudgeDismissedRef.current = true;
        }}
      />
      {phone ? <WhatsAppFloating phone={phoneRaw} message={messageForLink} tourId={data.tour.id} /> : null}
      {detailLoading ? (
        <div
          className="pointer-events-none fixed bottom-16 right-4 z-30 rounded-md border border-border-strong bg-surface-elevated/95 px-3 py-1.5 text-xs text-text-secondary shadow-md-dark sm:bottom-20"
          role="status"
          aria-live="polite"
        >
          {t('detail_loading_badge')}
        </div>
      ) : null}
      <div className="pointer-events-none fixed left-1/2 top-3 z-10 -translate-x-1/2 rounded-md glass px-3 py-1.5 text-[10px] text-text-muted opacity-50 transition-opacity duration-200 hover:opacity-80 sm:text-xs">
        Powered by Imerso
      </div>
      {data.imobiliaria.logo_url ? (
        <div className="pointer-events-none fixed left-3 top-16 z-20 sm:left-4 sm:top-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imobiliaria.logo_url} alt="" className="max-h-10 w-auto opacity-90 sm:max-h-12" />
        </div>
      ) : null}

      {!loadingOverlay ? (
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className={`fixed left-3 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-sm transition-opacity hover:bg-black/70 sm:left-4 ${
            data.imobiliaria.logo_url ? 'top-28 sm:top-32' : 'top-16 sm:top-20'
          }`}
          aria-label="Ver informações do imóvel"
        >
          {data.corretor?.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.corretor.foto_url}
              alt=""
              className="h-6 w-6 shrink-0 rounded-full border border-white/20 object-cover"
            />
          ) : (
            <div className="h-6 w-6 shrink-0 rounded-full border border-white/20 bg-white/10" />
          )}
          <div className="flex flex-col leading-none">
            <span className="max-w-[140px] truncate text-[11px] font-medium text-white">
              {data.corretor?.nome ?? data.imobiliaria.nome}
            </span>
            <span className="max-w-[140px] truncate text-[10px] text-white/50">{data.tour.titulo}</span>
          </div>
        </button>
      ) : null}

      <PropertySummaryCard tour={data.tour} onExpand={() => setInfoOpen(true)} visible={!loadingOverlay} />

      <AmbientAudio audioUrl={null} />

      {cameFromRef.current ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[9997] bg-black"
          style={{
            opacity: entryOverlayVisible ? 1 : 0,
            transition: 'opacity 600ms ease-out',
          }}
        />
      ) : null}

      {showTransitionLoading ? (
        <div
          className="pointer-events-none fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-black"
          role="status"
          aria-live="polite"
        >
          <div className="animate-pulse-soft">
            <Image src="/logo-mark.svg" alt="Imerso" width={56} height={56} priority />
          </div>
          <p className="text-sm font-medium text-white/80">
            {`Carregando ${data.tour.titulo}…`}
          </p>
        </div>
      ) : null}

    </div>
  );
}
