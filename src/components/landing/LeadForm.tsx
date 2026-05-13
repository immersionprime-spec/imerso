'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { publicLeadSchema } from '@/lib/validation/public';
import type { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';

type LeadValues = z.input<typeof publicLeadSchema>;

export function LeadForm() {
  const t = useTranslations('landing.lead_form');

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<LeadValues>({
    resolver: zodResolver(publicLeadSchema),
    defaultValues: {
      nome: '',
      whatsapp: '',
      email: '',
      tipo_imovel: undefined,
      cidade: '',
      mensagem: '',
      consent: false,
    },
  });

  async function onSubmit(values: LeadValues) {
    const res = await fetch('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    const data = (await res.json().catch(() => null)) as
      | { whatsappRedirectUrl?: string; error?: { message?: string } }
      | null;

    if (!res.ok) {
      toast.error(t('error_toast'));
      return;
    }

    if (data?.whatsappRedirectUrl) {
      toast.success(t('success_toast'));
      reset();
      window.open(data.whatsappRedirectUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast.error(t('error_toast'));
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-8 shadow-md"
      noValidate
    >
      <h2 className="font-display text-2xl font-semibold text-text-primary">{t('title')}</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="lead-nome" className="text-xs font-medium text-text-secondary">
            {t('name')} *
          </label>
          <Input id="lead-nome" autoComplete="name" error={!!errors.nome} {...register('nome')} />
          {errors.nome ? (
            <p className="text-xs text-error">{errors.nome.message}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="lead-wa" className="text-xs font-medium text-text-secondary">
            {t('whatsapp')} *
          </label>
          <Input
            id="lead-wa"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+55 (47) 99999-9999"
            error={!!errors.whatsapp}
            {...register('whatsapp')}
          />
          {errors.whatsapp ? (
            <p className="text-xs text-error">{errors.whatsapp.message}</p>
          ) : null}
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="lead-email" className="text-xs font-medium text-text-secondary">
            {t('email')}
          </label>
          <Input id="lead-email" type="email" autoComplete="email" error={!!errors.email} {...register('email')} />
          {errors.email ? (
            <p className="text-xs text-error">{errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="lead-tipo" className="text-xs font-medium text-text-secondary">
            {t('tipo')}
          </label>
          <select
            id="lead-tipo"
            className="flex h-10 w-full rounded-md border border-border bg-surface-elevated px-4 py-2 font-sans text-sm text-text-primary outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
            {...register('tipo_imovel')}
          >
            <option value="">{t('tipo_placeholder')}</option>
            <option value="apartamento">{t('tipo_apartamento')}</option>
            <option value="casa">{t('tipo_casa')}</option>
            <option value="comercial">{t('tipo_comercial')}</option>
            <option value="terreno">{t('tipo_terreno')}</option>
            <option value="outro">{t('tipo_outro')}</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="lead-cidade" className="text-xs font-medium text-text-secondary">
            {t('cidade')}
          </label>
          <Input id="lead-cidade" placeholder="Balneário Camboriú" {...register('cidade')} />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="lead-msg" className="text-xs font-medium text-text-secondary">
          {t('mensagem')}
        </label>
        <Textarea
          id="lead-msg"
          rows={3}
          className="min-h-[86px] resize-y"
          {...register('mensagem')}
        />
      </div>

      <div className="flex items-start gap-3">
        <Controller
          name="consent"
          control={control}
          render={({ field }) => (
            <input
              id="lead-consent"
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              checked={Boolean(field.value)}
              onChange={(e) => field.onChange(e.target.checked)}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <label htmlFor="lead-consent" className="cursor-pointer text-xs text-text-secondary">
          {t.rich('consent_rich', {
            privacy: (chunks) => (
              <Link href="/privacidade" className="text-primary underline underline-offset-2 hover:text-primary-hover">
                {chunks}
              </Link>
            ),
          })}
        </label>
      </div>
      {errors.consent ? (
        <p className="text-xs text-error">{errors.consent.message}</p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
