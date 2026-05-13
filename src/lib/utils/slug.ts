/** Lowercase slug: letters, numbers, single hyphens (matches DB trigger). */
export function slugify(input: string): string {
  const s = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return s.length > 0 ? s : 'item';
}
