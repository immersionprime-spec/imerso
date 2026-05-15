import { Readable } from 'node:stream';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { nanoid } from 'nanoid';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { getR2, isR2Configured, r2PublicUrl } from '@/lib/r2/client';
import { tourSplatProxyUrl } from '@/lib/splat/tour-splat-url';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database.types';
import { splatFinalizeSchema } from '@/lib/validation/tour-upload';

export const maxDuration = 300;

const MAX_SPLAT_BYTES = 600 * 1024 * 1024;

type RouteParams = { params: Promise<{ id: string }> };

/** POST: download .ply from URL, upload to R2, mark tour ready (generic finalize, not tied to any cloud vendor). */
export async function POST(req: Request, { params }: RouteParams) {
  // Auth alternativa: pipeline local usa service token via header `x-pipeline-token`.
  // Caso ausente ou inválido, cai pro fluxo cookie super_admin.
  const pipelineToken = req.headers.get('x-pipeline-token');
  const expectedToken = process.env.PIPELINE_SERVICE_TOKEN?.trim();
  const isPipelineAuth = !!(pipelineToken && expectedToken && pipelineToken === expectedToken);

  let supabase: SupabaseClient<Database>;
  if (isPipelineAuth) {
    supabase = createAdminClient();
  } else {
    const auth = await requireSuperAdminApi();
    if (!auth.ok) return auth.response;
    supabase = typedAdminSupabase(auth.supabase);
  }

  if (!isR2Configured()) {
    return jsonError('INTERNAL', 'R2 is not configured.', 503);
  }

  const { id: tourId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = splatFinalizeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const payload = parsed.data;

  const { data: tour, error: tErr } = await supabase.from('tours').select('id').eq('id', tourId).maybeSingle();
  if (tErr || !tour) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  let key: string;
  let sizeBytes: number | null;
  let liteKey: string | null = null;
  let liteSizeBytes: number | null = null;

  if (payload.mode === 'r2Key') {
    const expectedPrefix = `tours/${tourId.toLowerCase()}/splat/`;
    if (!payload.r2Key.toLowerCase().startsWith(expectedPrefix)) {
      return jsonError('VALIDATION_ERROR', 'r2Key must belong to this tour.', 400);
    }

    const { client, bucket } = getR2();
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: payload.r2Key })
      );
      const actualSize = head.ContentLength ?? 0;
      if (actualSize === 0) {
        return jsonError('VALIDATION_ERROR', 'R2 object exists but is empty.', 400);
      }
      if (actualSize > MAX_SPLAT_BYTES) {
        return jsonError('VALIDATION_ERROR', 'Splat file too large (max 600MB).', 400);
      }
      key = payload.r2Key;
      sizeBytes = actualSize;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'R2 head failed';
      return jsonError('NOT_FOUND', `R2 object not found or unreadable: ${msg}`, 404);
    }

    const lk = payload.r2KeyLite?.trim();
    if (lk && payload.sizeBytesLite != null) {
      if (!lk.toLowerCase().startsWith(expectedPrefix)) {
        return jsonError('VALIDATION_ERROR', 'r2KeyLite must belong to this tour.', 400);
      }
      const { client, bucket } = getR2();
      try {
        const headL = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: lk }));
        const actualLite = headL.ContentLength ?? 0;
        if (actualLite === 0) {
          return jsonError('VALIDATION_ERROR', 'R2 lite object exists but is empty.', 400);
        }
        if (actualLite > MAX_SPLAT_BYTES) {
          return jsonError('VALIDATION_ERROR', 'Lite splat file too large (max 600MB).', 400);
        }
        liteKey = lk;
        liteSizeBytes = actualLite;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'R2 head failed';
        return jsonError('NOT_FOUND', `R2 lite object not found or unreadable: ${msg}`, 404);
      }
    }
  } else {
    const { splatUrl } = payload;

    const res = await fetch(splatUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(600_000),
      redirect: 'follow',
    });
    if (!res.ok) {
      return jsonError('INTERNAL', `Failed to download splat: ${res.status}`, 502);
    }
    const total = res.headers.get('content-length');
    if (total && Number(total) > MAX_SPLAT_BYTES) {
      return jsonError('VALIDATION_ERROR', 'Splat file too large (max 600MB).', 400);
    }
    const stream = res.body;
    if (!stream) {
      return jsonError('INTERNAL', 'Empty response body.', 502);
    }

    // Preserva a extensão real (ply | ksplat | splat). O viewer detecta formato pela extensão.
    const ext = splatUrl.split('?')[0]?.split('.').pop()?.toLowerCase();
    const suffix = ext === 'ksplat' ? 'ksplat' : ext === 'ply' ? 'ply' : 'splat';
    key = `tours/${tourId}/splat/${nanoid()}.${suffix}`;

    const { client, bucket } = getR2();
    const nodeReadable = Readable.fromWeb(stream as import('stream/web').ReadableStream<Uint8Array>);

    try {
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: nodeReadable,
          ContentType: 'application/octet-stream',
        },
      });
      await upload.done();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'R2 upload failed';
      return jsonError('INTERNAL', msg, 500);
    }

    sizeBytes = total ? Number(total) : null;
  }

  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from('tours')
    .update({
      splat_r2_key: key,
      splat_size_bytes: sizeBytes,
      ...(liteKey
        ? { splat_r2_key_lite: liteKey, splat_size_bytes_lite: liteSizeBytes }
        : {}),
      status: 'ready',
      finalized_at: now,
      status_message: null,
    })
    .eq('id', tourId);

  if (upErr) {
    return jsonError('INTERNAL', upErr.message, 500);
  }

  const splatUrl = tourSplatProxyUrl(tourId, key) ?? r2PublicUrl(key);
  return jsonOk({ splatUrl, status: 'ready' as const });
}
