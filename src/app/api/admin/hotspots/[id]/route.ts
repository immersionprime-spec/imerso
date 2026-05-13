import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import type { Database } from '@/types/database.types';
import { updateHotspotSchema } from '@/lib/validation/admin';

type HotspotUpdate = Database['public']['Tables']['tour_hotspots']['Update'];

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

  const parsed = updateHotspotSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const { data: existing } = await supabase.from('tour_hotspots').select('id').eq('id', id).maybeSingle();
  if (!existing) {
    return jsonError('NOT_FOUND', 'Hotspot not found.', 404);
  }

  const patch: HotspotUpdate = {};
  const d = parsed.data;
  if (d.titulo !== undefined) patch.titulo = d.titulo.trim();
  if (d.descricao !== undefined) patch.descricao = d.descricao.trim() || null;
  if (d.icone !== undefined) patch.icone = d.icone;
  if (d.posicao_x !== undefined) patch.posicao_x = d.posicao_x;
  if (d.posicao_y !== undefined) patch.posicao_y = d.posicao_y;
  if (d.posicao_z !== undefined) patch.posicao_z = d.posicao_z;
  if (d.ordem !== undefined) patch.ordem = d.ordem;

  if (Object.keys(patch).length === 0) {
    return jsonError('VALIDATION_ERROR', 'No fields to update.', 400);
  }

  const { error } = await supabase.from('tour_hotspots').update(patch).eq('id', id);
  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  const { id } = await params;

  const { data: existing } = await supabase.from('tour_hotspots').select('id').eq('id', id).maybeSingle();
  if (!existing) {
    return jsonError('NOT_FOUND', 'Hotspot not found.', 404);
  }

  const { error } = await supabase.from('tour_hotspots').delete().eq('id', id);
  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}
