'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type Initial = {
  id: string;
  nome: string;
  slug: string;
  whatsapp_principal: string | null;
  email_contato: string | null;
  cidade: string | null;
  estado: string | null;
  cor_primaria: string | null;
  logo_url: string | null;
  cnpj: string | null;
};

export function EditImobiliariaForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.imobiliarias');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState(initial.nome);
  const [slug, setSlug] = useState(initial.slug);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp_principal ?? '');
  const [email, setEmail] = useState(initial.email_contato ?? '');
  const [cidade, setCidade] = useState(initial.cidade ?? '');
  const [estado, setEstado] = useState(initial.estado ?? '');
  const [corPrimaria, setCorPrimaria] = useState(initial.cor_primaria ?? '#4F8EF7');
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? '');
  const [cnpj, setCnpj] = useState(initial.cnpj ?? '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/imobiliarias/${initial.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          slug: slug.trim(),
          whatsapp_principal: whatsapp.trim(),
          email_contato: email.trim(),
          cidade: cidade.trim() || undefined,
          estado: estado.trim() || undefined,
          cor_primaria: corPrimaria,
          logo_url: logoUrl.trim(),
          cnpj: cnpj.trim(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error?.message ?? t('error_save'));
        return;
      }
      toast.success(t('updated'));
      router.refresh();
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
        <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} />
      </div>
      <div>
        <label className="mb-1 block text-sm text-text-secondary" htmlFor="slug">
          {t('field_slug')} *
        </label>
        <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
      </div>
      <div>
        <label className="mb-1 block text-sm text-text-secondary" htmlFor="wa">
          {t('field_whatsapp')} *
        </label>
        <Input id="wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />
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
      <div>
        <label className="mb-1 block text-sm text-text-secondary" htmlFor="cor">
          {t('field_cor')}
        </label>
        <Input id="cor" type="color" value={corPrimaria} onChange={(e) => setCorPrimaria(e.target.value)} className="h-12 w-24" />
      </div>
      <div>
        <label className="mb-1 block text-sm text-text-secondary" htmlFor="logo">
          {t('field_logo_url')}
        </label>
        <Input id="logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
      </div>
      <div>
        <label className="mb-1 block text-sm text-text-secondary" htmlFor="cnpj">
          {t('field_cnpj')}
        </label>
        <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? t('saving') : t('submit')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/painel/imobiliarias')} disabled={loading}>
          {t('back_list')}
        </Button>
      </div>
    </form>
  );
}
