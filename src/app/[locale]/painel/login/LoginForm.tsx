'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { loginSuperAdmin, type LoginState } from './actions';

export function LoginForm() {
  const t = useTranslations('admin.login');
  const [state, formAction, isPending] = useActionState(loginSuperAdmin, null as LoginState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-text-secondary">
          {t('email')}
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required disabled={isPending} />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-text-secondary">
          {t('password')}
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </div>
      {state?.ok === false ? (
        <p className="text-sm text-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t('submitting') : t('submit')}
      </Button>
      <Link href="/" className="text-center text-sm text-text-muted hover:text-primary">
        {t('back_home')}
      </Link>
    </form>
  );
}
