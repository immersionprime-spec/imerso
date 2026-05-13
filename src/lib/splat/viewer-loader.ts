'use client';

export async function loadSplatViewer() {
  const mod = await import('@mkkellogg/gaussian-splats-3d');
  return { Viewer: mod.Viewer, RenderMode: mod.RenderMode };
}
