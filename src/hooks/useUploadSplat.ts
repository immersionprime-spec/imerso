'use client';

import { useRef, useState } from 'react';

interface SplatUploadOptions {
  tourId: string;
  file: File;
  chunkSizeMB?: number;
  onProgress?: (pct: number) => void;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }
  return false;
}

export function useUploadSplat() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function upload({ tourId, file, chunkSizeMB = 10, onProgress }: SplatUploadOptions) {
    setStatus('uploading');
    setError(null);
    setProgress(0);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const chunkSize = chunkSizeMB * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);

    let key = '';
    let uploadId = '';

    async function postAbort() {
      if (!key || !uploadId) return;
      await fetch(`/api/admin/tours/${tourId}/splat/upload/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, uploadId }),
      }).catch(() => {});
    }

    try {
      const initRes = await fetch(`/api/admin/tours/${tourId}/splat/upload/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          totalChunks,
          chunkSize,
        }),
        signal,
      });
      if (!initRes.ok) {
        const j = await initRes.json().catch(() => ({}));
        throw new Error((j as { error?: { message?: string } })?.error?.message ?? 'Failed to initiate splat upload.');
      }
      const init = (await initRes.json()) as { uploadId: string; key: string };
      uploadId = init.uploadId;
      key = init.key;

      const completedParts: Array<{ ETag: string; PartNumber: number }> = [];
      const CONCURRENCY = 4;
      let nextIndex = 0;
      let completedCount = 0;

      async function uploadOneChunk(partNumber: number): Promise<void> {
        const i = partNumber - 1;
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const signRes = await fetch(`/api/admin/tours/${tourId}/splat/upload/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, uploadId, partNumber }),
          signal,
        });
        if (!signRes.ok) {
          const j = await signRes.json().catch(() => ({}));
          throw new Error((j as { error?: { message?: string } })?.error?.message ?? `Failed to sign part ${partNumber}.`);
        }
        const { url } = (await signRes.json()) as { url: string };

        const putRes = await fetch(url, {
          method: 'PUT',
          body: chunk,
          signal,
        });
        if (!putRes.ok) {
          throw new Error(`Chunk ${partNumber} upload failed (${putRes.status}).`);
        }

        const etag = putRes.headers.get('ETag')?.replace(/"/g, '') || '';
        if (!etag) throw new Error(`Missing ETag for part ${partNumber}.`);
        completedParts.push({ ETag: etag, PartNumber: partNumber });

        completedCount += 1;
        const pct = Math.round((completedCount / totalChunks) * 100);
        setProgress(pct);
        onProgress?.(pct);
      }

      async function worker(): Promise<void> {
        while (true) {
          if (signal.aborted) return;
          const myIndex = nextIndex;
          if (myIndex >= totalChunks) return;
          nextIndex += 1;
          try {
            await uploadOneChunk(myIndex + 1);
          } catch (err) {
            abortRef.current?.abort();
            throw err;
          }
        }
      }

      try {
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      } catch (err) {
        await postAbort();
        if (isAbortError(err)) {
          throw new Error('Upload cancelled.');
        }
        throw err;
      }

      completedParts.sort((a, b) => a.PartNumber - b.PartNumber);

      const completeRes = await fetch(`/api/admin/tours/${tourId}/splat/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          uploadId,
          parts: completedParts,
          sizeBytes: file.size,
        }),
        signal,
      });
      if (!completeRes.ok) {
        await postAbort();
        const j = await completeRes.json().catch(() => ({}));
        throw new Error((j as { error?: { message?: string } })?.error?.message ?? 'Failed to complete splat upload.');
      }

      setStatus('completed');
      return (await completeRes.json()) as { ok: true; splatUrl: string; status: 'ready' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setStatus('error');
      throw err;
    }
  }

  function abort() {
    abortRef.current?.abort();
  }

  return { upload, abort, progress, status, error };
}
