'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { slugify } from '@/lib/utils/slug';

type Imob = { id: string; nome: string; slug: string };
type Cor = { id: string; nome: string; imobiliaria_id: string };

const TIPOS = ['apartamento', 'casa', 'comercial', 'terreno', 'evento'] as const;
const MODS = ['venda', 'aluguel', 'temporada'] as const;

export function NovoTourWizard({ imobs, corretores }: { imobs: Imob[]; corretores: Cor[] }) {
  const t = useTranslations('admin.tours');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [imobiliariaId, setImobiliariaId] = useState(imobs[0]?.id ?? '');
  const [corretorId, setCorretorId] = useState('');

  const corsFiltered = useMemo(
    () => corretores.filter((c) => c.imobiliaria_id === imobiliariaId),
    [corretores, imobiliariaId]
  );

  const [titulo, setTitulo] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>('apartamento');
  const [bairro, setBairro] = useState('');
  const [areaM2, setAreaM2] = useState('');
  const [quartos, setQuartos] = useState('');
  const [valor, setValor] = useState('');
  const [modalidade, setModalidade] = useState<(typeof MODS)[number] | ''>('');
  const [descricao, setDescricao] = useState('');

  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [hasCinematic, setHasCinematic] = useState(false);
  const [cobranca, setCobranca] = useState('');

  function onTituloBlur() {
    if (!slugTouched && titulo.trim()) {
      setSlug(slugify(titulo));
    }
  }

  async function submit() {
    if (!imobiliariaId) {
      toast.error(t('error_no_imob'));
      return;
    }
    if (!isPublic && password.length < 4) {
      toast.error(t('error_private_password'));
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        imobiliaria_id: imobiliariaId,
        slug: slug.trim(),
        titulo: titulo.trim(),
        tipo,
        is_public: isPublic,
        has_cinematic_mode: hasCinematic,
      };
      if (corretorId) body.corretor_id = corretorId;
      if (bairro.trim()) body.bairro = bairro.trim();
      if (areaM2 !== '') body.area_m2 = Number(areaM2);
      if (quartos !== '') body.quartos = Number(quartos);
      if (valor !== '') body.valor = Number(valor);
      if (modalidade) body.modalidade = modalidade;
      if (descricao.trim()) body.descricao = descricao.trim();
      if (cobranca !== '') body.cobranca_cliente_brl = Number(cobranca);
      if (!isPublic) body.password = password;

      const res = await fetch('/api/admin/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error?.message ?? t('error_save'));
        return;
      }
      toast.success(t('created'));
      router.push(`/painel/tours/${j.id}/upload`);
    } finally {
      setLoading(false);
    }
  }

  if (imobs.length === 0) {
    return <p className="text-text-secondary">{t('wizard_no_imobs')}</p>;
  }

  return (
    <div className="space-y-6 rounded-lg border border-border bg-surface p-6">
      <div className="flex gap-2 text-sm text-text-muted">
        <span className={step === 0 ? 'text-primary' : ''}>1 · {t('wizard_step1')}</span>
        <span>→</span>
        <span className={step === 1 ? 'text-primary' : ''}>2 · {t('wizard_step2')}</span>
        <span>→</span>
        <span className={step === 2 ? 'text-primary' : ''}>3 · {t('wizard_step3')}</span>
      </div>

      {step === 0 ? (
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_imob')} *</label>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm"
              value={imobiliariaId}
              onChange={(e) => {
                setImobiliariaId(e.target.value);
                setCorretorId('');
              }}
            >
              {imobs.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_corretor')}</label>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm"
              value={corretorId}
              onChange={(e) => setCorretorId(e.target.value)}
            >
              <option value="">{t('corretor_none')}</option>
              {corsFiltered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/painel/tours')}>
              {t('cancel')}
            </Button>
            <Button type="button" onClick={() => setStep(1)}>
              {t('next')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_titulo')} *</label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={onTituloBlur} required minLength={3} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_slug')} *</label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_tipo')} *</label>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number])}
            >
              {TIPOS.map((x) => (
                <option key={x} value={x}>
                  {t(`tipo.${x}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_bairro')}</label>
            <Input value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-text-secondary">{t('field_area')}</label>
              <Input type="number" min={0} step="0.01" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-text-secondary">{t('field_quartos')}</label>
              <Input type="number" min={0} step={1} value={quartos} onChange={(e) => setQuartos(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-text-secondary">{t('field_valor')}</label>
              <Input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_modalidade')}</label>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm"
              value={modalidade}
              onChange={(e) => setModalidade(e.target.value as (typeof MODS)[number] | '')}
            >
              <option value="">{t('modalidade_none')}</option>
              {MODS.map((m) => (
                <option key={m} value={m}>
                  {t(`mod.${m}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_desc')}</label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} />
          </div>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              {t('back')}
            </Button>
            <Button type="button" onClick={() => setStep(2)}>
              {t('next')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4">
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            {t('field_public')}
          </label>
          {!isPublic ? (
            <div>
              <label className="mb-1 block text-sm text-text-secondary">{t('field_password')} *</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={hasCinematic} onChange={(e) => setHasCinematic(e.target.checked)} />
            {t('field_cinematic')}
          </label>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_cobranca')}</label>
            <Input type="number" min={0} step="0.01" value={cobranca} onChange={(e) => setCobranca(e.target.value)} />
          </div>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              {t('back')}
            </Button>
            <Button type="button" onClick={submit} disabled={loading || !titulo.trim() || !slug.trim()}>
              {loading ? t('saving') : t('submit_create')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
