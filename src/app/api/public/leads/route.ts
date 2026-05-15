import { createAdminClient } from '@/lib/supabase/admin';
import { jsonError, jsonOk } from '@/lib/api/errors';
import { getClientIp, rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { publicLeadSchema } from '@/lib/validation/public';
import { buildWhatsAppUrl, normalizeWhatsAppDigits } from '@/lib/utils/whatsapp';

function normalizeLeadWhatsApp(input: string): string | null {
  const d = normalizeWhatsAppDigits(input);
  if (d.length < 10 || d.length > 15) return null;
  return `+${d}`;
}

function founderWhatsAppDigits(): string | null {
  const raw = process.env.NEXT_PUBLIC_WHATSAPP_FOUNDER?.trim();
  if (!raw) return null;
  const d = normalizeWhatsAppDigits(raw);
  return d.length >= 10 ? d : null;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`leads:${ip}`, RATE_LIMITS.LEADS);
  if (!rl.ok) {
    return jsonError('RATE_LIMITED', 'Too many requests.', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }

  const parsed = publicLeadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Invalid payload.', 400, parsed.error.flatten());
  }

  const d = parsed.data;
  const whatsappStored = normalizeLeadWhatsApp(d.whatsapp);
  if (!whatsappStored) {
    return jsonError('VALIDATION_ERROR', 'Invalid WhatsApp number.', 400);
  }

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('leads')
    .insert({
      nome: d.nome,
      whatsapp: whatsappStored,
      email: d.email?.trim() || null,
      tipo_imovel: d.tipo_imovel ?? null,
      cidade: d.cidade?.trim() || null,
      mensagem: d.mensagem?.trim() || null,
      origem: 'landing',
      status: 'novo',
    })
    .select('id')
    .single();

  if (error || !row) {
    return jsonError('INTERNAL', error?.message ?? 'Failed to save lead.', 500);
  }

  const founder = founderWhatsAppDigits();
  if (!founder) {
    return jsonError(
      'SERVICE_UNAVAILABLE',
      'NEXT_PUBLIC_WHATSAPP_FOUNDER is not configured.',
      503
    );
  }

  const defaultMsg = process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE_DEFAULT?.trim() ?? '';
  const lines = [
    `Olá! Sou ${d.nome}.`,
    'Acabei de solicitar um tour 3D pelo site Imerso.',
    d.tipo_imovel ? `Tipo de imóvel: ${d.tipo_imovel}.` : '',
    d.cidade ? `Cidade: ${d.cidade}.` : '',
    d.mensagem ? `Mensagem: ${d.mensagem}` : '',
    defaultMsg ? `Ref.: ${defaultMsg}` : '',
  ].filter(Boolean);
  const text = lines.join(' ');
  const whatsappRedirectUrl = buildWhatsAppUrl(founder, text);

  return jsonOk({ id: row.id, whatsappRedirectUrl });
}
