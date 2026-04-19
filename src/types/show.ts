/* ==================== Show Types ==================== */

export type ShowStatus = 'draft' | 'published';
export type TrackType = 'video' | 'light' | 'mechanical' | 'audio' | 'custom';
export type ActionType = 'device' | 'scene' | 'media';

/** Show action within a track */
export interface ShowAction {
  id: number;
  device_id: number | null;
  device_name: string;
  name: string;
  action_type: ActionType;
  start_time_ms: number;
  duration_ms: number;
  command: string;
  params: Record<string, unknown>;
}

/** Show track */
export interface ShowTrack {
  id: number;
  name: string;
  track_type: TrackType;
  sort_order: number;
  actions: ShowAction[];
}

/** Show list item (GET /api/v1/shows) */
export interface ShowListItem {
  id: number;
  hall_id: number;
  exhibit_id: number;
  exhibit_name: string;
  name: string;
  base_content_id: number | null;
  duration_ms: number;
  version: number;
  status: ShowStatus;
  track_count: number;
  action_count: number;
  created_at: string;
  updated_at: string;
}

/** Show detail (GET /api/v1/shows/:showId) */
export interface ShowDetail {
  id: number;
  hall_id: number;
  exhibit_id: number;
  exhibit_name: string;
  name: string;
  base_content_id: number | null;
  base_content_name: string | null;
  sprite_sheets: SpriteSheet[] | null;
  waveform_peaks: string | null;
  duration_ms: number;
  pre_roll_ms: number;
  post_roll_ms: number;
  video_offset_ms: number;
  version: number;
  status: ShowStatus;
  tracks: ShowTrack[];
  created_at: string;
  updated_at: string;
}

/** Create show body */
export interface ShowCreateBody {
  hall_id: number;
  exhibit_id: number;
  name: string;
  base_content_id?: number;
  duration_ms: number;
}

/** Update show body (partial) */
export interface ShowUpdateBody {
  name?: string;
  base_content_id?: number;
  duration_ms?: number;
}

/** Add track body */
export interface TrackBody {
  name: string;
  track_type: TrackType;
  sort_order: number;
}

/** Add/update action body */
export interface ActionBody {
  device_id: number;
  start_time_ms: number;
  duration_ms: number;
  command: string;
  params: Record<string, unknown>;
}

/** Show list params */
export interface ShowListParams {
  hall_id: number;
  page?: number;
  page_size?: number;
  status?: ShowStatus | 'all';
}

/** Version history item */
export interface ShowVersionItem {
  version: number;
  published_at: string;
  track_count: number;
  action_count: number;
}

/* ==================== Timeline Editor Types ==================== */

/** Sprite sheet metadata for video frame strip */
export interface SpriteSheet {
  url: string;
  frame_width: number;
  frame_height: number;
  columns: number;
  rows: number;
  frame_count: number;
  fps: number;
  /** ms between frames; falls back to 1000/fps if omitted */
  frame_interval_ms?: number;
}

/** Save timeline request body (PUT /api/v1/shows/:showId/timeline) */
export interface SaveTimelineBody {
  tracks: SaveTimelineTrack[];
}

export interface SaveTimelineTrack {
  id?: number;
  name: string;
  track_type: TrackType;
  sort_order: number;
  actions: SaveTimelineAction[];
}

export interface SaveTimelineAction {
  id?: number;
  device_id?: number | null;
  name: string;
  action_type: ActionType;
  start_time_ms: number;
  duration_ms: number;
  command: string;
  params: Record<string, unknown>;
}
