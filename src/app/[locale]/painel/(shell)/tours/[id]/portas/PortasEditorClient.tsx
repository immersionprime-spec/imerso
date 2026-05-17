'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { toast } from 'sonner';
import { Trash2, Camera, DoorOpen, Check, ChevronDown } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';
import { SplatViewer, type SplatViewerAPI } from '@/components/viewer/SplatViewer';

interface PortaWaypoint {
  id: string;
  ordem: number;
  position_x: number;
  position_y: number;
  position_z: number;
  target_x: number;
  target_y: number;
  target_z: number;
  label: string;
  next_tour_id: string | null;
  next_cam_position: { x: number; y: number; z: number } | null;
  next_cam_target: { x: number; y: number; z: number } | null;
}

interface TourOption {
  id: string;
  titulo: string;
  slug: string;
  splatUrl: string | null;
  cameraUpInverted: boolean;
}

interface PortasEditorClientProps {
  tourId: string;
  tourTitulo: string;
  splatUrl: string;
  cameraUpInverted: boolean;
  initialPortas: PortaWaypoint[];
  allTours: TourOption[];
}

interface DraftPorta {
  position: [number, number, number] | null;
  target: [number, number, number] | null;
  positionLabel: string;
  label: string;
  nextTourId: string;
  nextCamPosition: { x: number; y: number; z: number } | null;
  nextCamTarget: { x: number; y: number; z: number } | null;
  nextCamLabel: string;
}

const emptyDraft = (): DraftPorta => ({
  position: null,
  target: null,
  positionLabel: 'Não capturado',
  label: '',
  nextTourId: '',
  nextCamPosition: null,
  nextCamTarget: null,
  nextCamLabel: 'Não capturado',
});

export function PortasEditorClient({
  tourId,
  tourTitulo,
  splatUrl,
  cameraUpInverted,
  initialPortas,
  allTours,
}: PortasEditorClientProps) {
  const router = useRouter();

  const mainApiRef = useRef<SplatViewerAPI | null>(null);
  const destApiRef = useRef<SplatViewerAPI | null>(null);
  const [mainReady, setMainReady] = useState(false);

  const [portas, setPortas] = useState<PortaWaypoint[]>(initialPortas);

  useEffect(() => {
    setPortas(initialPortas);
  }, [initialPortas]);

  const [draft, setDraft] = useState<DraftPorta>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const selectedDest = allTours.find((t) => t.id === draft.nextTourId) ?? null;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const onMainReady = useCallback((api: SplatViewerAPI) => {
    mainApiRef.current = api;
    setMainReady(true);
  }, []);

  function captureMainPosition() {
    const api = mainApiRef.current;
    if (!api) {
      toast.error('Viewer não pronto.');
      return;
    }
    const { position, target } = api.getCameraState();
    const fmt = (v: number[]) => v.map((n) => n.toFixed(3)).join(', ');
    setDraft((d) => ({
      ...d,
      position: position as [number, number, number],
      target: target as [number, number, number],
      positionLabel: `[${fmt(position)}]`,
    }));
    toast.success('Posição do botão capturada.');
  }

  const onDestReady = useCallback((api: SplatViewerAPI) => {
    destApiRef.current = api;
  }, []);

  function captureDestCamera() {
    const api = destApiRef.current;
    if (!api) {
      toast.error('Viewer de destino não pronto.');
      return;
    }
    const { position, target } = api.getCameraState();
    const fmt = (v: number[]) => v.map((n) => n.toFixed(3)).join(', ');
    setDraft((d) => ({
      ...d,
      nextCamPosition: { x: position[0], y: position[1], z: position[2] },
      nextCamTarget: { x: target[0], y: target[1], z: target[2] },
      nextCamLabel: `[${fmt(position)}]`,
    }));
    toast.success('Câmera inicial do destino capturada.');
  }

  async function savePorta() {
    if (!draft.position) {
      toast.error('Capture a posição do botão primeiro.');
      return;
    }
    if (!draft.label.trim()) {
      toast.error('Digite o label do botão.');
      return;
    }
    if (!draft.nextTourId) {
      toast.error('Selecione o tour de destino.');
      return;
    }
    if (!draft.nextCamPosition || !draft.nextCamTarget) {
      toast.error('Capture a câmera inicial do destino.');
      return;
    }

    setSaving(true);
    try {
      const body = {
        position_x: draft.position[0],
        position_y: draft.position[1],
        position_z: draft.position[2],
        target_x: draft.target![0],
        target_y: draft.target![1],
        target_z: draft.target![2],
        label: draft.label.trim(),
        next_tour_id: draft.nextTourId,
        next_cam_position: draft.nextCamPosition,
        next_cam_target: draft.nextCamTarget,
      };
      const res = await fetch(`/api/admin/tours/${tourId}/portas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error?.message ?? 'Erro ao salvar.');
        return;
      }

      if (draft.nextCamPosition && draft.nextCamTarget) {
        await fetch(`/api/admin/tours/${draft.nextTourId}/camera-start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            position: [draft.nextCamPosition.x, draft.nextCamPosition.y, draft.nextCamPosition.z],
            target: [draft.nextCamTarget.x, draft.nextCamTarget.y, draft.nextCamTarget.z],
          }),
        });
      }

      toast.success('Porta salva!');
      setDraft(emptyDraft());
      destApiRef.current = null;
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: PortaWaypoint) {
    setEditingId(p.id);
    setEditLabel(p.label);
  }

  async function saveEdit(id: string) {
    if (!editLabel.trim()) {
      toast.error('Label não pode ser vazio.');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/waypoints/${id}/porta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error?.message ?? 'Erro ao salvar.');
        return;
      }
      setPortas((prev) => prev.map((p) => (p.id === id ? { ...p, label: editLabel.trim() } : p)));
      setEditingId(null);
      toast.success('Label atualizado.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deletePorta(id: string) {
    if (!window.confirm('Remover esta porta? Isso não pode ser desfeito.')) return;
    const res = await fetch(`/api/admin/waypoints/${id}/porta`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error?.message ?? 'Erro ao remover.');
      return;
    }
    setPortas((prev) => prev.filter((p) => p.id !== id));
    toast.success('Porta removida.');
  }

  const destTourName = selectedDest?.titulo ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-surface/90 px-4 py-3 shadow-md-dark backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-lg font-semibold text-text-primary">
              Portas entre tours
            </h1>
            <p className="text-xs text-text-muted">{tourTitulo}</p>
          </div>
          <Link
            href={`/painel/tours/${tourId}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex')}
          >
            ← Voltar ao tour
          </Link>
        </div>
      </header>

      <div className="mx-auto mt-[72px] flex w-full max-w-7xl flex-col gap-6 p-4 pb-10">
        {portas.length > 0 ? (
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 font-semibold text-text-primary">Portas configuradas</h2>
            <ul className="space-y-3">
              {portas.map((p) => {
                const destName =
                  allTours.find((t) => t.id === p.next_tour_id)?.titulo ?? p.next_tour_id;
                return (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-surface-elevated p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-0.5">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="h-8 w-48 text-sm"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => void saveEdit(p.id)}
                            disabled={savingEdit}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-accent"
                          title="Clique para editar o label"
                        >
                          <DoorOpen className="h-4 w-4 text-accent" />
                          {p.label}
                          <span className="text-xs text-text-muted">(clique para editar)</span>
                        </button>
                      )}
                      <p className="text-xs text-text-muted">→ {destName}</p>
                      <p className="text-xs text-text-muted">
                        Posição: [{p.position_x.toFixed(2)}, {p.position_y.toFixed(2)},{' '}
                        {p.position_z.toFixed(2)}]
                      </p>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon' }),
                        'shrink-0 text-error'
                      )}
                      onClick={() => void deletePorta(p.id)}
                      aria-label="Remover porta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 font-semibold text-text-primary">Adicionar nova porta</h2>
          <p className="mb-4 text-xs text-text-muted">
            1. Navegue até onde o botão deve aparecer e clique em &quot;Capturar posição do
            botão&quot;.
            <br />
            2. Digite o label do botão.
            <br />
            3. Selecione o tour de destino.
            <br />
            4. No viewer do destino, navegue até o ponto de entrada e clique em &quot;Capturar
            câmera inicial&quot;.
            <br />
            5. Clique em &quot;Salvar porta&quot;.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text-primary">
                  Viewer: <span className="text-text-muted">{tourTitulo}</span>
                </p>
                <Button
                  size="sm"
                  variant={draft.position ? 'outline' : 'accent'}
                  disabled={!mainReady}
                  onClick={captureMainPosition}
                >
                  <Camera className="mr-1 h-3 w-3" />
                  Capturar posição do botão
                </Button>
              </div>

              <div className="relative h-[min(45vh,360px)] w-full overflow-hidden rounded-xl border border-border bg-background">
                <SplatViewer
                  splatUrl={splatUrl}
                  cameraUpInverted={cameraUpInverted}
                  onReady={onMainReady}
                />
              </div>

              {draft.position ? (
                <p className="rounded-md bg-surface-elevated px-3 py-1.5 font-mono text-xs text-accent">
                  ✓ Posição capturada: {draft.positionLabel}
                </p>
              ) : (
                <p className="text-xs text-text-muted">Posição do botão: não capturada</p>
              )}

              <div className="space-y-3 rounded-lg border border-border bg-surface-elevated p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">
                    Label do botão (ex: &quot;→ Quarto&quot;, &quot;→ Sala&quot;) *
                  </label>
                  <Input
                    value={draft.label}
                    onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                    placeholder="→ Quarto"
                    maxLength={80}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">
                    Tour de destino *
                  </label>
                  <div className="relative">
                    <select
                      className="h-10 w-full appearance-none rounded-md border border-border bg-surface-elevated px-3 pr-8 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      value={draft.nextTourId}
                      onChange={(e) => {
                        destApiRef.current = null;
                        setDraft((d) => ({
                          ...d,
                          nextTourId: e.target.value,
                          nextCamPosition: null,
                          nextCamTarget: null,
                          nextCamLabel: 'Não capturado',
                        }));
                      }}
                    >
                      <option value="">Selecione um tour...</option>
                      {allTours.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.titulo}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text-primary">
                  Destino:{' '}
                  <span className="text-text-muted">
                    {destTourName ?? 'selecione um tour acima'}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant={draft.nextCamPosition ? 'outline' : 'accent'}
                  disabled={!selectedDest?.splatUrl}
                  onClick={captureDestCamera}
                >
                  <Camera className="mr-1 h-3 w-3" />
                  Capturar câmera inicial
                </Button>
              </div>

              <div className="relative h-[min(45vh,360px)] w-full overflow-hidden rounded-xl border border-border bg-background">
                {selectedDest?.splatUrl ? (
                  <SplatViewer
                    key={selectedDest.id}
                    splatUrl={selectedDest.splatUrl}
                    cameraUpInverted={selectedDest.cameraUpInverted}
                    onReady={onDestReady}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-text-muted">
                    Selecione o tour de destino para visualizá-lo aqui
                  </div>
                )}
              </div>

              {draft.nextCamPosition ? (
                <p className="rounded-md bg-surface-elevated px-3 py-1.5 font-mono text-xs text-accent">
                  ✓ Câmera inicial capturada: {draft.nextCamLabel}
                </p>
              ) : (
                <p className="text-xs text-text-muted">Câmera inicial do destino: não capturada</p>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button
              onClick={() => void savePorta()}
              disabled={
                saving ||
                !draft.position ||
                !draft.label.trim() ||
                !draft.nextTourId ||
                !draft.nextCamPosition
              }
              loading={saving}
            >
              <DoorOpen className="mr-1.5 h-4 w-4" />
              Salvar porta
            </Button>
            {(!draft.position ||
              !draft.label.trim() ||
              !draft.nextTourId ||
              !draft.nextCamPosition) && (
              <p className="text-xs text-text-muted">
                Complete todos os campos: posição, label, destino e câmera inicial.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
