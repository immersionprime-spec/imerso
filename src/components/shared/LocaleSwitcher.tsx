'use client';

import { useLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';

const localeLabels: Record<string, string> = {
  pt: 'PT',
  en: 'EN',
  es: 'ES',
};

export function LocaleSwitcher() {
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <div
      className="flex gap-1 rounded-md border border-border-strong bg-surface-elevated p-1"
      role="navigation"
      aria-label="Language"
    >
      {routing.locales.map((loc) => (
        <Link
          key={loc}
          href={pathname}
          locale={loc}
          className={cn(
            'rounded-sm px-3 py-1 text-sm font-medium transition-all duration-200',
            loc === locale
              ? 'bg-primary text-primary-foreground shadow-glow-primary'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          )}
        >
          {localeLabels[loc] ?? loc.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
