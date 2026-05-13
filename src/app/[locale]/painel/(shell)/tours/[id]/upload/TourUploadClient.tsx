'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';
import { useUploadMultipart } from '@/hooks/useUploadMultipart';
import { useUploadSplat } from '@/hooks/useUploadSplat';
import { cn } from '@/lib/utils/cn';

const ACCEPT = 'video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v';
const ACCEPT_SPLAT = '.ply,.ksplat,application/octet-stream';

export interface TourUploadClientProps {
  tourId: string;
  titulo: string;
  status: string;
  videoR2Key: string | null;
}

function maxVideoBytes(): number {
  const mb = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_SIZE_MB ?? '2048');
  if (!Number.isFinite(mb) || mb < 1) return 2048 * 1024 * 1024;
  return Math.floor(mb * 1024 * 1024);
}

export function TourUploadClient({ tourId, titulo, status, videoR2Key }: TourUploadClientProps) {
  const t = useTranslations('admin.tours.upload');
  const router = useRouter();
  const { upload, abort, progress, status: upStatus, error } = useUploadMultipart();
  const {
    upload: uploadSplat,
    abort: abortSplat,
    progress: splatProgress,
    status: splatUpStatus,
    error: splatError,
  } = useUploadSplat();

  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [markUrl, setMarkUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [splatFile, setSplatFile] = useState<File | null>(null);
  const [splatDrag, setSplatDrag] = useState(false);
  const [splatSuccess, setSplatSuccess] = useState(false);

  const maxBytes = useMemo(() => maxVideoBytes(), []);

  const onFiles = useCallback(
    (list: FileList | null) => {
      const f = list?.[0];
      if (!f) return;
      const lower = f.name.toLowerCase();
      if (!lower.endsWith('.mp4') && !lower.endsWith('.mov') && !lower.endsWith('.m4v')) {
        toast.error(t('error_type'));
        return;
      }
      if (f.size > maxBytes) {
        toast.error(t('error_size'));
        return;
      }
      setFile(f);
    },
    [maxBytes, t]
  );

  const showUploader = status === 'draft' || status === 'failed' || (status === 'uploading' && !videoR2Key);

  const showPostUploadHint =
    (status === 'uploading' && Boolean(videoR2Key)) || status === 'processing';

  const showSplatUploader = status !== 'ready';

  const onSplatFiles = useCallback(
    (list: FileList | null) => {
      const f = list?.[0];
      if (!f) return;
      const lower = f.name.toLowerCase();
      if (!lower.endsWith('.ply') && !lower.endsWith('.ksplat')) {
        toast.error(t('splat_upload.error_type'));
        return;
      }
      const MAX_SPLAT_BYTES = 600 * 1024 * 1024;
      if (f.size > MAX_SPLAT_BYTES) {
        toast.error(t('splat_upload.error_size'));
        return;
      }
      setSplatSuccess(false);
      setSplatFile(f);
    },
    [t]
  );

  async function startSplatUpload() {
    if (!splatFile) {
      toast.error(t('splat_upload.no_file'));
      return;
    }
    setBusy(true);
    try {
      await uploadSplat({
        tourId,
        file: splatFile,
        chunkSizeMB: Number(process.env.NEXT_PUBLIC_MULTIPART_CHUNK_SIZE_MB ?? '10'),
      });
      setSplatSuccess(true);
      toast.success(t('splat_upload.complete'));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('splat_upload.error_upload'));
    } finally {
      setBusy(false);
    }
  }

  async function startUpload() {
    if (!file) {
      toast.error(t('no_file'));
      return;
    }
    setBusy(true);
    try {
      await upload({
        tourId,
        file,
        chunkSizeMB: Number(process.env.NEXT_PUBLIC_MULTIPART_CHUNK_SIZE_MB ?? '10'),
      });
      toast.success(t('complete_video'));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error_upload'));
    } finally {
      setBusy(false);
    }
  }

  async function markReady() {
    if (!markUrl.trim()) {
      toast.error(t('mark_url_required'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tours/${tourId}/splat/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splatUrl: markUrl.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error?.message ?? t('mark_failed'));
        return;
      }
      toast.success(t('mark_ok'));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-text-muted">
            {titulo} · <span className="text-text-secondary">{status}</span>
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold text-text-primary">{t('title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
        </div>
        <Link href={`/painel/tours/${tourId}`} className={buttonVariants({ variant: 'outline', size: 'md' })}>
          {t('back_detail')}
        </Link>
      </div>

      {status === 'ready' ? (
        <div className="rounded-lg border border-success/30 bg-success/10 p-6 text-sm text-text-primary">
          <p>{t('tour_ready')}</p>
          <Link href={`/painel/tours/${tourId}`} className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'mt-4 inline-flex')}>
            {t('back_detail')}
          </Link>
        </div>
      ) : null}

      {showUploader ? (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onFiles(e.dataTransfer.files);
            }}
            className={cn(
              'flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-strong p-8 transition-all',
              drag ? 'scale-[1.01] border-primary bg-surface-hover shadow-glow-primary' : 'hover:border-primary hover:bg-surface-hover'
            )}
            onClick={() => document.getElementById('tour-video-input')?.click()}
          >
            <input
              id="tour-video-input"
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
            <p className="text-center text-sm text-text-secondary">{t('drop')}</p>
            <p className="mt-2 text-center text-xs text-text-muted">{t('types')}</p>
          </div>

          {file ? (
            <p className="text-sm text-text-secondary">
              <span className="text-text-muted">{t('selected')}:</span> {file.name} ({(file.size / (1024 * 1024)).toFixed(1)}{' '}
              MB)
            </p>
          ) : null}

          {upStatus === 'uploading' ? (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-text-muted">{progress}%</p>
            </div>
          ) : null}

          {error ? <p className="text-sm text-error">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={startUpload} disabled={busy || !file || upStatus === 'uploading'}>
              {t('start')}
            </Button>
            {upStatus === 'uploading' ? (
              <Button type="button" variant="outline" onClick={() => abort()}>
                {t('cancel')}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-text-muted">{t('processing_hint')}</p>
        </div>
      ) : null}

      {/* TODO(founder): Fluxo cloud removido — após vídeo no R2, gere o .ply localmente (scripts/local-gs) e finalize com a secção abaixo (URL do .ply). */}
      {showPostUploadHint ? (
        <div className="space-y-2 rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary">{t('processing_hint')}</p>
        </div>
      ) : null}

      {showSplatUploader ? (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <h3 className="font-medium text-text-primary">{t('splat_upload.section_title')}</h3>
          <p className="text-sm text-text-secondary">{t('splat_upload.section_desc')}</p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setSplatDrag(true);
            }}
            onDragLeave={() => setSplatDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSplatDrag(false);
              onSplatFiles(e.dataTransfer.files);
            }}
            className={cn(
              'flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-strong p-8 transition-all',
              splatDrag
                ? 'scale-[1.01] border-primary bg-surface-hover shadow-glow-primary'
                : 'hover:border-primary hover:bg-surface-hover'
            )}
            onClick={() => document.getElementById('tour-splat-input')?.click()}
          >
            <input
              id="tour-splat-input"
              type="file"
              accept={ACCEPT_SPLAT}
              className="hidden"
              onChange={(e) => onSplatFiles(e.target.files)}
            />
            <p className="text-center text-sm text-text-secondary">{t('splat_upload.drop')}</p>
            <p className="mt-2 text-center text-xs text-text-muted">{t('splat_upload.types')}</p>
          </div>

          {splatFile ? (
            <p className="text-sm text-text-secondary">
              <span className="text-text-muted">{t('splat_upload.selected')}:</span> {splatFile.name} (
              {(splatFile.size / (1024 * 1024)).toFixed(1)} MB)
            </p>
          ) : null}

          {splatUpStatus === 'uploading' ? (
            <div className="space-y-2">
              <Progress value={splatProgress} />
              <p className="text-xs text-text-muted">{splatProgress}%</p>
            </div>
          ) : null}

          {splatError ? <p className="text-sm text-error">{splatError}</p> : null}

          {splatSuccess ? (
            <p className="text-sm text-success">{t('splat_upload.complete')}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void startSplatUpload()}
              disabled={busy || !splatFile || splatUpStatus === 'uploading'}
            >
              {t('splat_upload.start')}
            </Button>
            {splatUpStatus === 'uploading' ? (
              <Button type="button" variant="outline" onClick={() => abortSplat()}>
                {t('splat_upload.cancel')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {status !== 'ready' ? (
        <div className="space-y-4 rounded-lg border border-border-strong bg-surface-elevated p-6">
          <h3 className="font-medium text-text-primary">{t('mark_title')}</h3>
          <p className="text-sm text-text-secondary">{t('mark_desc')}</p>
          <Input value={markUrl} onChange={(e) => setMarkUrl(e.target.value)} placeholder="https://..." />
          <Button type="button" variant="accent" onClick={markReady} disabled={busy}>
            {t('mark_submit')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
