// ==================== 用量概览 ====================

export interface AITokenUsageDTO {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_cny: number;
}

export interface OSSUsageDTO {
  total_size_bytes: number;
  total_size_gb: number;
  estimated_cost_cny: number;
}

export interface UsageOverviewDTO {
  ai_token: AITokenUsageDTO;
  oss_usage: OSSUsageDTO;
  total_cost_cny: number;
}

// ==================== 播放统计 ====================

export interface PlaybackDailyStat {
  id: number;
  date: string;
  hall_id: number;
  exhibit_id: number;
  content_id: number;
  play_count: number;
  total_duration_sec: number;
}

// ==================== 操作统计 ====================

export interface OperationDailyStat {
  id: number;
  date: string;
  hall_id: number;
  action_type: string;
  source: string;
  op_count: number;
}

// ==================== AI 互动统计 ====================

export interface AiInteractionDailyStat {
  id: number;
  date: string;
  hall_id: number;
  exhibit_id: number;
  session_count: number;
  total_rounds: number;
  avg_duration_sec: number;
}

export interface AiKeywordStat {
  id: number;
  date: string;
  hall_id: number;
  exhibit_id: number;
  keyword: string;
  hit_count: number;
}

export interface AiStatsDTO {
  interactions: AiInteractionDailyStat[];
  top_keywords: AiKeywordStat[];
}

// ==================== OSS 浏览 ====================

export interface OssObjectDTO {
  key: string;
  size: number;
  last_modified: string;
}

export interface OssBrowserResult {
  objects: OssObjectDTO[];
  next_marker: string;
  is_truncated: boolean;
}

// ==================== 查询参数 ====================

export interface UsageOverviewParams {
  hall_id: number;
  year: number;
  month: number;
}

export interface DateRangeStatsParams {
  hall_id: number;
  start_date: string;
  end_date: string;
}

export interface AiStatsParams extends DateRangeStatsParams {
  top_n?: number;
}

export interface OssBrowserParams {
  bucket: string;
  prefix?: string;
  marker?: string;
  page_size?: number;
}
