import { S3Client } from '@aws-sdk/client-s3';

function requireR2Env(): { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string } {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicUrl = process.env.R2_PUBLIC_URL?.trim()?.replace(/\/$/, '');
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error('R2 env missing: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL');
  }
  return { endpoint, accessKeyId, secretAccessKey, bucket, publicUrl };
}

let cached: { client: S3Client; bucket: string; publicUrl: string } | null = null;

export function getR2(): { client: S3Client; bucket: string; publicUrl: string } {
  if (cached) return cached;
  const { endpoint, accessKeyId, secretAccessKey, bucket, publicUrl } = requireR2Env();
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  cached = { client, bucket, publicUrl };
  return cached;
}

export function r2PublicUrl(key: string): string {
  const { publicUrl } = getR2();
  return `${publicUrl}/${key.replace(/^\//, '')}`;
}

export function isR2Configured(): boolean {
  try {
    requireR2Env();
    return true;
  } catch {
    return false;
  }
}
