/* ==================== Scene Types ==================== */

export type SceneType = 'preset';

/** Scene action — one device command within a scene */
export interface SceneAction {
  device_id: number;
  command: string;
  params: Record<string, unknown>;
}

/** Scene list item (GET /api/v1/scenes?hall_id=) */
export interface SceneListItem {
  id: number;
  hall_id: number;
  name: string;
  icon: string;
  sort_order: number;
  scene_type: SceneType;
  action_count: number;
  is_current: boolean;
}

/** Scene detail (GET /api/v1/scenes/:sceneId — same shape as list but with actions) */
export interface SceneDetail extends SceneListItem {
  actions: SceneAction[];
}

/** Create/update scene body */
export interface SceneBody {
  hall_id: number;
  name: string;
  icon: string;
  sort_order: number;
  scene_type: SceneType;
  actions: SceneAction[];
}

/* ==================== Touch Nav Types ==================== */

/** Hot zone region — percentage-based coordinates */
export interface HotZoneRegion {
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
}

/** Transition type for navigation */
export type NavTransition = 'cut' | 'fade';

/** A hot zone within a nav node */
export interface HotZone {
  region: HotZoneRegion;
  target_node_key: string;
  transition: NavTransition;
}

/** Navigation node */
export interface NavNode {
  node_key: string;
  node_name: string;
  content_id: number;
  start_ms: number;
  end_ms: number;
  is_root: boolean;
  idle_timeout_sec: number;
  timeout_target_node_key: string;
  hot_zones: HotZone[];
}

/** Touch navigation graph for an exhibit */
export interface TouchNavGraph {
  exhibit_id: number;
  nodes: NavNode[];
}
