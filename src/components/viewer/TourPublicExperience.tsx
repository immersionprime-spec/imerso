'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

interface TourPublicExperienceProps {
  data: PublicTourPayload;
  shareUrl: string;
}

export function TourPublicExperience({ data, shareUrl }: TourPublicExperienceProps) {
  const t = useTranslations('viewer');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadingOverlay, setLoadingOverlay] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [api, setApi] = useState<SplatViewerAPI | null>(null);
  const [moveSpeed, setMoveSpeed] = useState<MoveSpeedLevel>('medium');
  const [infoOpen, setInfoOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const startedRef = useRef<number | null>(null);

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

  const hasLite = Boolean(data.tour.splat_url_lite);

  const apiRef = useRef<SplatViewerAPI | null>(null);

  // Lê câmera de entrada da query string uma vez (transição de porta)
  const entryCamRef = useRef<{ position: number[]; target: number[] } | null>(null);
  const entryCamParsedRef = useRef(false);
  if (!entryCamParsedRef.current && typeof window !== 'undefined') {
    entryCamParsedRef.current = true;
    const qs = new URLSearchParams(window.location.search);
    const cpx = Number(qs.get('cpx'));
    const cpy = Number(qs.get('cpy'));
    const cpz = Number(qs.get('cpz'));
    const ctx = Number(qs.get('ctx'));
    const cty = Number(qs.get('cty'));
    const ctz = Number(qs.get('ctz'));
    if ([cpx, cpy, cpz, ctx, cty, ctz].every(Number.isFinite)) {
      entryCamRef.current = { position: [cpx, cpy, cpz], target: [ctx, cty, ctz] };
    }
  }

  const onReady = useCallback(
    (viewerApi: SplatViewerAPI) => {
      setApi(viewerApi);
      apiRef.current = viewerApi;
      // Se não tem câmera de entrada via QS, aplica câmera padrão do tour
      if (!entryCamRef.current) {
        const p = data.tour.camera_start_position;
        const tgt = data.tour.camera_start_target;
        if (p && tgt) {
          viewerApi.setCameraState({ position: p, target: tgt });
        }
      }
      // Se tem QS, aguarda onFullReady para aplicar (bounds precisam existir)
    },
    [data.tour.camera_start_position, data.tour.camera_start_target]
  );

  /** Após lite -> full sem câmera de entrada: restaura câmera padrão do tour. */
  useEffect(() => {
    if (!hasLite || detailLoading) return;
    if (!api) return;
    // Se tem câmera de entrada pendente, onFullReady cuida disso
    if (entryCamRef.current) return;
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
    // Usa ref diretamente — api (state) pode ser null no closure
    const v = apiRef.current;
    if (v && entryCamRef.current) {
      const cam = entryCamRef.current;
      entryCamRef.current = null;
      // Pequeno delay para bounds estabilizarem após o full load
      window.setTimeout(() => v.setCameraState(cam), 80);
    }
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

  const cinematicWaypoints = data.waypoints.filter((w) => !w.next_tour_id);
  const showCinematic =
    data.tour.has_cinematic_mode && cinematicWaypoints.length >= 2;

  return (
    <div className="relative min-h-dvh w-full bg-background">
      <LoadingScreen visible={loadingOverlay} progress={loadProgress} />
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
      <ProximityPortaTransition api={api} waypoints={data.waypoints} />
      <ViewerControls
        api={api}
        onInfo={() => setInfoOpen(true)}
        moveSpeed={moveSpeed}
        onMoveSpeedChange={onMoveSpeedChange}
        onShare={() => setShareOpen(true)}
        isFullscreen={fullscreen}
        minimapOpen={minimapOpen}
        onMinimapToggle={() => setMinimapOpen((v) => !v)}
        onToggleFullscreen={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
        }}
      />
      <InfoPanel open={infoOpen} onOpenChange={setInfoOpen} data={data} />
      <ShareTourDialog open={shareOpen} onOpenChange={setShareOpen} url={shareUrl} />
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
      <div className="pointer-events-none fixed bottom-3 left-3 z-20 rounded-md glass px-3 py-1.5 text-[10px] text-text-muted sm:text-xs">
        Powered by Imerso
      </div>
      {data.imobiliaria.logo_url ? (
        <div className="pointer-events-none fixed left-3 top-16 z-20 sm:left-4 sm:top-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imobiliaria.logo_url} alt="" className="max-h-10 w-auto opacity-90 sm:max-h-12" />
        </div>
      ) : null}

    </div>
  );
}
