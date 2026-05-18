import type { CamVec } from '@/lib/admin/camera-vec';

export type { CamVec };
export { parseCamVec } from '@/lib/admin/camera-vec';

export interface SavedWaypoint {
  id: string;
  position_x: number;
  position_y: number;
  position_z: number;
  target_x: number;
  target_y: number;
  target_z: number;
  label: string | null;
  next_tour_id: string | null;
  next_cam_position: CamVec | null;
  next_cam_target: CamVec | null;
  proximity_threshold: number;
  label_distance: number;
}

export interface PendingWaypoint {
  id: string;
  position_x: number;
  position_y: number;
  position_z: number;
  target_x: number;
  target_y: number;
  target_z: number;
  next_tour_id: string | null;
  proximity_threshold: number;
  label_distance: number;
  status: 'pending' | 'saved';
  next_cam_position?: CamVec | null;
  next_cam_target?: CamVec | null;
}

export function isWaypointEntryComplete(wp: Pick<SavedWaypoint, 'next_cam_position'>): boolean {
  return wp.next_cam_position !== null;
}
