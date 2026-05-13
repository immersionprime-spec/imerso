'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';

type HeroProps = {
  demoPath?: string;
};

export function Hero({ demoPath }: HeroProps) {
  const locale = useLocale();
  const t = useTranslations('landing.hero_visual');
  const tHero = useTranslations('landing.hero');
  const base = `/${locale}`;

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 20% 30%, rgba(79,142,247,.22), transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(212,165,116,.10), transparent 55%), #0A0E1A',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(10,14,26,.5) 70%, #0A0E1A 100%)',
        }}
      />

      <div className="relative max-w-4xl mx-auto px-8 text-center animate-fade-up">
        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/12 border border-primary/30 text-primary text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {t('eyebrow')}
        </span>

        <h1
          className="font-display font-semibold tracking-tight text-text-primary mb-5"
          style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', lineHeight: 1.05, letterSpacing: '-0.02em' }}
        >
          {t('headline_1')}
          <br />
          {t('headline_2a')}{' '}
          <span style={{ color: '#D4A574' }}>{t('headline_2b')}</span>
        </h1>

        <p className="text-text-secondary text-lg leading-relaxed max-w-2xl mx-auto mb-10">{t('sub')}</p>

        <div className="flex items-center justify-center gap-3 flex-wrap mb-16">
          <Button variant="primary" size="lg" asChild>
            <a href={`${base}#solicitar`} className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.6 6.3A7.85 7.85 0 0 0 12.05 4a7.92 7.92 0 0 0-6.82 11.93L4 20l4.2-1.1A7.93 7.93 0 0 0 12.05 20h.01a7.92 7.92 0 0 0 5.54-13.7zM12.05 18.5a6.6 6.6 0 0 1-3.36-.93l-.24-.14-2.5.65.67-2.43-.16-.25a6.59 6.59 0 1 1 12.2-3.48 6.55 6.55 0 0 1-6.61 6.58z" />
              </svg>
              {tHero('cta_primary')}
            </a>
          </Button>
          {demoPath ? (
            <Button variant="ghost" size="lg" asChild>
              <Link href={`/${demoPath}`}>{t('cta_demo')}</Link>
            </Button>
          ) : (
            <Button variant="ghost" size="lg" asChild>
              <a href={`${base}#demo`}>{t('cta_demo')}</a>
            </Button>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 text-xs text-text-muted flex-wrap">
          <span>✓ {t('proof_1')}</span>
          <span>✓ {t('proof_2')}</span>
          <span>✓ {t('proof_3')}</span>
        </div>
      </div>
    </section>
  );
}
