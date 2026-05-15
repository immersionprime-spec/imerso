import bcrypt from 'bcryptjs';
import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { updateTourSchema } from '@/lib/validation/admin';
import type { Database } from '@/types/database.types';

type TourUpdate = Database['public']['Tables']['tours']['Update'];

type RouteParams = { params: Promise<{ id: string }> };

const PATCH_KEYS = [
  'corretor_id',
  'slug',
  'titulo',
  'tipo',
  'bairro',
  'cidade',
  'estado',
  'area_m2',
  'quartos',
  'valor',
  'modalidade',
  'descricao',
  'foto_capa_url',
  'is_public',
  'has_cinematic_mode',
  'cobranca_cliente_brl',
  'status',
  'status_message',
  'splat_r2_key',
] as const;

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

  const parsed = updateTourSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const d = parsed.data;

  const { data: tour } = await supabase.from('tours').select('id, imobiliaria_id').eq('id', id).maybeSingle();
  if (!tour) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  if (d.corretor_id !== undefined && d.corretor_id !== null) {
    const { data: cor } = await supabase
      .from('corretores')
      .select('id')
      .eq('id', d.corretor_id)
      .eq('imobiliaria_id', tour.imobiliaria_id)
      .eq('ativo', true)
      .maybeSingle();
    if (!cor) {
      return jsonError('VALIDATION_ERROR', 'Corretor invalid for this imobiliária.', 400);
    }
  }

  const patch: Record<string, unknown> = {};

  const fields = d as Record<string, unknown>;
  for (const key of PATCH_KEYS) {
    const v = fields[key];
    if (v === undefined) continue;
    patch[key] = v === '' ? null : v;
  }

  if (d.is_public === true) {
    patch.password_hash = null;
  } else if (d.password && d.password.length > 0) {
    patch.password_hash = await bcrypt.hash(d.password, 10);
  }

  if (Object.keys(patch).length === 0) {
    return jsonError('VALIDATION_ERROR', 'No fields to update.', 400);
  }

  const { error } = await supabase.from('tours').update(patch as TourUpdate).eq('id', id);
  if (error) {
    if (error.code === '23505') {
      return jsonError('CONFLICT', 'Slug conflict.', 409);
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

  const { data: existing } = await supabase.from('tours').select('id').eq('id', id).maybeSingle();
  if (!existing) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  const { error } = await supabase
    .from('tours')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}
