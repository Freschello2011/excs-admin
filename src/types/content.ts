/* ==================== Enums ==================== */

export type EncryptionMode = 'standard' | 'fuse' | 'none';
// Phase 10：扩展 5 个生命周期状态（PRD §7.2）；老代码常见的 'processing' / 'ready' / 'error'
// 仅来自老流水线路径，新 vendor 路径只用 pending_accept / bound / rejected / withdrawn / archived。
export type ContentStatus =
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'error'
  | 'pending_accept'
  | 'bound'
  | 'rejected'
  | 'withdrawn'
  | 'archived';

// Phase 10：驳回原因码（PRD §7.5 6 码之一）
export type ContentRejectReason =
  | 'spec_mismatch'
  | 'poor_quality'
  | 'wrong_content'
  | 'file_corrupted'
  | 'bad_naming'
  | 'other';

export const REJECT_REASON_LABEL: Record<ContentRejectReason, string> = {
  spec_mismatch: '规格不符',
  poor_quality: '画质不够',
  wrong_content: '内容错误',
  file_corrupted: '文件损坏',
  bad_naming: '命名规范不符',
  other: '其他',
};
export type TagSource = 'ai' | 'manual';
export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type TagDimension = 'visual_element' | 'scene' | 'theme' | 'mood';
export type DistributionStatus = 'pending' | 'downloading' | 'ready' | 'failed';
export type DistributionType = 'auto' | 'manual';

/* ==================== Nested Value Objects ==================== */

export interface STSCredential {
  access_key_id: string;
  access_key_secret: string;
  security_token: string;
  expiration: string;
}

export interface PipelineStage {
  name: string;
  status: PipelineStageStatus;
  progress?: number;
  completed_at?: string;
  error?: string;
  message?: string;
  duration_seconds?: number;
}

/* ==================== Content ==================== */

export type TaggingStatus = '' | 'pending' | 'processing' | 'done' | 'failed';

/** Flat content list item (replaces ContentGroupListItem)
 *  Phase 10: hall_id 改为可空（vendor pending_accept 时尚未归属 hall）；新增 vendor_id /
 *  content_version / parent_content_id / reject_reasons / hall_name 等字段。
 */
export interface ContentListItem {
  id: number;
  hall_id?: number | null;
  hall_name?: string;
  vendor_id?: number | null;
  exhibit_id: number | null;
  name: string;
  type: string;
  encryption_mode: EncryptionMode;
  version: number;
  content_version?: number;
  parent_content_id?: number | null;
  status: ContentStatus;
  pipeline_status: string;
  tagging_status: TaggingStatus;
  duration: number;
  file_size: number;
  has_audio: boolean;
  thumbnail_url?: string;
  reject_reasons?: ContentRejectReason[];
  reject_note?: string;
  reviewed_at?: string;
  created_at: string;
}

/** Content detail (extends list item) */
export interface ContentDetail extends ContentListItem {
  tags_count: number;
  exhibit_name?: string;
}

/** Content list query params */
export interface ContentListParams {
  hall_id: number;
  page?: number;
  page_size?: number;
  keyword?: string;
  status?: ContentStatus;
}

/* ==================== Upload ==================== */

export interface RequestUploadBody {
  filename: string;
  file_size: number;
  content_type: string;
  slice_index?: number;
}

export interface RequestUploadResult {
  content_id: number;
  sts?: STSCredential;
  oss_endpoint: string;
  bucket: string;
  object_key: string;
  presigned_url?: string;
}

export interface UploadCompleteBody {
  content_id: number;
}

export interface UploadCompleteResult {
  pipeline_id: string;
  status: string;
}

/* ==================== Pipeline ==================== */

export interface PipelineStatusResult {
  content_id: number;
  version: number;
  stages: PipelineStage[];
  overall_status: string;
  overall_progress: number;
  eta_seconds?: number;
  queue_position?: number;
  current_message?: string;
}

/* ==================== Tags ==================== */

export interface ContentTag {
  id: number;
  content_id: number;
  tag: string;
  dimension: TagDimension;
  start_ms: number;
  end_ms: number;
  source: TagSource;
  confidence?: number;
  created_at?: string;
}

export interface CreateTagBody {
  content_id: number;
  tag: string;
  start_ms: number;
  end_ms: number;
}

export interface UpdateTagBody {
  tag?: string;
  start_ms?: number;
  end_ms?: number;
}

export interface TagSearchParams {
  exhibit_id: number;
  keyword: string;
}

/* ==================== Distribution ==================== */

export interface DistributionItem {
  id: number;
  content_id: number;
  filename: string;
  hall_app_instance_id: number;
  instance_exhibit_name: string;
  distribution_type: DistributionType;
  status: DistributionStatus;
  progress: number;
  updated_at: string;
}

export interface DistributionListParams {
  hall_id: number;
  status?: DistributionStatus;
}

export interface DownloadUrlResult {
  download_url: string;
  filename: string;
  file_size: number;
  sha256: string;
  expires_in: number;
}

/* ==================== Watermark ==================== */

export interface WatermarkBody {
  is_watermarked: boolean;
}

/* ==================== OSS Stats ==================== */

export interface BucketStats {
  object_count: number;
  total_size_bytes: number;
}

export interface OSSStatsResult {
  hall_id: number;
  raw_bucket: BucketStats;
  encrypted_bucket: BucketStats;
  thumbnail_bucket: BucketStats;
}

export interface ContentCleanupResult {
  deleted_objects: number;
  freed_bytes: number;
}

/* ==================== Queue Status ==================== */

export interface QueueStatus {
  queue: { pending: number; active: number };
  current_task: QueueTaskInfo | null;
  pending_tasks: QueueTaskInfo[];
  estimated_wait_minutes: number;
}

export interface QueueTaskInfo {
  content_id: number;
  content_name: string;
  file_name?: string;
  file_size?: number;
  stage?: string;
  overall_progress?: number;
  eta_seconds?: number;
}

/* ==================== Exhibit Content ==================== */

export interface ExhibitContentItem {
  content_id: number;
  filename: string;
  type: string;
  thumbnail_url?: string;
  duration_ms: number;
  file_size: number;
  has_audio: boolean;
  is_watermarked: boolean;
  status: string;
  version: string;
  pipeline_status: string;
  pipeline_stages: PipelineStage[];
  overall_progress: number;
  eta_seconds?: number;
  tagging_status?: string;
}

/* ==================== Slideshow ==================== */

export type SlideshowTransition = 'fade' | 'slide';

export interface SlideshowConfig {
  exhibit_id: number;
  background_content_id: number;
  image_content_ids: number[];
  transition: SlideshowTransition;
}

export interface ConfigureSlideshowBody {
  background_content_id: number;
  image_content_ids: number[];
  transition?: SlideshowTransition;
}
