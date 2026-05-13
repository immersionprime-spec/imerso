'use client';

import { LogOut, Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

type AdminTopbarProps = {
  email: string;
  onMenuClick?: () => void;
};

export function AdminTopbar({ email, onMenuClick }: AdminTopbarProps) {
  const t = useTranslations('admin.topbar');
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/painel/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-6 py-4 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t('open_menu')}
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="hidden font-mono text-xs uppercase tracking-widest text-text-muted sm:block">
          Painel Admin
        </div>
        <input
          readOnly
          placeholder="⌘K  Buscar tours, leads…"
          className="ml-auto hidden h-9 w-64 max-w-full rounded-md border border-border bg-surface px-3 font-sans text-xs text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary/20 md:block"
          aria-label="Busca (em breve)"
        />
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden text-sm text-text-muted sm:inline">
          <span className="hidden lg:inline">{t('signed_in_as')} </span>
          <span className="font-medium text-text-primary">{email}</span>
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => void handleLogout()}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          {t('logout')}
        </Button>
      </div>
    </header>
  );
}
