'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function TourPasswordForm({
  imobiliaria,
  tourSlug,
}: {
  imobiliaria: string;
  tourSlug: string;
}) {
  const t = useTranslations('viewer.password_required');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/public/tours/${imobiliaria}/${tourSlug}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error?.message ?? t('error'));
        return;
      }
      router.push(`/${imobiliaria}/${tourSlug}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8">
      <h1 className="font-display text-xl font-semibold text-text-primary">{t('title')}</h1>
      <p className="text-sm text-text-secondary">{t('subtitle')}</p>
      <Input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        aria-label={t('subtitle')}
      />
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? '…' : t('submit')}
      </Button>
    </form>
  );
}
