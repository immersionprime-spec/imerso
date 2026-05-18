import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  const { id: tourId } = await params;

  const { data: tour } = await supabase
    .from('tours')
    .select('id, imobiliaria_id')
    .eq('id', tourId)
    .maybeSingle();

  if (!tour) {
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  const { data: tours, error } = await supabase
    .from('tours')
    .select('id, titulo')
    .eq('imobiliaria_id', tour.imobiliaria_id)
    .eq('status', 'ready')
    .is('archived_at', null)
    .neq('id', tourId)
    .order('titulo', { ascending: true });

  if (error) {
    return jsonError('INTERNAL', error.message, 500);
  }

  return jsonOk({ tours: tours ?? [] });
}
