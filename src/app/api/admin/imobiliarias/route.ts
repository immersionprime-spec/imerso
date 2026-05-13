import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { createImobiliariaSchema } from '@/lib/validation/admin';

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

  const parsed = createImobiliariaSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const row = parsed.data;
  const insert = {
    nome: row.nome,
    slug: row.slug,
    whatsapp_principal: row.whatsapp_principal,
    email_contato: row.email_contato || null,
    endereco: row.endereco || null,
    cor_primaria: row.cor_primaria ?? '#4F8EF7',
    logo_url: row.logo_url || null,
    cnpj: row.cnpj || null,
    cidade: row.cidade ?? 'Balneário Camboriú',
    estado: row.estado ?? 'SC',
  };

  const { data, error } = await supabase.from('imobiliarias').insert(insert).select('id, slug').single();
  if (error) {
    if (error.code === '23505') {
      return jsonError('CONFLICT', 'Slug already in use.', 409);
    }
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ id: data.id, slug: data.slug }, 201);
}
