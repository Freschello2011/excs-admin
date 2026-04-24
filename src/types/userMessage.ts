/**
 * Phase 9 站内消息类型（与后端 notification.UserMessageDTO 对齐）。
 * 与 types/notification.ts（运维短信配置/日志）语义不同，单独拆文件避免混用。
 */

export type UserMessageType =
  | 'authz.grant_expiring'
  | 'authz.grant_expired'
  | 'authz.vendor_created'
  | 'authz.vendor_primary_transferred'
  | string; // 前端松类型，后端可能新增 content.* 等 type

export interface UserMessage {
  id: number;
  type: UserMessageType;
  title: string;
  content: string;
  link_url?: string;
  /** 后端 json.RawMessage；前端当对象消费 */
  meta?: Record<string, unknown>;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface UserMessageListResult {
  list: UserMessage[];
  total: number;
  page: number;
  page_size: number;
  /** 全局未读数（不受 unread_only 过滤影响，顶栏 badge 用） */
  unread: number;
}

export interface UserMessageListParams {
  unread_only?: boolean;
  page?: number;
  page_size?: number;
}
