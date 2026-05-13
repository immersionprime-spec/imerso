import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { abortMultipart } from '@/lib/r2/multipart';
import { isR2Configured } from '@/lib/r2/client';
import { uploadAbortSchema } from '@/lib/validation/tour-upload';
import type { Database } from '@/types/database.types';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  const { id: tourId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = uploadAbortSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { sessionId } = parsed.data;

  const { data: session, error } = await supabase
    .from('upload_sessions')
    .select('id, tour_id, user_id, r2_key, upload_id, status')
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
    return jsonOk({ ok: true });
  }

  if (isR2Configured()) {
    try {
      await abortMultipart(session.r2_key, session.upload_id);
    } catch {
      // Best-effort abort; still mark session aborted.
    }
  }

  const sessionUpdate: Database['public']['Tables']['upload_sessions']['Update'] = {
    status: 'aborted',
  };

  await supabase.from('upload_sessions').update(sessionUpdate).eq('id', sessionId);

  await supabase
    .from('tours')
    .update({ status: 'draft', status_message: 'Upload aborted.' })
    .eq('id', tourId)
    .in('status', ['uploading']);

  return jsonOk({ ok: true });
}
