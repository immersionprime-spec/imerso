'use client';

import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';

export function LgpdRequestForm() {
  const t = useTranslations('legal.lgpd');

  const mail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nome = String(fd.get('nome') ?? '');
    const email = String(fd.get('email') ?? '');
    const tipo = String(fd.get('tipo') ?? '');
    const desc = String(fd.get('desc') ?? '');
    if (!mail) return;
    const subject = encodeURIComponent(`LGPD — ${tipo}`);
    const body = encodeURIComponent(
      `Nome: ${nome}\nE-mail: ${email}\nTipo: ${tipo}\n\n${desc}`
    );
    window.location.href = `mailto:${mail}?subject=${subject}&body=${body}`;
  }

  if (!mail) {
    return (
      <p className="rounded-md border border-border bg-surface-elevated p-4 text-sm text-text-muted">
        {/* founder configures NEXT_PUBLIC_CONTACT_EMAIL */}
        TODO(founder): defina NEXT_PUBLIC_CONTACT_EMAIL para habilitar o formulário por e-mail.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4 rounded-lg border border-border bg-surface-elevated p-6">
      <div className="space-y-1">
        <label htmlFor="lgpd-nome" className="text-sm font-medium text-text-secondary">
          {t('form_name')}
        </label>
        <Input id="lgpd-nome" name="nome" required autoComplete="name" />
      </div>
      <div className="space-y-1">
        <label htmlFor="lgpd-email" className="text-sm font-medium text-text-secondary">
          {t('form_email')}
        </label>
        <Input id="lgpd-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-1">
        <label htmlFor="lgpd-tipo" className="text-sm font-medium text-text-secondary">
          {t('form_type')}
        </label>
        <select
          id="lgpd-tipo"
          name="tipo"
          required
          className="flex h-10 w-full rounded-md border border-border bg-background px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <option value="acesso">{t('opt_acesso')}</option>
          <option value="correcao">{t('opt_correcao')}</option>
          <option value="eliminacao">{t('opt_eliminacao')}</option>
          <option value="portabilidade">{t('opt_portabilidade')}</option>
          <option value="outro">{t('opt_outro')}</option>
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="lgpd-desc" className="text-sm font-medium text-text-secondary">
          {t('form_desc')}
        </label>
        <Textarea id="lgpd-desc" name="desc" rows={5} required />
      </div>
      <Button type="submit" variant="primary">
        {t('form_submit')}
      </Button>
    </form>
  );
}
