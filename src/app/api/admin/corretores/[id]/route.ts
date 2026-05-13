import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { updateCorretorSchema } from '@/lib/validation/admin';
import type { Database } from '@/types/database.types';

type CorretorUpdate = Database['public']['Tables']['corretores']['Update'];

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

  const parsed = updateCorretorSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>;

  if (patch.email === '') patch.email = null;
  if (patch.creci === '') patch.creci = null;
  if (patch.foto_url === '') patch.foto_url = null;

  const { data: existing } = await supabase.from('corretores').select('id').eq('id', id).maybeSingle();
  if (!existing) {
    return jsonError('NOT_FOUND', 'Corretor not found.', 404);
  }

  const { error } = await supabase.from('corretores').update(patch as CorretorUpdate).eq('id', id);
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

  const { data: existing } = await supabase.from('corretores').select('id').eq('id', id).maybeSingle();
  if (!existing) {
    return jsonError('NOT_FOUND', 'Corretor not found.', 404);
  }

  const { error } = await supabase.from('corretores').update({ ativo: false }).eq('id', id);
  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ ok: true });
}
