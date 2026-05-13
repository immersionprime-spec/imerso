import bcrypt from 'bcryptjs';
import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { createTourSchema } from '@/lib/validation/admin';

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

  const parsed = createTourSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const row = parsed.data;

  const { data: imo } = await supabase
    .from('imobiliarias')
    .select('id')
    .eq('id', row.imobiliaria_id)
    .is('archived_at', null)
    .maybeSingle();

  if (!imo) {
    return jsonError('NOT_FOUND', 'Imobiliária not found or archived.', 404);
  }

  if (row.corretor_id) {
    const { data: cor } = await supabase
      .from('corretores')
      .select('id')
      .eq('id', row.corretor_id)
      .eq('imobiliaria_id', row.imobiliaria_id)
      .eq('ativo', true)
      .maybeSingle();
    if (!cor) {
      return jsonError('VALIDATION_ERROR', 'Corretor invalid for this imobiliária.', 400);
    }
  }

  let password_hash: string | null = null;
  if (!row.is_public && row.password) {
    password_hash = await bcrypt.hash(row.password, 10);
  }

  const insert = {
    imobiliaria_id: row.imobiliaria_id,
    corretor_id: row.corretor_id ?? null,
    slug: row.slug,
    titulo: row.titulo,
    tipo: row.tipo,
    bairro: row.bairro || null,
    area_m2: row.area_m2 ?? null,
    quartos: row.quartos ?? null,
    valor: row.valor ?? null,
    modalidade: row.modalidade ?? null,
    descricao: row.descricao || null,
    is_public: row.is_public,
    password_hash,
    has_cinematic_mode: row.has_cinematic_mode,
    cobranca_cliente_brl: row.cobranca_cliente_brl ?? null,
    status: 'draft' as const,
  };

  const { data, error } = await supabase.from('tours').insert(insert).select('id, slug').single();
  if (error) {
    if (error.code === '23505') {
      return jsonError('CONFLICT', 'Slug already used for this imobiliária.', 409);
    }
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ id: data.id, slug: data.slug }, 201);
}
