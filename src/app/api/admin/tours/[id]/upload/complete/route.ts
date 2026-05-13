import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { completeMultipart } from '@/lib/r2/multipart';
import { r2PublicUrl, isR2Configured } from '@/lib/r2/client';
import { uploadCompleteSchema } from '@/lib/validation/tour-upload';
import type { Database, Json } from '@/types/database.types';

type RouteParams = { params: Promise<{ id: string }> };

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

  const parsed = uploadCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { sessionId, parts } = parsed.data;

  const { data: session, error } = await supabase
    .from('upload_sessions')
    .select('id, tour_id, user_id, r2_key, upload_id, total_chunks, total_size_bytes, status')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !session) {
    return jsonError('NOT_FOUND', 'Upload session not found.', 404);
  }
  if (session.tour_id !== tourId) {
    return jsonError('FORBIDDEN', 'Session does not belong to this tour.', 403);
  }
  if (session.user_id !== auth.userId) {
    return jsonError('FORBIDDEN', 'Session belongs to another user.', 403);
  }
  if (session.status !== 'in_progress') {
    return jsonError('CONFLICT', 'Upload session is not active.', 409);
  }
  if (parts.length !== session.total_chunks) {
    return jsonError('VALIDATION_ERROR', 'parts length must match total_chunks.', 400);
  }

  try {
    await completeMultipart(session.r2_key, session.upload_id, parts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Complete multipart failed';
    return jsonError('INTERNAL', msg, 500);
  }

  const videoUrl = r2PublicUrl(session.r2_key);
  const now = new Date().toISOString();

  const sessionUpdate: Database['public']['Tables']['upload_sessions']['Update'] = {
    status: 'completed',
    completed_at: now,
    parts_completed: parts as unknown as Json,
  };

  const { error: sErr } = await supabase.from('upload_sessions').update(sessionUpdate).eq('id', sessionId);
  if (sErr) {
    return jsonError('INTERNAL', sErr.message, 500);
  }

  const { error: tErr } = await supabase
    .from('tours')
    .update({
      video_r2_key: session.r2_key,
      video_size_bytes: session.total_size_bytes,
      video_uploaded_at: now,
      status: 'uploading',
      status_message: null,
    })
    .eq('id', tourId);

  if (tErr) {
    return jsonError('INTERNAL', tErr.message, 500);
  }

  return jsonOk({ ok: true, videoUrl });
}
