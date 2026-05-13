/** Digits only, with country code (e.g. 5547999999999). */
export function normalizeWhatsAppDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function buildWhatsAppUrl(phoneDigits: string, message: string): string {
  const q = encodeURIComponent(message);
  return `https://wa.me/${phoneDigits}?text=${q}`;
}
