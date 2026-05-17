import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { updatePortaWaypointSchema } from '@/lib/validation/admin';

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: RouteParams) {
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

  const parsed = updatePortaWaypointSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Payload inválido.', 400, parsed.error.flatten());
  }

  const { data: existing } = await supabase
    .from('tour_waypoints')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return jsonError('NOT_FOUND', 'Waypoint não encontrado.', 404);

  const d = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  if (d.position_x !== undefined) patch.position_x = d.position_x;
  if (d.position_y !== undefined) patch.position_y = d.position_y;
  if (d.position_z !== undefined) patch.position_z = d.position_z;
  if (d.target_x !== undefined) patch.target_x = d.target_x;
  if (d.target_y !== undefined) patch.target_y = d.target_y;
  if (d.target_z !== undefined) patch.target_z = d.target_z;
  if (d.label !== undefined) patch.label = d.label;
  if (d.next_tour_id !== undefined) patch.next_tour_id = d.next_tour_id;
  if (d.next_cam_position !== undefined) patch.next_cam_position = d.next_cam_position;
  if (d.next_cam_target !== undefined) patch.next_cam_target = d.next_cam_target;

  if (Object.keys(patch).length === 0) {
    return jsonError('VALIDATION_ERROR', 'Nenhum campo para atualizar.', 400);
  }

  const { error } = await supabase
    .from('tour_waypoints')
    .update(patch as never)
    .eq('id', id);
  if (error) return jsonError('INTERNAL', error.message, 500);

  return jsonOk({ ok: true });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  const { id } = await params;

  const { data: existing } = await supabase
    .from('tour_waypoints')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return jsonError('NOT_FOUND', 'Waypoint não encontrado.', 404);

  const { error } = await supabase.from('tour_waypoints').delete().eq('id', id);
  if (error) return jsonError('INTERNAL', error.message, 500);

  return jsonOk({ ok: true });
}
