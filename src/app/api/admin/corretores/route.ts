import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { createCorretorSchema } from '@/lib/validation/admin';

export async function POST(req: Request) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = createCorretorSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const row = parsed.data;
  const insert = {
    imobiliaria_id: row.imobiliaria_id,
    nome: row.nome,
    creci: row.creci || null,
    whatsapp: row.whatsapp,
    email: row.email || null,
    foto_url: row.foto_url || null,
  };

  const { data: imo } = await supabase
    .from('imobiliarias')
    .select('id')
    .eq('id', row.imobiliaria_id)
    .is('archived_at', null)
    .maybeSingle();

  if (!imo) {
    return jsonError('NOT_FOUND', 'Imobiliária not found or archived.', 404);
  }

  const { data, error } = await supabase.from('corretores').insert(insert).select('id').single();
  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ id: data.id }, 201);
}
