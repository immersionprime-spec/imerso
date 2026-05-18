export interface CamVec {
  x: number;
  y: number;
  z: number;
}

export function parseCamVec(json: unknown): CamVec | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  const z = Number(o.z);
  if (![x, y, z].every((n) => Number.isFinite(n))) return null;
  return { x, y, z };
}
