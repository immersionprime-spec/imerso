import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { updateImobiliariaSchema } from '@/lib/validation/admin';
import type { Database } from '@/types/database.types';

type ImobiliariaUpdate = Database['public']['Tables']['imobiliarias']['Update'];

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

  const parsed = updateImobiliariaSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const nullableClears = ['email_contato', 'endereco', 'logo_url', 'cnpj'];
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (nullableClears.includes(k) && v === '') {
      patch[k] = null;
    } else {
      patch[k] = v;
    }
  }

  if (Object.keys(patch).length === 0) {
    return jsonError('VALIDATION_ERROR', 'No fields to update.', 400);
  }

  const { data: existing } = await supabase
    .from('imobiliarias')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return jsonError('NOT_FOUND', 'Imobiliária not found.', 404);
  }

  const { error } = await supabase.from('imobiliarias').update(patch as ImobiliariaUpdate).eq('id', id);
  if (error) {
    if (error.code === '23505') {
      return jsonError('CONFLICT', 'Slug already in use.', 409);
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

  const { data: existing } = await supabase
    .from('imobiliarias')
    .select('id, archived_at')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return jsonError('NOT_FOUND', 'Imobiliária not found.', 404);
  }

  const { error } = await supabase
    .from('imobiliarias')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}
