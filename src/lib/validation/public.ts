import { z } from 'zod';

export const verifyTourPasswordSchema = z.object({
  password: z.string().min(1).max(200),
});

export const trackViewSchema = z.object({
  tourId: z.string().uuid(),
  fingerprint: z.string().min(8).max(128).optional(),
  duration_seconds: z.coerce.number().int().min(0).max(86400).optional(),
});

export const trackWhatsappSchema = z.object({
  tourId: z.string().uuid(),
  fingerprint: z.string().min(8).max(128).optional(),
});

const leadTipo = z.enum(['apartamento', 'casa', 'comercial', 'terreno', 'outro']);

export const publicLeadSchema = z
  .object({
    nome: z.string().min(2).max(200).trim(),
    whatsapp: z.string().min(8).max(40),
    email: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().email().optional()
    ),
    tipo_imovel: z.preprocess(
      (v) => (v === '' || v === undefined ? undefined : v),
      leadTipo.optional()
    ),
    cidade: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().max(120).optional()
    ),
    mensagem: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().max(8000).optional()
    ),
    consent: z.boolean().refine((v) => v === true, { message: 'consent_required' }),
  })
  .strict();
