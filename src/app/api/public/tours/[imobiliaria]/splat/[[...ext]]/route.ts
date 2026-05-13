import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyTourAccessToken, tourAccessCookieName } from '@/lib/auth/tour-access-token';
import { getR2 } from '@/lib/r2/client';
import { createAdminClient } from '@/lib/supabase/admin';

type RouteParams = { params: Promise<{ imobiliaria: string; ext?: string[] }> };

/** Presigned GET redirect; public tours or valid tour-access cookie for private/password tours. */
export async function GET(req: Request, { params }: RouteParams) {
  const { imobiliaria: tourId } = await params;
  const url = new URL(req.url);
  const variant = url.searchParams.get('variant');

  const supabase = createAdminClient();
  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, splat_r2_key, splat_r2_key_lite, status, archived_at, is_public, password_hash')
    .eq('id', tourId)
    .maybeSingle();

  if (error || !tour) {
    return new NextResponse(null, { status: 404 });
  }
  if (tour.archived_at) {
    return new NextResponse(null, { status: 404 });
  }
  if (tour.status !== 'ready') {
    return new NextResponse(null, { status: 404 });
  }

  const useLite = variant === 'lite' && Boolean(tour.splat_r2_key_lite?.trim());
  const key = (useLite ? tour.splat_r2_key_lite : tour.splat_r2_key)?.trim();
  if (!key) {
    return new NextResponse(null, { status: 404 });
  }

  const passwordProtected = Boolean(tour.password_hash);
  const needsCookie = tour.is_public === false || passwordProtected;
  if (needsCookie) {
    const cookieStore = await cookies();
    const token = cookieStore.get(tourAccessCookieName(tour.id))?.value;
    if (!token || !verifyTourAccessToken(token, tour.id)) {
      return new NextResponse(null, { status: 404 });
    }
  }

  try {
    const { client, bucket } = getR2();
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const signedUrl = await getSignedUrl(client, cmd, { expiresIn: 3600 });
    const res = NextResponse.redirect(signedUrl, 302);
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
