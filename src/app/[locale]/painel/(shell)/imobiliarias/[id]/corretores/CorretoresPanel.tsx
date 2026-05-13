'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';

export type CorretorRow = {
  id: string;
  nome: string;
  creci: string | null;
  whatsapp: string;
  email: string | null;
  foto_url: string | null;
  ativo: boolean;
};

type CorretoresPanelProps = {
  imobiliariaId: string;
  initialRows: CorretorRow[];
};

export function CorretoresPanel({ imobiliariaId, initialRows }: CorretoresPanelProps) {
  const t = useTranslations('admin.corretores');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CorretorRow | null>(null);
  const [nome, setNome] = useState('');
  const [creci, setCreci] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setNome('');
    setCreci('');
    setWhatsapp('');
    setEmail('');
    setFotoUrl('');
    setOpen(true);
  }

  function openEdit(row: CorretorRow) {
    setEditing(row);
    setNome(row.nome);
    setCreci(row.creci ?? '');
    setWhatsapp(row.whatsapp);
    setEmail(row.email ?? '');
    setFotoUrl(row.foto_url ?? '');
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/admin/corretores/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nome.trim(),
            creci: creci.trim(),
            whatsapp: whatsapp.trim(),
            email: email.trim(),
            foto_url: fotoUrl.trim(),
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(j?.error?.message ?? t('error_save'));
          return;
        }
        toast.success(t('updated'));
      } else {
        const res = await fetch('/api/admin/corretores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imobiliaria_id: imobiliariaId,
            nome: nome.trim(),
            creci: creci.trim(),
            whatsapp: whatsapp.trim(),
            email: email.trim(),
            foto_url: fotoUrl.trim(),
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(j?.error?.message ?? t('error_save'));
          return;
        }
        toast.success(t('created'));
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string, nomeCor: string) {
    if (!window.confirm(t('confirm_deactivate', { nome: nomeCor }))) return;
    const res = await fetch(`/api/admin/corretores/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error?.message ?? t('error_save'));
      return;
    }
    toast.success(t('deactivated'));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={openNew}>
          {t('add')}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border bg-surface-elevated text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">{t('col_nome')}</th>
              <th className="px-4 py-3 font-medium">{t('col_whatsapp')}</th>
              <th className="px-4 py-3 font-medium">{t('col_ativo')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {initialRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-secondary">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              initialRows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-hover/50">
                  <td className="px-4 py-3 font-medium text-text-primary">{r.nome}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.whatsapp}</td>
                  <td className="px-4 py-3">
                    {r.ativo ? <Badge variant="ready">{t('ativo_yes')}</Badge> : <Badge variant="draft">{t('ativo_no')}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEdit(r)} disabled={!r.ativo}>
                        {t('edit')}
                      </Button>
                      {r.ativo ? (
                        <Button type="button" variant="destructive" size="sm" onClick={() => deactivate(r.id, r.nome)}>
                          {t('deactivate')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('modal_edit_title') : t('modal_new_title')}</DialogTitle>
            <DialogDescription>{t('modal_desc')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">{t('field_nome')} *</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">{t('field_creci')}</label>
              <Input value={creci} onChange={(e) => setCreci(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">{t('field_whatsapp')} *</label>
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">{t('field_email')}</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">{t('field_foto')}</label>
              <Input value={fotoUrl} onChange={(e) => setFotoUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                {t('cancel')}
              </Button>
              <Button type="button" onClick={save} disabled={saving || !nome.trim() || !whatsapp.trim()}>
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
