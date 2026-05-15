/** Proxy URL do viewer (`/api/public/tours/[id]/splat/scene.<ext>`) a partir da chave R2. */
export function tourSplatProxyUrl(
  tourId: string,
  splatR2Key: string | null | undefined,
  variant?: 'lite'
): string | null {
  const key = splatR2Key?.trim();
  if (!key) return null;
  const splatExt = key.split('.').pop()?.toLowerCase();
  const safeExt =
    splatExt === 'ksplat' || splatExt === 'splat' || splatExt === 'ply' ? splatExt : 'ply';
  const base = `/api/public/tours/${tourId}/splat/scene.${safeExt}`;
  return variant === 'lite' ? `${base}?variant=lite` : base;
}
