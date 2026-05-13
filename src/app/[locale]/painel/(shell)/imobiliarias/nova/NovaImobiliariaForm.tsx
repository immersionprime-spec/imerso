'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { slugify } from '@/lib/utils/slug';

export function NovaImobiliariaForm() {
  const t = useTranslations('admin.imobiliarias');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [cidade, setCidade] = useState('Balneário Camboriú');
  const [estado, setEstado] = useState('SC');

  function onNomeBlur() {
    if (!slugTouched && nome.trim()) {
      setSlug(slugify(nome));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/imobiliarias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          slug: slug.trim(),
          whatsapp_principal: whatsapp.trim(),
          email_contato: email.trim() || undefined,
          cidade: cidade.trim() || undefined,
          estado: estado.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error?.message ?? t('error_save'));
        return;
      }
      toast.success(t('saved'));
      router.push(`/painel/imobiliarias/${j.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-6">
      <div>
        <label className="mb-1 block text-sm text-text-secondary" htmlFor="nome">
          {t('field_nome')} *
        </label>
        <Input
          id="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={onNomeBlur}
          required
          minLength={2}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-text-secondary" htmlFor="slug">
          {t('field_slug')} *
        </label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-text-secondary" htmlFor="wa">
          {t('field_whatsapp')} *
        </label>
        <Input id="wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required placeholder="+5547..." />
      </div>
      <div>
        <label className="mb-1 block text-sm text-text-secondary" htmlFor="email">
          {t('field_email')}
        </label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-text-secondary" htmlFor="cidade">
            {t('field_cidade')}
          </label>
          <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-text-secondary" htmlFor="estado">
            {t('field_estado')}
          </label>
          <Input id="estado" value={estado} onChange={(e) => setEstado(e.target.value)} maxLength={4} />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? t('saving') : t('submit')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/painel/imobiliarias')} disabled={loading}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
