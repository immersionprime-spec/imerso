import { z } from 'zod';

const videoContentTypes = z.enum(['video/mp4', 'video/quicktime', 'video/x-m4v']);

export const uploadInitiateSchema = z
  .object({
    fileName: z.string().min(1).max(500),
    fileSize: z.number().int().positive(),
    contentType: videoContentTypes,
    totalChunks: z.number().int().min(1).max(5000),
    chunkSize: z.number().int().min(5 * 1024 * 1024).max(50 * 1024 * 1024),
  })
  .superRefine((data, ctx) => {
    const expected = Math.ceil(data.fileSize / data.chunkSize);
    if (data.totalChunks !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `totalChunks must equal ceil(fileSize/chunkSize) (expected ${expected})`,
        path: ['totalChunks'],
      });
    }
  });

export const uploadSignSchema = z.object({
  sessionId: z.string().uuid(),
  partNumber: z.number().int().min(1),
});

export const uploadCompleteSchema = z.object({
  sessionId: z.string().uuid(),
  parts: z
    .array(
      z.object({
        ETag: z.string().min(1),
        PartNumber: z.number().int().min(1),
      })
    )
    .min(1),
});

export const uploadAbortSchema = z.object({
  sessionId: z.string().uuid(),
});

// Dois caminhos: download remoto (splatUrl HTTP) OU upload já feito (r2Key + sizeBytes).
// O pipeline local usa r2Key; outros fluxos podem usar splatUrl.
export const splatFinalizeSchema = z
  .union([
    z.object({
      mode: z.literal('http').optional(),
      splatUrl: z.string().url(),
      costCredits: z.coerce.number().int().nonnegative().optional(),
    }),
    z
      .object({
        mode: z.literal('r2Key'),
        r2Key: z
          .string()
          .min(1)
          .max(500)
          .regex(/^tours\/[a-fA-F0-9-]+\/splat\/[A-Za-z0-9_-]+\.(ksplat|ply|splat)$/, {
            message: 'r2Key must match tours/<uuid>/splat/<id>.(ksplat|ply|splat)',
          }),
        sizeBytes: z.coerce.number().int().positive(),
        r2KeyLite: z
          .string()
          .min(1)
          .max(500)
          .regex(/^tours\/[a-fA-F0-9-]+\/splat\/[A-Za-z0-9_-]+\.(ksplat|ply|splat)$/, {
            message: 'r2KeyLite must match tours/<uuid>/splat/<id>.(ksplat|ply|splat)',
          })
          .optional(),
        sizeBytesLite: z.coerce.number().int().positive().optional(),
        costCredits: z.coerce.number().int().nonnegative().optional(),
      })
      .superRefine((data, ctx) => {
        const hasKey = Boolean(data.r2KeyLite?.trim());
        const hasSize = data.sizeBytesLite != null;
        if (hasKey !== hasSize) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'r2KeyLite and sizeBytesLite must both be set or both omitted',
            path: hasKey ? ['sizeBytesLite'] : ['r2KeyLite'],
          });
        }
      }),
  ])
  .transform((v) =>
    'mode' in v && v.mode === 'r2Key'
      ? v
      : { mode: 'http' as const, splatUrl: v.splatUrl, costCredits: v.costCredits }
  );

export const splatCostSchema = z.object({
  credits: z.coerce.number().int().nonnegative(),
  costUsd: z.coerce.number().nonnegative(),
});
