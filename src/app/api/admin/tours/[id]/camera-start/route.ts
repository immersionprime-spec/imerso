import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { tourCameraStartSchema } from '@/lib/validation/admin';
import type { Database } from '@/types/database.types';

type TourUpdate = Database['public']['Tables']['tours']['Update'];

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = tourCameraStartSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'position e target obrigatorios (3 numeros cada).', 400, parsed.error.flatten());
  }

  const { position: pos, target: tgt } = parsed.data;

  const { data: tour } = await supabase.from('tours').select('id').eq('id', id).maybeSingle();
  if (!tour) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  const patch: TourUpdate = {
    camera_start_position: { x: pos[0], y: pos[1], z: pos[2] },
    camera_start_target: { x: tgt[0], y: tgt[1], z: tgt[2] },
  };

  const { error } = await supabase.from('tours').update(patch).eq('id', id);
  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}
