'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { buildWhatsAppUrl, normalizeWhatsAppDigits } from '@/lib/utils/whatsapp';
import { getOrCreateFingerprint } from '@/lib/utils/fingerprint';

interface WhatsAppFloatingProps {
  phone: string;
  message: string;
  tourId: string;
}

export function WhatsAppFloating({ phone, message, tourId }: WhatsAppFloatingProps) {
  const t = useTranslations('viewer');
  const [nudge, setNudge] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const firstClickRef = useRef(false);

  useEffect(() => {
    if (!normalizeWhatsAppDigits(phone)) return;
    const interval = window.setInterval(() => {
      setNudge(true);
      window.setTimeout(() => setNudge(false), 1400);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [phone]);

  const digits = normalizeWhatsAppDigits(phone);
  if (!digits) return null;

  const href = buildWhatsAppUrl(digits, message);

  function handleClick(e: React.MouseEvent) {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    if (isTouch && !firstClickRef.current) {
      e.preventDefault();
      firstClickRef.current = true;
      setShowPreview(true);
      window.setTimeout(() => {
        setShowPreview(false);
        firstClickRef.current = false;
      }, 5000);
      return;
    }

    firstClickRef.current = false;
    setShowPreview(false);
    void (async () => {
      const fingerprint = await getOrCreateFingerprint();
      void fetch('/api/public/analytics/track-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourId, fingerprint }),
        keepalive: true,
      });
    })();
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      className="fixed right-5 z-30 max-w-[200px] sm:right-6"
      style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {showPreview ? (
        <div
          className="mb-2 max-w-[220px] rounded-xl border border-white/15 bg-black/80 px-3 py-2.5 text-xs text-white/90 shadow-lg backdrop-blur-md"
          role="tooltip"
        >
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-white/50">
            {t('whatsapp_preview_title')}
          </p>
          <p className="leading-relaxed">{message}</p>
          <p className="mt-2 text-[10px] text-white/50">{t('whatsapp_preview_hint')} ↓</p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        aria-label={t('whatsapp_cta')}
        title={message}
        className="flex h-14 w-full items-center gap-2.5 rounded-full px-4 text-sm font-semibold text-white transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        style={{
          background: 'linear-gradient(135deg, #25D366, #128C7E)',
          boxShadow: nudge
            ? '0 8px 24px rgba(37,211,102,0.45), 0 0 0 10px rgba(37,211,102,0.14)'
            : '0 8px 24px rgba(37,211,102,0.4)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
          <path d="M17.6 6.3A7.85 7.85 0 0 0 12.05 4a7.92 7.92 0 0 0-6.82 11.93L4 20l4.2-1.1A7.93 7.93 0 0 0 12.05 20h.01a7.92 7.92 0 0 0 5.54-13.7zM12.05 18.5a6.6 6.6 0 0 1-3.36-.93l-.24-.14-2.5.65.67-2.43-.16-.25a6.59 6.59 0 1 1 12.2-3.48 6.55 6.55 0 0 1-6.61 6.58z" />
        </svg>
        <span className="inline truncate">{t('whatsapp_cta')}</span>
      </button>
    </div>
  );
}
