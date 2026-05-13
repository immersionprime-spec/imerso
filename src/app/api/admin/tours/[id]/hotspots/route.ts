import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { createHotspotSchema } from '@/lib/validation/admin';

type RouteParams = { params: Promise<{ id: string }> };

const MAX_HOTSPOTS = Number(process.env.NEXT_PUBLIC_MAX_HOTSPOTS_PER_TOUR ?? 15);

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

  const parsed = createHotspotSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { data: tour } = await supabase.from('tours').select('id').eq('id', tourId).maybeSingle();
  if (!tour) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  const { count, error: countErr } = await supabase
    .from('tour_hotspots')
    .select('*', { count: 'exact', head: true })
    .eq('tour_id', tourId);

  if (countErr) {
    return jsonError('INTERNAL', countErr.message, 500);
  }
  if ((count ?? 0) >= MAX_HOTSPOTS) {
    return jsonError('VALIDATION_ERROR', `Maximum ${MAX_HOTSPOTS} hotspots per tour.`, 400);
  }

  let ordem = parsed.data.ordem;
  if (ordem === undefined) {
    const { data: rows } = await supabase
      .from('tour_hotspots')
      .select('ordem')
      .eq('tour_id', tourId)
      .order('ordem', { ascending: false })
      .limit(1);
    const max = rows?.[0]?.ordem ?? -1;
    ordem = max + 1;
  }

  const insert = {
    tour_id: tourId,
    titulo: parsed.data.titulo.trim(),
    descricao: parsed.data.descricao?.trim() || null,
    icone: parsed.data.icone,
    posicao_x: parsed.data.posicao_x,
    posicao_y: parsed.data.posicao_y,
    posicao_z: parsed.data.posicao_z,
    ordem,
  };

  const { data: row, error } = await supabase.from('tour_hotspots').insert(insert).select('id').single();
  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ id: row.id }, 201);
}
