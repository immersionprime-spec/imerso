'use client';

import { useRef, useState } from 'react';

interface UploadOptions {
  tourId: string;
  file: File;
  chunkSizeMB?: number;
  onProgress?: (percent: number) => void;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }
  return false;
}

export function useUploadMultipart() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'completed' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function upload({ tourId, file, chunkSizeMB = 10, onProgress }: UploadOptions) {
    setStatus('uploading');
    setError(null);
    setProgress(0);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const chunkSize = chunkSizeMB * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const contentType =
      ext === 'mov'
        ? 'video/quicktime'
        : ext === 'm4v'
          ? 'video/x-m4v'
          : file.type === 'video/quicktime' || file.type === 'video/x-m4v'
            ? file.type
            : 'video/mp4';

    try {
      const initRes = await fetch(`/api/admin/tours/${tourId}/upload/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          contentType,
          totalChunks,
          chunkSize,
        }),
        signal,
      });
      if (!initRes.ok) {
        const j = await initRes.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? 'Failed to initiate upload.');
      }
      const { sessionId } = (await initRes.json()) as {
        sessionId: string;
      };

      // Pool de workers paralelos: 4 chunks concorrentes. Chunks completam fora de ordem,
      // por isso o array é populado por PartNumber e ordenado antes do `complete`.
      const completedParts: Array<{ ETag: string; PartNumber: number }> = [];
      const CONCURRENCY = 4;
      let nextIndex = 0;
      let completedCount = 0;

      async function uploadOneChunk(partNumber: number): Promise<void> {
        const i = partNumber - 1;
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const signRes = await fetch(`/api/admin/tours/${tourId}/upload/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, partNumber }),
          signal,
        });
        if (!signRes.ok) {
          const j = await signRes.json().catch(() => ({}));
          throw new Error(j?.error?.message ?? `Failed to sign part ${partNumber}.`);
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
            // Falha de um worker aborta os outros pra evitar uploads órfãos
            abortRef.current?.abort();
            throw err;
          }
        }
      }

      try {
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      } catch (err) {
        if (abortRef.current?.signal.aborted) {
          await fetch(`/api/admin/tours/${tourId}/upload/abort`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          }).catch(() => {});
          if (isAbortError(err)) {
            throw new Error('Upload cancelled.');
          }
        }
        throw err;
      }

      // S3/R2 exige PartNumber ordenado ascendente no complete (o servidor também ordena em lib/r2/multipart).
      completedParts.sort((a, b) => a.PartNumber - b.PartNumber);

      const completeRes = await fetch(`/api/admin/tours/${tourId}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, parts: completedParts }),
      });
      if (!completeRes.ok) {
        const j = await completeRes.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? 'Failed to complete upload.');
      }

      setStatus('completed');
      return (await completeRes.json()) as { ok: true; videoUrl: string };
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
