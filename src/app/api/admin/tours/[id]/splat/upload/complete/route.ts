import { z } from 'zod';
import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { completeMultipart } from '@/lib/r2/multipart';
import { isR2Configured, r2PublicUrl } from '@/lib/r2/client';
import { tourSplatProxyUrl } from '@/lib/splat/tour-splat-url';

export const maxDuration = 300;

type RouteParams = { params: Promise<{ id: string }> };

const MAX_SPLAT_BYTES = 629_145_600;

const splatCompleteBodySchema = z.object({
  key: z.string().min(1).max(500),
  uploadId: z.string().min(1),
  parts: z
    .array(
      z.object({
        ETag: z.string().min(1),
        PartNumber: z.number().int().min(1),
      })
    )
    .min(1),
  sizeBytes: z.number().int().positive().max(MAX_SPLAT_BYTES),
});

function isValidSplatUploadKey(tourId: string, key: string): boolean {
  const prefix = `tours/${tourId}/splat/`;
  if (!key.startsWith(prefix)) return false;
  const lower = key.toLowerCase();
  return lower.endsWith('.ply') || lower.endsWith('.ksplat');
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

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

  const parsed = splatCompleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { key, uploadId, parts, sizeBytes } = parsed.data;
  if (!isValidSplatUploadKey(tourId, key)) {
    return jsonError('VALIDATION_ERROR', 'Invalid splat upload key for this tour.', 400);
  }

  try {
    await completeMultipart(key, uploadId, parts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Complete multipart failed';
    return jsonError('INTERNAL', msg, 500);
  }

  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from('tours')
    .update({
      splat_r2_key: key,
      splat_size_bytes: sizeBytes,
      status: 'ready',
      finalized_at: now,
      status_message: null,
    })
    .eq('id', tourId);

  if (upErr) {
    return jsonError('INTERNAL', upErr.message, 500);
  }

  const splatUrl = tourSplatProxyUrl(tourId, key) ?? r2PublicUrl(key);
  return jsonOk({ ok: true as const, splatUrl, status: 'ready' as const });
}
