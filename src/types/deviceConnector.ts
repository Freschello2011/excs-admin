/**
 * device-mgmt-v2 类型定义 — P8b 起从 OpenAPI codegen 派生。
 *
 * 旧 P3/P4 期间手写，因端点未走 OpenAPI codegen（见 router.go 直注）。P8b 把
 * 全部 device-connector / trigger / device-state / v2-device 端点回填进 yaml 单源
 * 后，本文件改为 re-export `components['schemas']`，以与 hall / panel 等 context 同模式。
 *
 * 仍保留为手写：
 *   - ListenerSource / TimerSchedule / ListenerPattern：trigger.source / .condition 因 kind
 *     而异（discriminator subtype）；yaml 用 type:object 透传，UI 端窄化为这些 view 类型。
 *   - DeviceV2ListItem / EffectiveCommandsResponse：admin UI 列表视图聚合，与 OpenAPI 单端 DTO
 *     无 1:1 对应。
 *   - DebugEvent / RecordingStatus / DiagEventsResponse：F12 调试 HUD 与 wildcard /diag/*
 *     subpath 透传出来的形态——尚未在 OpenAPI 中表达（subpath 与 oapi-codegen 不兼容）。
 */
import type { components } from '@/api/gen/schema.gen';

/* ===== Connector 共享 VO（schema 派生）===== */

export type ConnectorKind = components['schemas']['ConnectorKind'];
export type TransportKind = components['schemas']['TransportKind'];
export type CommandKind = components['schemas']['CommandKind'];
export type PatternKind = components['schemas']['PatternKind'];
export type FieldType = components['schemas']['FieldType'];
export type Endianness = components['schemas']['Endianness'];

export type DeviceCommand = components['schemas']['DeviceCommand'];
export type ResponseSchema = components['schemas']['ResponseSchema'];
export type ResponseField = components['schemas']['ResponseField'];
export type HeartbeatPattern = components['schemas']['HeartbeatPattern'];
export type DocumentedListenerPattern = components['schemas']['DocumentedListenerPattern'];

/* ===== ADR-0030 raw_transport 命令级响应判定 + 设备级连接生命周期 VO ===== */

export type ExpectResponse = components['schemas']['ExpectResponse'];
export type ExpectResponseMode = components['schemas']['ExpectResponseMode'];

/**
 * raw_transport TCP 连接生命周期模式（ADR-0030 §D1）。
 *   - short：每发一次新建 TcpClient + connect + write + close（ADR-0017 D5 行为）
 *   - persistent：常驻连接 + idle 计时器；写命令前发现流不健康则懒重连一次（D7）
 *
 * server 把 connection_config 当 opaque jsonb（schema.gen.ts 透传 [key:string]: unknown），
 * connection_mode / heartbeat 是 raw_transport 的 well-known 子键 —— admin 在 connection_config
 * 里读写这俩字段属约定级 contract，不依赖 server typed schema。
 */
export type ConnectionMode = 'short' | 'persistent';

/** raw_transport 设备 connection_config.heartbeat 子对象（ADR-0030 §D2，仅 persistent 启用） */
export interface HeartbeatConfig {
  enabled?: boolean;
  interval_ms?: number;
  command_code?: string;
  miss_threshold?: number;
}

/* ===== Preset / Protocol / Plugin DTOs ===== */

export type PresetCatalogDTO = components['schemas']['PresetCatalogDTO'];
export type PresetDetailDTO = components['schemas']['PresetDetailDTO'];

/**
 * ProtocolProfileListItem / Detail — yaml 把 transport_kind 声明为 string（DB 端
 * 兼容旧值），admin 表单层窄化为 TransportKind union 以触发类型检查。
 */
export type ProtocolProfileListItem = Omit<
  components['schemas']['ProtocolProfileListItem'],
  'transport_kind'
> & {
  transport_kind?: TransportKind;
};
export type ProtocolProfileDetail = Omit<
  components['schemas']['ProtocolProfileDetail'],
  'transport_kind'
> & {
  transport_kind?: TransportKind;
};

/** 历史命名兼容 — 老调用方使用 ...Body 后缀 */
export type CreateProtocolProfileBody = components['schemas']['CreateProtocolProfileRequest'];
export type UpdateProtocolProfileBody = components['schemas']['UpdateProtocolProfileRequest'];

export type PluginDTO = components['schemas']['PluginDTO'];
export type PluginDeviceDTO = components['schemas']['PluginDeviceDTO'];

/* ===== Device v2 ===== */

export type ConnectorRef = components['schemas']['ConnectorRef'];

/** 历史命名兼容 — 老调用方使用 ...Body 后缀 */
export type CreateDeviceV2Body = components['schemas']['CreateDeviceV2Request'];

/**
 * Admin UI 列表视图（聚合 v2 device + 状态 + display_info）。OpenAPI 端无 1:1
 * 对应 schema —— 后端以 hall.DeviceDTO + connector_spec 拼装下发。保持手写。
 */
export interface DeviceV2ListItem {
  id: number;
  hall_id: number;
  exhibit_id?: number | null;
  exhibit_name?: string | null;
  name: string;
  connector_kind: ConnectorKind;
  connector_ref: ConnectorRef;
  connection_config: Record<string, unknown>;
  inline_commands?: DeviceCommand[];
  inline_heartbeat_command_code?: string;
  poll_interval_seconds: number;
  status: 'online' | 'offline' | 'unknown';
  last_heartbeat_at?: string | null;
  notes?: string;
  serial_no?: string;
  display_info?: {
    name: string;
    manufacturer?: string;
    model_name?: string;
  };
  created_at: string;
  updated_at: string;
}

/** /devices/:id/effective-commands 返回（admin 详情页用，非单源契约范畴）。 */
export interface EffectiveCommandsResponse {
  commands: DeviceCommand[];
  heartbeat_command_code?: string;
  heartbeat_patterns?: HeartbeatPattern[];
  heartbeat_period_seconds_max?: number;
  default_listener_patterns?: DocumentedListenerPattern[];
  display_info?: {
    name: string;
    manufacturer?: string;
    model_name?: string;
  };
}

/* ===== Trigger（schema 派生 + UI 端 discriminator subtype）===== */

export type TriggerKind = components['schemas']['TriggerKind'];
export type TriggerActionKind = components['schemas']['TriggerActionKind'];
/** 历史命名兼容 */
export type ActionKind = TriggerActionKind;

export type TriggerAction = components['schemas']['TriggerAction'];
export type TriggerDTO = components['schemas']['TriggerDTO'];

/**
 * 历史命名兼容（旧 trigger 列表 / 详情都 import 'Trigger'）+ 端 UI 视图：
 * gen.TriggerDTO.source / .condition 是 opaque map（kind 多态透传），admin 表单 /
 * 列表渲染层把它们窄化到 ListenerSource / TimerSchedule / ListenerPattern。
 *
 * 兼容字段 schedule（旧后端有过单独 schedule 字段；当前等价于 timer kind 时 source
 * 即 schedule，但部分 UI 还在读 .schedule）。
 */
export type Trigger = Omit<TriggerDTO, 'source' | 'condition'> & {
  source: ListenerSource | TimerSchedule | Record<string, unknown>;
  condition?: ListenerPattern | null;
  schedule?: TimerSchedule | null;
};

/**
 * CreateTriggerBody — gen.CreateTriggerRequest 把 source / condition 收口为 opaque map；
 * admin 表单层用 typed 视图（ListenerSource / TimerSchedule / ListenerPattern）构造，
 * 这里把 source / condition 拉宽以兼容。
 */
export type CreateTriggerBody = Omit<
  components['schemas']['CreateTriggerRequest'],
  'source' | 'condition'
> & {
  source: ListenerSource | TimerSchedule | Record<string, unknown>;
  condition?: ListenerPattern | null;
};

/**
 * UI 端 discriminator 视图：trigger.source / .condition 因 kind 而异。yaml 用
 * type:object 透传，前端在表单层用这些子类型窄化。orphan schema 在 redocly bundle 阶段
 * 会被 prune（未被任何 $ref 引用），所以保持手写。
 */
export type ScheduleKind = 'cron' | 'once_at' | 'interval';

export interface ListenerSource {
  transport: TransportKind;
  bind: Record<string, unknown>;
}

export interface TimerSchedule {
  schedule_kind: ScheduleKind;
  cron?: string;
  once_at?: string;
  interval_seconds?: number;
  scope?: 'hall' | 'device';
}

export interface ListenerPattern {
  pattern_kind: PatternKind;
  pattern: string;
}

/* ===== Conflict ===== */

export type ResourceKind = components['schemas']['ResourceKind'];

/**
 * Conflict 系列：admin UI 在调 _check_conflict 后，把入参 resource 也回填到
 * report.resource，并对 internal_owner 暴露 trigger_id / trigger_name 别名。
 * 这两块都是 UI 层增量，OpenAPI 后端响应不带 resource / 用 id+name（domain 不区分）。
 */
export type InternalConflictRef = components['schemas']['InternalConflictRef'] & {
  trigger_id?: number;
  trigger_name?: string;
};
export type ExternalProc = components['schemas']['ExternalProc'];
export type ConflictReport = Omit<
  components['schemas']['ConflictReport'],
  'internal_owner'
> & {
  internal_owner?: InternalConflictRef;
  resource?: { kind: ResourceKind; identifier: string };
};

/* ===== Diag events / Recording（仍手写 — wildcard subpath 透传出来的形态）===== */

export type EventKind =
  | 'outbound'
  | 'inbound'
  | 'listener_hit'
  | 'listener_miss'
  | 'trigger_fire'
  | 'poll_cycle'
  | 'error';

export type EventLevel = 'Info' | 'Warn' | 'Error';

export type SourceKind = 'Panel' | 'Scene' | 'Show' | 'Trigger' | 'Poll' | 'Manual';

export interface EventSourceRef {
  kind: SourceKind;
  ref?: Record<string, unknown>;
}

export interface DebugEvent {
  seq: number;
  timestamp: string;
  level: EventLevel;
  kind: EventKind;
  device_id?: number | null;
  trigger_id?: number | null;
  source: EventSourceRef;
  payload: Record<string, unknown>;
  latency_ms?: number;
  error?: { type?: string; message?: string; stack?: string };
}

export interface DiagEventsResponse {
  events: DebugEvent[];
  dropped: number;
  ring_capacity: number;
  next_since?: number;
}

export interface RecordingStatus {
  id?: string;
  started_at?: string;
  planned_duration_min?: number;
  note?: string;
  slices_count?: number;
  slice_urls?: string[];
  is_recording?: boolean;
}
