/** Notification event types */
export type NotificationEventType =
  | 'content_uploaded'
  | 'content_encrypted'
  | 'distribution_ready'
  | 'distribution_failed'
  | 'service_expiring'
  | 'service_expired'
  | 'app_offline'
  // NAS 归档模块（Phase 5 新增）
  | 'nas_archived'
  | 'nas_sync_failed'
  | 'nas_agent_offline'
  | 'nas_backlog_exceeded';

/** Notification config item for a hall */
export interface NotificationConfigItem {
  event_type: NotificationEventType;
  event_name: string;
  enabled: boolean;
  recipients: string[];
}

/** PUT body for updating notification config */
export interface NotificationConfigBody {
  enabled: boolean;
  recipients: string[];
}

/** Notification log list item */
export interface NotificationLogItem {
  id: number;
  event_type: string;
  recipient_phone: string;
  content: string;
  send_status: string;
  sent_at: string;
}

/** Query params for notification log list */
export interface NotificationLogParams {
  page: number;
  page_size: number;
  event_type?: string;
}
