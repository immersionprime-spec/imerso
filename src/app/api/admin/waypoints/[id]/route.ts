import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import type { Database } from '@/types/database.types';
import { updateWaypointSchema } from '@/lib/validation/admin';

type WaypointUpdate = Database['public']['Tables']['tour_waypoints']['Update'];

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

  const parsed = updateWaypointSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { data: existing } = await supabase.from('tour_waypoints').select('id').eq('id', id).maybeSingle();
  if (!existing) {
    return jsonError('NOT_FOUND', 'Waypoint not found.', 404);
  }

  const patch: WaypointUpdate = {};
  const d = parsed.data;
  if (d.ordem !== undefined) patch.ordem = d.ordem;
  if (d.position_x !== undefined) patch.position_x = d.position_x;
  if (d.position_y !== undefined) patch.position_y = d.position_y;
  if (d.position_z !== undefined) patch.position_z = d.position_z;
  if (d.target_x !== undefined) patch.target_x = d.target_x;
  if (d.target_y !== undefined) patch.target_y = d.target_y;
  if (d.target_z !== undefined) patch.target_z = d.target_z;
  if (d.duration_ms !== undefined) patch.duration_ms = d.duration_ms;

  if (Object.keys(patch).length === 0) {
    return jsonError('VALIDATION_ERROR', 'No fields to update.', 400);
  }

  const { error } = await supabase.from('tour_waypoints').update(patch).eq('id', id);
  if (error) {
    if (error.code === '23505') {
      return jsonError('CONFLICT', 'Waypoint order conflict.', 409);
    }
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  const { id } = await params;

  const { data: existing } = await supabase.from('tour_waypoints').select('id').eq('id', id).maybeSingle();
  if (!existing) {
    return jsonError('NOT_FOUND', 'Waypoint not found.', 404);
  }

  const { error } = await supabase.from('tour_waypoints').delete().eq('id', id);
  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}
