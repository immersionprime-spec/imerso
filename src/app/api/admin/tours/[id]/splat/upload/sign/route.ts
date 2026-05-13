import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { signPart } from '@/lib/r2/multipart';
import { isR2Configured } from '@/lib/r2/client';

type RouteParams = { params: Promise<{ id: string }> };

const splatSignBodySchema = z.object({
  key: z.string().min(1).max(500),
  uploadId: z.string().min(1),
  partNumber: z.number().int().min(1),
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

  const parsed = splatSignBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { key, uploadId, partNumber } = parsed.data;
  if (!isValidSplatUploadKey(tourId, key)) {
    return jsonError('VALIDATION_ERROR', 'Invalid splat upload key for this tour.', 400);
  }

  try {
    const url = await signPart(key, uploadId, partNumber);
    return jsonOk({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sign failed';
    return jsonError('INTERNAL', msg, 500);
  }
}
