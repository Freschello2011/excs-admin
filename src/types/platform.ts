/**
 * 平台监控 / 业务看板 / 操作审计 三 Tab 的前端 DTO 类型。
 *
 * 后端契约参考：02-server/internal/interfaces/api/platform_handler.go
 * 领域 DDD：01-docs/01-contexts/platform-monitor/DDD.md §5
 *
 * 命名约定注记：
 * - 带 JSON tag 的 DTO（顶层响应 / Result 包装 / 业务 DTO）都是 snake_case
 * - 无 JSON tag 的 domain VO（ResourceMetric / ECSHostInfo / DependencyHealth /
 *   BackupJobStatus / TrendSeries / TodoItem）由 encoding/json 直接导出为 PascalCase
 *   字段名 —— 下方对应类型保持 PascalCase，别改
 */

// ============================================================================
// Tab A · 平台监控
// ============================================================================

export type ResourceLevel = 'ok' | 'warn' | 'danger';

/** domain: ResourceMetric（无 JSON tag → PascalCase） */
export interface ResourceMetric {
  Kind: 'cpu' | 'mem' | 'disk';
  Current: number;
  Series24h: number[];
  PeakValue: number;
  PeakAt: string;
  Level: ResourceLevel;
}

/** app: ResourceMetricResult */
export interface ResourceMetricResult {
  metric?: ResourceMetric | null;
  degraded: boolean;
  reason?: string;
}

/** domain: ECSHostInfo（PascalCase） */
export interface ECSHostInfo {
  PublicIP: string;
  Region: string;
  Spec: string;
  Status: string;
  UptimeSec: number;
}

/** app: HostInfoResult */
export interface HostInfoResult {
  host?: ECSHostInfo | null;
  degraded: boolean;
  reason?: string;
}

/** domain: DependencyHealth（PascalCase） */
export interface DependencyHealth {
  Kind: 'mysql' | 'redis' | 'emqx' | 'oss';
  Available: boolean;
  LatencyMs: number;
  ExtraMetrics: Record<string, string> | null;
  FailStreak: number;
  LastCheckAt: string;
}

export type BackupKind = 'snapshot' | 'file';
export type BackupJobState =
  | 'done'
  | 'running'
  | 'failed'
  | 'delayed'
  | 'not_configured'
  | 'not_enabled';

/** domain: BackupJobStatus（PascalCase） */
export interface BackupJobStatus {
  Kind: BackupKind;
  LastSuccessAt: string;
  NextScheduledAt: string;
  RetentionPolicy: string;
  LatestSize: number;
  HistoryCount: number;
  State: BackupJobState;
  LastError: string;
}

/** app: BackupStatusResult */
export interface BackupStatusResult {
  status?: BackupJobStatus | null;
  degraded: boolean;
  reason?: string;
}

/** api: CertInfoDTO（snake_case） */
export interface CertInfoDTO {
  subject: string;
  issuer: string;
  issuer_org: string;
  not_before: string;
  not_after: string;
  days_remaining: number;
  level: ResourceLevel;
}

/** api: PlatformDashboardResp —— /api/v1/platform/dashboard */
export interface PlatformDashboardResp {
  generated_at: string;
  cpu: ResourceMetricResult;
  mem: ResourceMetricResult;
  disk: ResourceMetricResult;
  host: HostInfoResult;
  deps: DependencyHealth[];
  backups: BackupStatusResult[];
  certs: CertInfoDTO[];
}

// ============================================================================
// Tab B · 业务看板
// ============================================================================

export type BusinessPeriod = 'day' | 'week' | 'month' | 'year';

/** domain: TrendSeries（PascalCase） */
export interface TrendSeries {
  Series: number[];
  FirstVal: number;
  LastVal: number;
  Delta: string;
  Direction: 'up' | 'down' | 'flat';
  Period: BusinessPeriod;
}

/** domain: TodoItem（PascalCase） */
export type TodoSeverity = 'urgent' | 'warn' | 'info' | 'ok';

export interface TodoItem {
  Code: string;
  Count: string;
  Label: string;
  Severity: TodoSeverity;
  LinkPath: string;
}

/** app: RunningCardDTO */
export interface RunningCardDTO {
  title: string;
  value: number;
  unit: string;
  sub: string;
  trend: TrendSeries;
}

export interface RunningStatsDTO {
  hall_count: RunningCardDTO;
  online_devices: RunningCardDTO;
  content_count: RunningCardDTO;
  today_ops: RunningCardDTO;
}

/** app: StorageBucketDTO */
export interface StorageBucketDTO {
  name: string;
  bucket: string;
  total_bytes: number;
  object_count: number;
  capacity_bytes: number;
  percent: number;
}

export interface StorageCapacityDTO {
  nas: StorageBucketDTO;
  raw: StorageBucketDTO;
  encrypted: StorageBucketDTO;
  thumbnail: StorageBucketDTO;
}

/** app: CostCardDTO */
export interface CostCardDTO {
  title: string;
  month_cny: number;
  sub: string;
  pct_trend: TrendSeries;
}

export interface CostTrendDTO {
  ai: CostCardDTO;
  oss: CostCardDTO;
  total: CostCardDTO;
}

/** app: AiInteractionDTO */
export interface AiInteractionDTO {
  session_count: RunningCardDTO;
  total_rounds: RunningCardDTO;
  avg_rounds_session: RunningCardDTO;
  avg_duration_sec: RunningCardDTO;
}

/** /platform/business/todos 响应包装 */
export interface BusinessTodosResp {
  items: TodoItem[];
}

// ============================================================================
// Tab C · 操作审计
// ============================================================================

/** app: AuditSummaryDTO */
export interface AuditSummaryDTO {
  total_ops: number;
  content_ops: number;
  authz_changes: number;
  device_hall_ops: number;
  failed_ops: number;
}

/** app: AuthzAuditItemDTO */
export interface AuthzAuditItemDTO {
  id: number;
  occurred_at: string;
  actor_user_id: number;
  actor_name: string;
  action_code: string;
  resource_type: string;
  resource_id: string;
  reason: string;
  status: 'success' | 'failure' | string;
  is_revoke: boolean;
}

/** app: AppOpItemDTO */
export interface AppOpItemDTO {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  detail: string;
  created_at: string;
}

export interface AuditAuthzResp {
  items: AuthzAuditItemDTO[];
}

export interface AuditAppOpsResp {
  items: AppOpItemDTO[];
}
