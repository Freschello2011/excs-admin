// ==================== 版本管理 ====================

export interface AppRelease {
  id: number;
  platform: string;
  arch: string;
  version: string;
  oss_key: string;
  file_size: number;
  sha256: string;
  release_notes: string;
  created_at: string;
}

export interface HallAppVersion {
  hall_id: number;
  target_version: string;
  rollout_status: string; // pending / rolling / done
  updated_at: string;
}

// ==================== 请求参数 ====================

export interface CreateReleaseBody {
  platform: string;
  arch: string;
  version: string;
  oss_key: string;
  file_size: number;
  sha256: string;
  release_notes?: string;
}

export interface SetHallVersionBody {
  target_version: string;
}

export interface ReleaseListParams {
  platform?: string;
  page?: number;
  page_size?: number;
}
