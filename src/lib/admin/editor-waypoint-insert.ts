import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type { Database, Json } from '@/types/database.types';
import { createEditorWaypointSchema } from '@/lib/validation/admin';

export type EditorWaypointPayload = z.infer<typeof createEditorWaypointSchema>;

type WpRow = Database['public']['Tables']['tour_waypoints']['Row'];
type WpInsert = Database['public']['Tables']['tour_waypoints']['Insert'];
type WpUpdate = Database['public']['Tables']['tour_waypoints']['Update'];

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

  // Verifica se já existe waypoint entre esses dois tours
  const { data: existing } = await supabase
    .from('tour_waypoints')
    .select('id, ordem')
    .eq('tour_id', tourId)
    .eq('next_tour_id', data.next_tour_id)
    .maybeSingle();

  const payload: WpUpdate = {
    position_x: data.position_x,
    position_y: data.position_y,
    position_z: data.position_z,
    target_x: data.target_x,
    target_y: data.target_y,
    target_z: data.target_z,
    duration_ms: 0,
    label: destTour.titulo,
    next_tour_id: data.next_tour_id,
    next_cam_position: nextCamPos as unknown as Json,
    next_cam_target: nextCamTgt as unknown as Json,
    proximity_threshold: data.proximity_threshold,
    label_distance: data.label_distance,
  };

  if (existing) {
    const { data: row, error } = await supabase
      .from('tour_waypoints')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single();

    if (error) return { error: error.message, code: error.code ?? undefined };
    return { id: row.id };
  }

  const { data: rows } = await supabase
    .from('tour_waypoints')
    .select('ordem')
    .eq('tour_id', tourId)
    .order('ordem', { ascending: false })
    .limit(1);
  const ordem = ((rows as Pick<WpRow, 'ordem'>[] | null)?.[0]?.ordem ?? -1) + 1;

  const insert: WpInsert = {
    tour_id: tourId,
    ordem,
    position_x: data.position_x,
    position_y: data.position_y,
    position_z: data.position_z,
    target_x: data.target_x,
    target_y: data.target_y,
    target_z: data.target_z,
    duration_ms: payload.duration_ms ?? 0,
    label: payload.label ?? null,
    next_tour_id: payload.next_tour_id ?? null,
    next_cam_position: payload.next_cam_position ?? null,
    next_cam_target: payload.next_cam_target ?? null,
    proximity_threshold: payload.proximity_threshold ?? 1.8,
    label_distance: payload.label_distance ?? 3.0,
  };

  const { data: row, error } = await supabase
    .from('tour_waypoints')
    .insert(insert)
    .select('id')
    .single();

  if (error) return { error: error.message, code: error.code ?? undefined };
  return { id: row.id };
}
