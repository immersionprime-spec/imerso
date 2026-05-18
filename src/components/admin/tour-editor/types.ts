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
}
