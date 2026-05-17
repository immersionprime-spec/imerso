'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { TourEditor } from '@/components/admin/tour-editor/TourEditor';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';

type Tour = {
  id: string;
  imobiliaria_id: string;
  corretor_id: string | null;
  slug: string;
  titulo: string;
  tipo: string;
  bairro: string | null;
  area_m2: number | null;
  quartos: number | null;
  valor: number | null;
  modalidade: string | null;
  descricao: string | null;
  is_public: boolean;
  has_cinematic_mode: boolean;
  cobranca_cliente_brl: number | null;
  status: string;
  foto_capa_url: string | null;
  splat_url: string | null;
  camera_up_inverted: boolean;
  splat_rotation_deg: number | null;
};

const TABS = ['dados', 'midia', 'editor', 'links'] as const;
type TourTab = (typeof TABS)[number];

function parseTourTab(value: string | undefined): TourTab {
  if (value === 'midia' || value === 'editor' || value === 'links') return value;
  return 'dados';
}

export function TourDetailClient({
  tour: initial,
  imobiliariaSlug,
  imobiliariaNome,
  corretores,
  initialTab,
}: {
  tour: Tour;
  imobiliariaSlug: string;
  imobiliariaNome: string;
  corretores: { id: string; nome: string }[];
  initialTab?: string;
}) {
  const t = useTranslations('admin.tours');
  const router = useRouter();
  const [tab, setTab] = useState<TourTab>(() => parseTourTab(initialTab));
  const [loading, setLoading] = useState(false);

  const [titulo, setTitulo] = useState(initial.titulo);
  const [slug, setSlug] = useState(initial.slug);
  const [tipo, setTipo] = useState(initial.tipo);
  const [bairro, setBairro] = useState(initial.bairro ?? '');
  const [areaM2, setAreaM2] = useState(initial.area_m2 != null ? String(initial.area_m2) : '');
  const [quartos, setQuartos] = useState(initial.quartos != null ? String(initial.quartos) : '');
  const [valor, setValor] = useState(initial.valor != null ? String(initial.valor) : '');
  const [modalidade, setModalidade] = useState(initial.modalidade ?? '');
  const [descricao, setDescricao] = useState(initial.descricao ?? '');
  const [corretorId, setCorretorId] = useState(initial.corretor_id ?? '');
  const [isPublic, setIsPublic] = useState(initial.is_public);
  const [password, setPassword] = useState('');
  const [hasCinematic, setHasCinematic] = useState(initial.has_cinematic_mode);
  const [cobranca, setCobranca] = useState(initial.cobranca_cliente_brl != null ? String(initial.cobranca_cliente_brl) : '');
  const [fotoCapa, setFotoCapa] = useState(initial.foto_capa_url ?? '');
  const [removingSplat, setRemovingSplat] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const publicPath = imobiliariaSlug && slug ? `/${imobiliariaSlug}/${slug}` : '';

  async function saveDados() {
    setLoading(true);
    try {
      const patch: Record<string, unknown> = {
        titulo: titulo.trim(),
        slug: slug.trim(),
        tipo,
        bairro: bairro.trim() || null,
        descricao: descricao.trim() || null,
        modalidade: modalidade || null,
        is_public: isPublic,
        has_cinematic_mode: hasCinematic,
        foto_capa_url: fotoCapa.trim() || null,
      };
      if (areaM2 !== '') patch.area_m2 = Number(areaM2);
      else patch.area_m2 = null;
      if (quartos !== '') patch.quartos = Number(quartos);
      else patch.quartos = null;
      if (valor !== '') patch.valor = Number(valor);
      else patch.valor = null;
      if (cobranca !== '') patch.cobranca_cliente_brl = Number(cobranca);
      else patch.cobranca_cliente_brl = null;
      patch.corretor_id = corretorId || null;
      if (password.trim().length > 0) patch.password = password.trim();

      const res = await fetch(`/api/admin/tours/${initial.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error?.message ?? t('error_save'));
        return;
      }
      toast.success(t('updated'));
      setPassword('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function archiveTour() {
    if (!window.confirm(t('confirm_archive_tour'))) return;
    const res = await fetch(`/api/admin/tours/${initial.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error?.message ?? t('error_save'));
      return;
    }
    toast.success(t('archived_tour'));
    router.push('/painel/tours');
    router.refresh();
  }

  async function removeSplat() {
    if (!window.confirm(t('confirm_remove_splat'))) return;
    setRemovingSplat(true);
    try {
      const res = await fetch(`/api/admin/tours/${initial.id}/splat/reset`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error?.message ?? t('remove_splat_error'));
        return;
      }
      toast.success(t('remove_splat_success'));
      router.refresh();
    } finally {
      setRemovingSplat(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            className={cn(
              buttonVariants({ variant: tab === k ? 'primary' : 'ghost', size: 'sm' }),
              tab === k ? '' : 'text-text-secondary'
            )}
            onClick={() => setTab(k)}
          >
            {t(`tab_${k}`)}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <Badge variant="default">{initial.status}</Badge>
        </span>
      </div>

      {tab === 'dados' ? (
        <div className="grid max-w-2xl gap-4 rounded-lg border border-border bg-surface p-6">
          <p className="text-xs text-text-muted">
            {imobiliariaNome} · {imobiliariaSlug}
          </p>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_titulo')} *</label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_slug')} *</label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_tipo')} *</label>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {['apartamento', 'casa', 'comercial', 'terreno', 'evento'].map((x) => (
                <option key={x} value={x}>
                  {t(`tipo.${x}`)}
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
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
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
              <Input type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-text-secondary">{t('field_quartos')}</label>
              <Input type="number" value={quartos} onChange={(e) => setQuartos(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-text-secondary">{t('field_valor')}</label>
              <Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_modalidade')}</label>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm"
              value={modalidade}
              onChange={(e) => setModalidade(e.target.value)}
            >
              <option value="">{t('modalidade_none')}</option>
              {['venda', 'aluguel', 'temporada'].map((m) => (
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
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_foto_capa')}</label>
            <Input value={fotoCapa} onChange={(e) => setFotoCapa(e.target.value)} placeholder="https://..." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            {t('field_public')}
          </label>
          {!isPublic ? (
            <div>
              <label className="mb-1 block text-sm text-text-secondary">{t('field_password_new')}</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasCinematic} onChange={(e) => setHasCinematic(e.target.checked)} />
            {t('field_cinematic')}
          </label>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">{t('field_cobranca')}</label>
            <Input type="number" value={cobranca} onChange={(e) => setCobranca(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveDados} disabled={loading}>
              {loading ? t('saving') : t('submit')}
            </Button>
          </div>
          <div className="mt-6 space-y-2 rounded-lg border border-red-800/30 bg-red-950/10 p-4">
            <p className="text-sm font-medium text-red-400">{t('danger_zone_title')}</p>
            <p className="text-xs text-text-muted">{t('danger_zone_archive_hint')}</p>
            <Button type="button" variant="destructive" size="sm" onClick={archiveTour}>
              {t('archive_tour')}
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'midia' ? (
        <div className="space-y-6 rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          <div className="space-y-2">
            <p className="font-medium text-text-primary">Upload de splat local (.ply / .ksplat)</p>
            <p className="text-text-muted">
              Gerou o arquivo pelo pipeline local (<code className="rounded bg-surface-elevated px-1">npm run gs:local</code>)?
              Clique abaixo para fazer o upload — o tour ficará pronto automaticamente.
            </p>
            <Link
              href={`/painel/tours/${initial.id}/upload`}
              className={cn(buttonVariants({ variant: 'primary', size: 'md' }), 'inline-flex')}
            >
              Upload de splat (.ply / .ksplat)
            </Link>
          </div>
          {initial.splat_url ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="font-medium text-text-primary">{t('start_point_title')}</p>
              <p className="text-xs text-text-muted">{t('start_point_desc')}</p>
              <Link
                href={`/painel/tours/${initial.id}/preview`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex')}
              >
                {t('start_point_link')}
              </Link>
            </div>
          ) : null}
          {initial.splat_url && initial.status === 'ready' ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="font-medium text-text-primary">{t('remove_splat_title')}</p>
              <p className="text-xs text-text-muted">{t('remove_splat_desc')}</p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={removingSplat}
                onClick={removeSplat}
              >
                {removingSplat ? t('remove_splat_removing') : t('remove_splat_button')}
              </Button>
            </div>
          ) : null}
          <div className="border-t border-border pt-4 space-y-2">
            <p className="font-medium text-text-primary">Vídeo bruto</p>
            <p className="text-text-muted">{t('midia_upload_hint')}</p>
            <Link
              href={`/painel/tours/${initial.id}/upload`}
              className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'inline-flex')}
            >
              {t('upload_video')}
            </Link>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-text-muted">
              <span className="font-medium text-text-secondary">splat_url:</span>{' '}
              {initial.splat_url ? (
                <a href={initial.splat_url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
                  {initial.splat_url}
                </a>
              ) : (
                '—'
              )}
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'editor' ? (
        <TourEditor
          tourId={initial.id}
          splatUrl={initial.splat_url ?? ''}
          cameraUpInverted={initial.camera_up_inverted}
          splatRotationDeg={initial.splat_rotation_deg}
        />
      ) : null}

      {tab === 'links' ? (
        <div className="space-y-6 rounded-lg border border-border bg-surface p-6 text-sm">
          <p className="text-text-secondary">{t('links_intro')}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href={`/painel/tours/${initial.id}/hotspots`}
              className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'inline-flex justify-center')}
            >
              {t('link_hotspots')}
            </Link>
            <Link
              href={`/painel/tours/${initial.id}/waypoints`}
              className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'inline-flex justify-center')}
            >
              {t('link_waypoints')}
            </Link>
            <Link
              href={`/painel/tours/${initial.id}?tab=editor`}
              className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'inline-flex justify-center')}
            >
              {t('link_editor')}
            </Link>
          </div>
          {publicPath ? (
            <div>
              <p className="mb-1 text-text-muted">{t('public_url')}</p>
              <code className="block break-all rounded bg-surface-elevated p-2 text-text-primary">
                {baseUrl}
                {publicPath}
              </code>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
