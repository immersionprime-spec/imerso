import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { patchEditorWaypointSchema } from '@/lib/validation/admin';
import type { Database } from '@/types/database.types';

type RouteParams = { params: Promise<{ id: string; waypointId: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  const { id: tourId, waypointId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = patchEditorWaypointSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Payload inválido.', 400, parsed.error.flatten());
  }

  if (Object.keys(parsed.data).length === 0) {
    return jsonError('VALIDATION_ERROR', 'Nenhum campo para atualizar.', 400);
  }

  const { data: existing } = await supabase
    .from('tour_waypoints')
    .select('id')
    .eq('id', waypointId)
    .eq('tour_id', tourId)
    .maybeSingle();

  if (!existing) {
    return jsonError('NOT_FOUND', 'Waypoint não encontrado.', 404);
  }

  type WpUpdate = Database['public']['Tables']['tour_waypoints']['Update'];
  const update: WpUpdate = {
    proximity_threshold: parsed.data.proximity_threshold,
    label_distance: parsed.data.label_distance,
    next_cam_position: parsed.data.next_cam_position as WpUpdate['next_cam_position'],
    next_cam_target: parsed.data.next_cam_target as WpUpdate['next_cam_target'],
  };

  // Remove campos undefined para não sobrescrever com null
  (Object.keys(update) as (keyof WpUpdate)[]).forEach((k) => {
    if (update[k] === undefined) delete update[k];
  });

  const { error } = await supabase
    .from('tour_waypoints')
    .update(update)
    .eq('id', waypointId)
    .eq('tour_id', tourId);

  if (error) return jsonError('INTERNAL', error.message, 500);
  return jsonOk({ ok: true });
}
