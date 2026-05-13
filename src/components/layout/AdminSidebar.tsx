'use client';

import { Building2, Home, LayoutDashboard, Mail, Settings } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';

const nav = [
  { href: '/painel/dashboard', key: 'dashboard' as const, icon: LayoutDashboard },
  { href: '/painel/imobiliarias', key: 'imobiliarias' as const, icon: Building2 },
  { href: '/painel/tours', key: 'tours' as const, icon: Home },
  { href: '/painel/leads', key: 'leads' as const, icon: Mail, disabled: true },
  { href: '/painel/configuracoes', key: 'settings' as const, icon: Settings, disabled: true },
];

type AdminSidebarProps = {
  onNavigate?: () => void;
};

export function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('admin.sidebar');

  return (
    <>
      <div className="border-b border-border px-5 py-5">
        <Image src="/logo-full.svg" alt="Imerso" width={140} height={30} className="h-7 w-auto" />
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label={t('aria')}>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{t('section')}</p>
        {nav.map(({ href, key, icon: Icon, disabled }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const content = (
            <span className="flex items-center gap-3">
              <Icon
                size={18}
                className={cn('shrink-0', active ? 'text-primary' : 'text-text-muted')}
                strokeWidth={1.75}
                aria-hidden
              />
              {t(key)}
            </span>
          );
          if (disabled) {
            return (
              <span
                key={href}
                className={cn(
                  'flex items-center rounded-md border-l-2 border-transparent px-3 py-2.5 text-sm text-text-muted opacity-50',
                  'cursor-not-allowed select-none'
                )}
                title={t('soon')}
              >
                {content}
              </span>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'flex items-center rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition-all duration-200',
                active
                  ? 'border-primary bg-surface-elevated text-text-primary'
                  : 'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
