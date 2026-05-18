import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { createPortaWaypointSchema } from '@/lib/validation/admin';

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

  const parsed = createPortaWaypointSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Payload inválido.', 400, parsed.error.flatten());
  }

  const { data: tour } = await supabase.from('tours').select('id').eq('id', tourId).maybeSingle();
  if (!tour) return jsonError('NOT_FOUND', 'Tour não encontrado.', 404);

  const { data: destTour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', parsed.data.next_tour_id)
    .maybeSingle();
  if (!destTour) return jsonError('NOT_FOUND', 'Tour de destino não encontrado.', 404);

  const { data: rows } = await supabase
    .from('tour_waypoints')
    .select('ordem')
    .eq('tour_id', tourId)
    .order('ordem', { ascending: false })
    .limit(1);
  const ordem = (rows?.[0]?.ordem ?? -1) + 1;

  const d = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insert: Record<string, any> = {
    tour_id: tourId,
    ordem,
    position_x: d.position_x,
    position_y: d.position_y,
    position_z: d.position_z,
    target_x: d.target_x,
    target_y: d.target_y,
    target_z: d.target_z,
    duration_ms: 0,
    label: d.label,
    next_tour_id: d.next_tour_id,
    next_cam_position: d.next_cam_position,
    next_cam_target: d.next_cam_target,
    proximity_threshold: d.proximity_threshold ?? 1.8,
    label_distance: d.label_distance ?? 3.0,
  };

  const { data: row, error } = await supabase
    .from('tour_waypoints')
    .insert(insert as never)
    .select('id')
    .single();

  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ id: row.id }, 201);
}

export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  const { id: tourId } = await params;

  const { data, error } = await supabase
    .from('tour_waypoints')
    .select(
      'id, ordem, position_x, position_y, position_z, target_x, target_y, target_z, label, next_tour_id, next_cam_position, next_cam_target'
    )
    .eq('tour_id', tourId)
    .not('next_tour_id', 'is', null)
    .order('ordem', { ascending: true });

  if (error) return jsonError('INTERNAL', error.message, 500);

  return jsonOk({ portas: data ?? [] });
}
