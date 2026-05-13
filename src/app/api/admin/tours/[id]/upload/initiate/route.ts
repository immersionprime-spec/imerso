import { nanoid } from 'nanoid';
import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { initiateMultipart } from '@/lib/r2/multipart';
import { isR2Configured } from '@/lib/r2/client';
import { uploadInitiateSchema } from '@/lib/validation/tour-upload';

type RouteParams = { params: Promise<{ id: string }> };

const ALLOWED_EXT = new Set(['mp4', 'mov', 'm4v']);

function maxVideoBytes(): number {
  const mb = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_SIZE_MB ?? '2048');
  if (!Number.isFinite(mb) || mb < 1) return 2048 * 1024 * 1024;
  return Math.floor(mb * 1024 * 1024);
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

  const parsed = uploadInitiateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { fileName, fileSize, contentType, totalChunks, chunkSize } = parsed.data;
  if (fileSize > maxVideoBytes()) {
    return jsonError('VALIDATION_ERROR', 'File exceeds max video size.', 400);
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.has(ext)) {
    return jsonError('VALIDATION_ERROR', 'Only .mp4, .mov, .m4v are allowed.', 400);
  }

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, status, archived_at')
    .eq('id', tourId)
    .maybeSingle();

  if (tourErr || !tour) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }
  if (tour.archived_at) {
    return jsonError('VALIDATION_ERROR', 'Tour is archived.', 400);
  }
  if (tour.status === 'processing') {
    return jsonError('CONFLICT', 'Tour is processing; wait or set status to failed/draft before a new upload.', 409);
  }
  if (tour.status === 'ready') {
    return jsonError('CONFLICT', 'Tour is already ready. Revert status to draft/failed in the panel to replace video.', 409);
  }

  const { data: openSession } = await supabase
    .from('upload_sessions')
    .select('id')
    .eq('tour_id', tourId)
    .eq('status', 'in_progress')
    .maybeSingle();

  if (openSession) {
    return jsonError('CONFLICT', 'An upload is already in progress. Complete or abort it first.', 409);
  }

  const key = `tours/${tourId}/raw/${nanoid()}.${ext}`;

  let uploadId: string;
  try {
    const created = await initiateMultipart(key, contentType);
    uploadId = created.uploadId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'R2 initiate failed';
    return jsonError('INTERNAL', msg, 500);
  }

  const { data: session, error: insErr } = await supabase
    .from('upload_sessions')
    .insert({
      tour_id: tourId,
      user_id: auth.userId,
      r2_key: key,
      upload_id: uploadId,
      total_size_bytes: fileSize,
      chunk_size_bytes: chunkSize,
      total_chunks: totalChunks,
      parts_completed: [],
      status: 'in_progress',
    })
    .select('id')
    .single();

  if (insErr || !session) {
    return jsonError('INTERNAL', insErr?.message ?? 'Failed to create upload session.', 500);
  }

  const { error: upTourErr } = await supabase
    .from('tours')
    .update({ status: 'uploading', status_message: null })
    .eq('id', tourId);

  if (upTourErr) {
    return jsonError('INTERNAL', upTourErr.message, 500);
  }

  return jsonOk({ sessionId: session.id, uploadId, key });
}
