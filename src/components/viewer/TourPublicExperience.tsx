'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { PublicTourPayload } from '@/types/public-tour';
import { getOrCreateFingerprint } from '@/lib/utils/fingerprint';
import { normalizeWhatsAppDigits } from '@/lib/utils/whatsapp';
import { SplatViewer, type SplatViewerAPI } from './SplatViewer';
import { LoadingScreen } from './LoadingScreen';
import { WhatsAppFloating } from './WhatsAppFloating';

interface TourPublicExperienceProps {
  data: PublicTourPayload;
  shareUrl: string;
}

export function TourPublicExperience({ data }: TourPublicExperienceProps) {
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
  const viewerApiRef = useRef<SplatViewerAPI | null>(null);
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

  const hasLite = Boolean(data.tour.splat_url_lite);

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
      viewerApiRef.current = viewerApi;
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
    },
    [data.tour.camera_start_position, data.tour.camera_start_target]
  );

  useEffect(() => {
    if (!hasLite || detailLoading) return;
    const api = viewerApiRef.current;
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
  }, [hasLite, detailLoading, data.tour.camera_start_position, data.tour.camera_start_target]);

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

  return (
    <div className="relative min-h-dvh w-full bg-background">
      <LoadingScreen
        visible={loadingOverlay}
        progress={loadProgress}
        coverImageUrl={data.tour.foto_capa_url}
        tourTitle={data.tour.titulo}
      />
      <div className="absolute inset-0">
        <SplatViewer
          splatUrl={data.tour.splat_url}
          splatUrlLite={data.tour.splat_url_lite}
          cameraUpInverted={data.tour.camera_up_inverted}
          splatRotationDeg={data.tour.splat_rotation_deg}
          moveSpeedLevel="medium"
          onReady={onReady}
          onProgress={onProgress}
          onLiteReady={onLiteReady}
          onFullReady={onFullReady}
          onError={onViewerError}
        />
      </div>
      {phone ? <WhatsAppFloating phone={phoneRaw} message={messageForLink} tourId={data.tour.id} /> : null}
    </div>
  );
}
