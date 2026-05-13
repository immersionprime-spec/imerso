'use client';

import { useState, type ReactNode } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminTopbar } from '@/components/layout/AdminTopbar';
import { cn } from '@/lib/utils/cn';

type AdminShellProps = {
  email: string;
  children: ReactNode;
};

export function AdminShell({ email, children }: AdminShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
      <div
        className={cn(
          'fixed inset-0 z-40 bg-overlay/60 backdrop-blur-sm transition-opacity lg:hidden',
          mobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        aria-hidden={!mobileNavOpen}
        onClick={() => setMobileNavOpen(false)}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <AdminSidebar onNavigate={() => setMobileNavOpen(false)} />
        <div className="mt-auto border-t border-border p-4 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-semibold text-white">
            {(email?.charAt(0) ?? '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text-primary">{email?.split('@')[0] ?? '—'}</div>
            <div className="text-xs text-text-muted">Super Admin</div>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
        <AdminTopbar email={email} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-8 max-w-[1280px]">{children}</main>
      </div>
    </div>
  );
}
