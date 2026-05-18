import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type { Database, Json } from '@/types/database.types';
import { createEditorWaypointSchema } from '@/lib/validation/admin';

export type EditorWaypointPayload = z.infer<typeof createEditorWaypointSchema>;

function parseCameraVec(json: Json | null): { x: number; y: number; z: number } | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  const z = Number(o.z);
  if (![x, y, z].every((n) => Number.isFinite(n))) return null;
  return { x, y, z };
}

export async function insertEditorWaypoint(
  supabase: SupabaseClient<Database>,
  tourId: string,
  data: EditorWaypointPayload
): Promise<{ id: string } | { error: string; code?: string }> {
  // Busca tour de destino para label e câmera de entrada padrão
  const { data: destTour } = await supabase
    .from('tours')
    .select('id, titulo, camera_start_position, camera_start_target')
    .eq('id', data.next_tour_id)
    .maybeSingle();

  if (!destTour) {
    return { error: 'Tour de destino não encontrado.' };
  }

  const nextCamPos =
    parseCameraVec(destTour.camera_start_position as Json | null) ?? { x: 0, y: 0, z: 0 };
  const nextCamTgt =
    parseCameraVec(destTour.camera_start_target as Json | null) ?? { x: 0, y: 0, z: 0 };

  // Verifica se já existe waypoint entre esses dois tours — se sim, atualiza em vez de inserir
  const { data: existing } = await supabase
    .from('tour_waypoints')
    .select('id, ordem')
    .eq('tour_id', tourId)
    .eq('next_tour_id', data.next_tour_id)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    position_x: data.position_x,
    position_y: data.position_y,
    position_z: data.position_z,
    target_x: data.target_x,
    target_y: data.target_y,
    target_z: data.target_z,
    duration_ms: 0,
    label: destTour.titulo,
    next_tour_id: data.next_tour_id,
    next_cam_position: nextCamPos,
    next_cam_target: nextCamTgt,
    proximity_threshold: data.proximity_threshold,
    label_distance: data.label_distance,
  };

  if (existing) {
    // UPDATE — waypoint entre esses dois tours já existe
    const { data: row, error } = await supabase
      .from('tour_waypoints')
      .update(payload as never)
      .eq('id', existing.id)
      .select('id')
      .single();

    if (error) return { error: error.message, code: error.code ?? undefined };
    return { id: row.id };
  }

  // INSERT — primeiro waypoint entre esses dois tours
  const { data: rows } = await supabase
    .from('tour_waypoints')
    .select('ordem')
    .eq('tour_id', tourId)
    .order('ordem', { ascending: false })
    .limit(1);
  const ordem = (rows?.[0]?.ordem ?? -1) + 1;

  const { data: row, error } = await supabase
    .from('tour_waypoints')
    .insert({ tour_id: tourId, ordem, ...payload } as never)
    .select('id')
    .single();

  if (error) return { error: error.message, code: error.code ?? undefined };
  return { id: row.id };
}
