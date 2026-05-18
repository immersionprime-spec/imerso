import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { insertEditorWaypoint } from '@/lib/admin/editor-waypoint-insert';
import { createEditorWaypointSchema, createWaypointSchema } from '@/lib/validation/admin';

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

  const editorParsed = createEditorWaypointSchema.safeParse(body);
  if (editorParsed.success) {
    const { data: tour } = await supabase.from('tours').select('id').eq('id', tourId).maybeSingle();
    if (!tour) {
      return jsonError('NOT_FOUND', 'Tour not found.', 404);
    }

    const result = await insertEditorWaypoint(supabase, tourId, editorParsed.data);
    if ('error' in result) {
      return jsonError('INTERNAL', result.error, 500);
    }
    return jsonOk({ id: result.id }, 201);
  }

  const parsed = createWaypointSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id, has_cinematic_mode')
    .eq('id', tourId)
    .maybeSingle();

  if (!tour) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  if (!tour.has_cinematic_mode) {
    return jsonError('VALIDATION_ERROR', 'Enable cinematic mode on the tour first.', 400);
  }

  let ordem = parsed.data.ordem;
  if (ordem === undefined) {
    const { data: rows } = await supabase
      .from('tour_waypoints')
      .select('ordem')
      .eq('tour_id', tourId)
      .order('ordem', { ascending: false })
      .limit(1);
    const max = rows?.[0]?.ordem ?? -1;
    ordem = max + 1;
  }

  const insert = {
    tour_id: tourId,
    ordem,
    position_x: parsed.data.position_x,
    position_y: parsed.data.position_y,
    position_z: parsed.data.position_z,
    target_x: parsed.data.target_x,
    target_y: parsed.data.target_y,
    target_z: parsed.data.target_z,
    duration_ms: parsed.data.duration_ms ?? 4000,
  };

  const { data: row, error } = await supabase.from('tour_waypoints').insert(insert).select('id').single();
  if (error) {
    if (error.code === '23505') {
      return jsonError('CONFLICT', 'Waypoint order already exists for this tour.', 409);
    }
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ id: row.id }, 201);
}
