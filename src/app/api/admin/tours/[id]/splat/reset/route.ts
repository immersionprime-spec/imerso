import { requireSuperAdminApi, typedAdminSupabase } from '@/lib/auth/api-admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import type { Database } from '@/types/database.types';

type TourUpdate = Database['public']['Tables']['tours']['Update'];

type RouteParams = { params: Promise<{ id: string }> };

/** POST: clear splat fields in DB and set tour to draft. Does not delete R2 objects. */
export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireSuperAdminApi();
  if (!auth.ok) return auth.response;
  const supabase = typedAdminSupabase(auth.supabase);

  const { id } = await params;

  const { data: tour } = await supabase.from('tours').select('id').eq('id', id).maybeSingle();

  if (!tour) return jsonError('NOT_FOUND', 'Tour not found.', 404);

  const patch: TourUpdate = {
    splat_r2_key: null,
    splat_r2_key_lite: null,
    splat_size_bytes: null,
    splat_size_bytes_lite: null,
    finalized_at: null,
    status_message: null,
    camera_start_position: null,
    camera_start_target: null,
    status: 'draft',
  };

  const { error } = await supabase.from('tours').update(patch).eq('id', id);

  if (error) return jsonError('INTERNAL', error.message, 500);

  return jsonOk({ ok: true });
}
