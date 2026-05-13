import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2 } from './client';

export async function initiateMultipart(key: string, contentType: string) {
  const { client, bucket } = getR2();
  const cmd = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const res = await client.send(cmd);
  const uploadId = res.UploadId;
  if (!uploadId) throw new Error('CreateMultipartUpload missing UploadId');
  return { uploadId, key };
}

export async function signPart(key: string, uploadId: string, partNumber: number) {
  const { client, bucket } = getR2();
  const cmd = new UploadPartCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(client, cmd, { expiresIn: 3600 });
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>
) {
  const { client, bucket } = getR2();
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber).map((p) => ({
        ETag: p.ETag.startsWith('"') ? p.ETag : `"${p.ETag}"`,
        PartNumber: p.PartNumber,
      })),
    },
  });
  return client.send(cmd);
}

export async function abortMultipart(key: string, uploadId: string) {
  const { client, bucket } = getR2();
  const cmd = new AbortMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
  });
  return client.send(cmd);
}

export async function uploadDirect(key: string, body: Buffer | Uint8Array, contentType: string) {
  const { client, bucket } = getR2();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  return client.send(cmd);
}
