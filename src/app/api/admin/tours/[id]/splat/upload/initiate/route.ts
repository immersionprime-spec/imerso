import { nanoid } from 'nanoid';
import { z } from 'zod';
import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { initiateMultipart } from '@/lib/r2/multipart';
import { isR2Configured } from '@/lib/r2/client';

export const maxDuration = 300;

type RouteParams = { params: Promise<{ id: string }> };

const MAX_SPLAT_BYTES = 629_145_600;
const MIN_CHUNK = 5 * 1024 * 1024;
const MAX_CHUNK = 50 * 1024 * 1024;

const splatInitiateBodySchema = z
  .object({
    fileName: z.string().min(1).max(500),
    fileSize: z.number().int().positive().max(MAX_SPLAT_BYTES),
    totalChunks: z.number().int().min(1).max(5000),
    chunkSize: z.number().int().min(MIN_CHUNK).max(MAX_CHUNK),
  })
  .superRefine((data, ctx) => {
    const expected = Math.ceil(data.fileSize / data.chunkSize);
    if (data.totalChunks !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `totalChunks must equal ceil(fileSize/chunkSize) (expected ${expected})`,
        path: ['totalChunks'],
      });
    }
    const lower = data.fileName.toLowerCase();
    if (!lower.endsWith('.ply') && !lower.endsWith('.ksplat')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fileName must end with .ply or .ksplat',
        path: ['fileName'],
      });
    }
  });

function splatExtFromFileName(fileName: string): 'ply' | 'ksplat' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ksplat')) return 'ksplat';
  if (lower.endsWith('.ply')) return 'ply';
  return null;
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  if (!isR2Configured()) {
    return jsonError('INTERNAL', 'R2 is not configured (missing env vars).', 503);
  }

  const { id: tourId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = splatInitiateBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { fileName } = parsed.data;
  const ext = splatExtFromFileName(fileName);
  if (!ext) {
    return jsonError('VALIDATION_ERROR', 'Only .ply or .ksplat are allowed.', 400);
  }

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, status, archived_at')
    .eq('id', tourId)
    .maybeSingle();

  if (tourErr || !tour) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }
  if (tour.archived_at != null) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }
  if (tour.status === 'processing') {
    return jsonError('CONFLICT', 'Tour is processing; wait before uploading a splat.', 409);
  }
  if (tour.status === 'ready') {
    return jsonError(
      'CONFLICT',
      'Tour is already ready. Revert status to draft/failed in the panel before replacing the splat.',
      409
    );
  }

  const key = `tours/${tourId}/splat/${nanoid()}.${ext}`;

  let uploadId: string;
  try {
    const created = await initiateMultipart(key, 'application/octet-stream');
    uploadId = created.uploadId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'R2 initiate failed';
    return jsonError('INTERNAL', msg, 500);
  }

  return jsonOk({ uploadId, key });
}
