import { cookies } from 'next/headers';
import { fetchPublicTourPayloadWithCookies } from '@/lib/data/public-tour';
import { jsonError, jsonOk } from '@/lib/api/errors';

type RouteParams = { params: Promise<{ imobiliaria: string; tour: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { imobiliaria, tour } = await params;
  const cookieStore = await cookies();

  const result = await fetchPublicTourPayloadWithCookies(imobiliaria, tour, (n) => cookieStore.get(n)?.value);

  if (result.ok === false) {
    if (result.code === 'PASSWORD_REQUIRED') {
      return jsonError('PASSWORD_REQUIRED', 'Password required.', 401);
    }
    return jsonError('NOT_FOUND', 'Tour not found.', 404);
  }

  return jsonOk(result.data);
}
