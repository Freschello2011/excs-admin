/**
 * NAS 归档模块类型定义
 * 对应后端 01-contexts/nas-archive/ + 03-api ExCS-API.md §2.14
 */

export type NASSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

/** NAS 归档列表项（视图）*/
export interface NASArchiveListItem {
  id: number;
  content_id: number;
  content_name: string;
  hall_id: number;
  hall_name: string;
  exhibit_id: number | null;
  exhibit_name: string;
  uploader_id: number | null;
  uploader_name: string;
  file_size: number;
  status: NASSyncStatus;
  retry_count: number;
  last_error?: string;
  sha256?: string;
  agent_id?: string;
  nas_path: string;
  synced_at?: string | null;
  uploaded_at: string;
}

/** 列表查询参数 */
export interface NASArchiveListParams {
  hall_id?: number;
  exhibit_id?: number;
  uploader_id?: number;
  status?: NASSyncStatus | '';
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

/** Agent 心跳状态（stats 聚合用）*/
export interface NASAgentHeartbeatStatus {
  agent_id: string;
  online: boolean;
  last_seen_at: string;
  version: string;
  nas_model: string;
  disk_free: number;
}

/** 存储统计页 NAS 卡片数据 */
export interface NASStats {
  total_count: number; // synced 条数
  total_size: number;  // synced 总字节
  count_by_status: Record<NASSyncStatus, number>;
  agents: NASAgentHeartbeatStatus[];
}

/** 重新生成 Agent Token 响应 */
export interface NASRegenerateTokenResp {
  agent_token: string;
  hint: string;
}
