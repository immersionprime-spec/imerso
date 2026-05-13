import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { signPart } from '@/lib/r2/multipart';
import { isR2Configured } from '@/lib/r2/client';
import { uploadSignSchema } from '@/lib/validation/tour-upload';

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

  const parsed = uploadSignSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { sessionId, partNumber } = parsed.data;

  const { data: session, error } = await supabase
    .from('upload_sessions')
    .select('id, tour_id, user_id, r2_key, upload_id, total_chunks, status')
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
  if (partNumber > session.total_chunks) {
    return jsonError('VALIDATION_ERROR', 'partNumber exceeds total_chunks.', 400);
  }

  try {
    const url = await signPart(session.r2_key, session.upload_id, partNumber);
    return jsonOk({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sign failed';
    return jsonError('INTERNAL', msg, 500);
  }
}
