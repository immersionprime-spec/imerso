'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { Trash2, Crosshair } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/utils/cn';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { SplatViewer } from '@/components/viewer/SplatViewer';

const ICON_OPTIONS = [
  'suite',
  'cozinha',
  'varanda',
  'banheiro',
  'garagem',
  'sala',
  'piscina',
  'jardim',
  'churrasqueira',
  'home_office',
  'lavabo',
  'closet',
  'area_servico',
  'generico',
] as const;

type HotspotRow = {
  id: string;
  titulo: string;
  descricao: string | null;
  icone: string;
  posicao_x: number;
  posicao_y: number;
  posicao_z: number;
  ordem: number;
};

export function HotspotsEditorClient({
  tourId,
  tourTitulo,
  splatUrl,
  cameraUpInverted,
  tourStatus,
  initialHotspots,
}: {
  tourId: string;
  tourTitulo: string;
  splatUrl: string | null;
  cameraUpInverted: boolean;
  tourStatus: string;
  initialHotspots: HotspotRow[];
}) {
  const t = useTranslations('admin.tours.hotspots');
  const router = useRouter();
  const [hotspots, setHotspots] = useState<HotspotRow[]>(initialHotspots);
  const [pickMode, setPickMode] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingXYZ, setPendingXYZ] = useState<[number, number, number] | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [icone, setIcone] = useState<string>('generico');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHotspots(initialHotspots);
  }, [initialHotspots]);

  const maxH = Number(process.env.NEXT_PUBLIC_MAX_HOTSPOTS_PER_TOUR ?? 15);
  const canEdit = Boolean(splatUrl) && tourStatus === 'ready';
  const atLimit = hotspots.length >= maxH;

  function openDialogFromPick(p: [number, number, number]) {
    setPendingXYZ(p);
    setPickMode(false);
    setTitulo('');
    setDescricao('');
    setIcone('generico');
    setDialogOpen(true);
  }

  async function saveHotspot() {
    if (!pendingXYZ || titulo.trim().length === 0) {
      toast.error(t('validation_title'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tours/${tourId}/hotspots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descricao: descricao.trim() || undefined,
          icone,
          posicao_x: pendingXYZ[0],
          posicao_y: pendingXYZ[1],
          posicao_z: pendingXYZ[2],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error?.message ?? t('error_save'));
        return;
      }
      toast.success(t('saved'));
      setDialogOpen(false);
      setPendingXYZ(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeHotspot(id: string) {
    if (!window.confirm(t('confirm_delete'))) return;
    const res = await fetch(`/api/admin/hotspots/${id}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error?.message ?? t('error_delete'));
      return;
    }
    setHotspots((list) => list.filter((h) => h.id !== id));
    toast.success(t('deleted'));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 space-y-4 lg:w-80">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/painel/tours/${tourId}`} className="text-sm text-primary hover:underline">
            ← {t('back_tour')}
          </Link>
        </div>
        <h2 className="font-display text-lg font-semibold text-text-primary">{tourTitulo}</h2>
        <p className="text-sm text-text-secondary">{t('hint')}</p>
        <p className="text-xs text-text-muted">
          {t('count', { n: hotspots.length, max: maxH })}
        </p>
        {!canEdit ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{t('need_ready')}</p>
        ) : null}
        <Button
          type="button"
          variant="accent"
          className="w-full"
          disabled={!canEdit || atLimit || pickMode}
          onClick={() => setPickMode(true)}
        >
          <Crosshair className="mr-2 h-4 w-4" />
          {t('add_pick')}
        </Button>
        {pickMode ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => setPickMode(false)}>
            {t('cancel_pick')}
          </Button>
        ) : null}
        <ul className="max-h-[40vh] space-y-2 overflow-y-auto rounded-lg border border-border bg-surface p-3">
          {hotspots.length === 0 ? (
            <li className="text-sm text-text-muted">{t('empty')}</li>
          ) : (
            hotspots.map((h) => (
              <li
                key={h.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-text-primary">{h.titulo}</p>
                  <p className="text-xs text-text-muted">
                    {h.icone} · {h.posicao_x.toFixed(2)}, {h.posicao_y.toFixed(2)}, {h.posicao_z.toFixed(2)}
                  </p>
                </div>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'shrink-0 text-error')}
                  aria-label={t('delete')}
                  onClick={() => void removeHotspot(h.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      <div className="relative min-h-[min(70dvh,560px)] flex-1 overflow-hidden rounded-xl border border-border bg-background">
        {pickMode ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-4">
            <p className="rounded-md glass border border-border px-4 py-2 text-center text-sm text-text-primary">
              {t('pick_banner')}
            </p>
          </div>
        ) : null}
        {canEdit && splatUrl ? (
          <SplatViewer
            splatUrl={splatUrl}
            cameraUpInverted={cameraUpInverted}
            pickMode={pickMode}
            onPickWorld={openDialogFromPick}
          />
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center text-text-muted">{t('no_viewer')}</div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog_title')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="text-sm text-text-secondary">{t('field_title')} *</label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-text-secondary">{t('field_desc')}</label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
            </div>
            <div>
              <label className="text-sm text-text-secondary">{t('field_icon')}</label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm"
                value={icone}
                onChange={(e) => setIcone(e.target.value)}
              >
                {ICON_OPTIONS.map((ic) => (
                  <option key={ic} value={ic}>
                    {ic}
                  </option>
                ))}
              </select>
            </div>
            {pendingXYZ ? (
              <p className="text-xs text-text-muted">
                {t('coords')}: {pendingXYZ.map((x) => x.toFixed(3)).join(', ')}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="button" onClick={() => void saveHotspot()} disabled={saving}>
              {saving ? '…' : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
