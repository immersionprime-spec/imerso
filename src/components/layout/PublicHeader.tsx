'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher';
import { Button } from '@/components/ui/Button';
import { buildWhatsAppUrl, normalizeWhatsAppDigits } from '@/lib/utils/whatsapp';
import { cn } from '@/lib/utils/cn';

function founderCtaUrl(message: string): string | null {
  const raw = process.env.NEXT_PUBLIC_WHATSAPP_FOUNDER?.trim();
  if (!raw) return null;
  const d = normalizeWhatsAppDigits(raw);
  if (d.length < 10) return null;
  return buildWhatsAppUrl(d, message);
}

function homeAnchor(locale: string, fragment: string): string {
  return `/${locale}#${fragment}`;
}

export function PublicHeader() {
  const locale = useLocale();
  const t = useTranslations('landing');
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navClass =
    'text-sm font-medium text-text-secondary transition-colors duration-200 hover:text-text-primary';
  const ctaMessage = t('nav.cta');
  const wa = founderCtaUrl('Olá! Vim pelo site Imerso e gostaria de falar sobre um tour 3D.');

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-200',
        scrolled
          ? 'bg-[rgba(15,23,41,0.85)] backdrop-blur-md border-b border-border'
          : 'bg-transparent border-b border-transparent'
      )}
    >
      <div className="container-imerso flex h-[60px] items-center justify-between gap-4 py-3.5">
        <Link href="/" className="flex items-center shrink-0">
          <Image src="/logo-full.svg" alt="Imerso" width={160} height={34} priority className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Principal">
          <a className={navClass} href={homeAnchor(locale, 'como-funciona')}>
            {t('nav.how')}
          </a>
          <a className={navClass} href={homeAnchor(locale, 'casos')}>
            {t('nav.cases')}
          </a>
          <a className={navClass} href={homeAnchor(locale, 'faq')}>
            {t('nav.faq')}
          </a>
          <LocaleSwitcher />
          {wa ? (
            <Button variant="primary" size="md" asChild>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M17.6 6.3A7.85 7.85 0 0 0 12.05 4a7.92 7.92 0 0 0-6.82 11.93L4 20l4.2-1.1A7.93 7.93 0 0 0 12.05 20h.01a7.92 7.92 0 0 0 5.54-13.7zM12.05 18.5a6.6 6.6 0 0 1-3.36-.93l-.24-.14-2.5.65.67-2.43-.16-.25a6.59 6.59 0 1 1 12.2-3.48 6.55 6.55 0 0 1-6.61 6.58z" />
                </svg>
                {ctaMessage}
              </a>
            </Button>
          ) : (
            <Button variant="primary" size="md" asChild>
              <a href={homeAnchor(locale, 'solicitar')} className="flex items-center gap-2">
                {t('hero.cta_primary')}
              </a>
            </Button>
          )}
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <LocaleSwitcher />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="border-b border-border bg-[rgba(15,23,41,0.92)] backdrop-blur-md px-4 pb-4 md:hidden">
          <div className="flex flex-col gap-3 pt-2">
            <a
              className="py-2 text-sm text-text-primary"
              href={homeAnchor(locale, 'como-funciona')}
              onClick={() => setOpen(false)}
            >
              {t('nav.how')}
            </a>
            <a
              className="py-2 text-sm text-text-primary"
              href={homeAnchor(locale, 'casos')}
              onClick={() => setOpen(false)}
            >
              {t('nav.cases')}
            </a>
            <a
              className="py-2 text-sm text-text-primary"
              href={homeAnchor(locale, 'faq')}
              onClick={() => setOpen(false)}
            >
              {t('nav.faq')}
            </a>
            {wa ? (
              <Button variant="primary" size="md" className="w-full" asChild>
                <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                  {ctaMessage}
                </a>
              </Button>
            ) : (
              <Button variant="primary" size="md" className="w-full" asChild>
                <a href={homeAnchor(locale, 'solicitar')} onClick={() => setOpen(false)}>
                  {t('hero.cta_primary')}
                </a>
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
