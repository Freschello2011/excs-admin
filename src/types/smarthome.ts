/* ==================== 枚举值类型 ==================== */

export type GatewayStatus = 'online' | 'offline' | 'pairing';

export type SSEStatus = 'connected' | 'disconnected' | 'reconnecting';

export type ConditionType = 'time_range' | 'device_state' | 'scene_state';

export type ActionType = 'switch_scene' | 'device_cmd' | 'delay';

export type SmartHomeEventType =
  | 'motion_detected'
  | 'motion_cleared'
  | 'button_pressed'
  | 'switch_on'
  | 'switch_off'
  | 'temperature_alarm'
  | 'humidity_alarm'
  | 'device_online'
  | 'device_offline';

export type AlertLevel = 'p0_critical' | 'p1_important' | 'p2_info';

/* ==================== Hue Bridge ==================== */

export interface HueBridgeDTO {
  id: number;
  hall_id: number;
  bridge_id: string;
  name: string;
  ip: string;
  firmware_version: string;
  model_id: string;
  sse_status: SSEStatus;
  device_count: number;
  status: GatewayStatus;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateHueBridgeBody {
  hall_id: number;
  bridge_id: string;
  bridge_ip: string;
  name?: string;
  api_key?: string;
}

export interface UpdateHueBridgeBody {
  name?: string;
  ip?: string;
}

/* ==================== Xiaomi Gateway ==================== */

export interface XiaomiGatewayDTO {
  id: number;
  hall_id: number;
  gateway_did: string;
  name: string;
  ip: string;
  model: string;
  firmware_version: string;
  device_count: number;
  status: GatewayStatus;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateXiaomiGatewayBody {
  hall_id: number;
  gateway_did: string;
  gateway_ip: string;
  name?: string;
  token: string;
}

export interface UpdateXiaomiGatewayBody {
  name?: string;
  ip?: string;
}

/* ==================== EventRule ==================== */

export interface RuleTriggerDTO {
  id: string;
  device_id: number;
  event_type: string;
  event_filter: Record<string, unknown> | null;
}

export interface RuleConditionDTO {
  id: string;
  condition_type: ConditionType;
  params: Record<string, unknown>;
}

export interface RuleActionDTO {
  id: string;
  sort_order: number;
  action_type: ActionType;
  params: Record<string, unknown>;
}

export interface EventRuleDTO {
  id: string;
  hall_id: number;
  name: string;
  description: string;
  enabled: boolean;
  debug_mode: boolean;
  cooldown_sec: number;
  version: number;
  triggers: RuleTriggerDTO[];
  conditions: RuleConditionDTO[];
  actions: RuleActionDTO[];
  created_at: string;
  updated_at: string;
}

export interface CreateTriggerBody {
  device_id: number;
  event_type: string;
  event_filter?: Record<string, unknown>;
}

export interface CreateConditionBody {
  condition_type: ConditionType;
  params: Record<string, unknown>;
}

export interface CreateActionBody {
  sort_order: number;
  action_type: ActionType;
  params: Record<string, unknown>;
}

export interface CreateRuleBody {
  hall_id: number;
  name: string;
  description?: string;
  cooldown_sec?: number;
  triggers: CreateTriggerBody[];
  conditions?: CreateConditionBody[];
  actions?: CreateActionBody[];
}

export interface UpdateRuleBody {
  name?: string;
  description?: string;
  cooldown_sec?: number;
  triggers?: CreateTriggerBody[];
  conditions?: CreateConditionBody[];
  actions?: CreateActionBody[];
}

/* ==================== DryRun ==================== */

export interface ActionPreview {
  sort_order: number;
  action_type: ActionType;
  params: Record<string, unknown>;
}

export interface DryRunResultDTO {
  rule_id: string;
  rule_name: string;
  enabled: boolean;
  condition_check: boolean;
  cooldown_check: boolean;
  would_execute: boolean;
  actions: ActionPreview[];
  block_reason?: string;
}

/* ==================== DeviceHealth ==================== */

export interface DeviceHealthDTO {
  device_id: number;
  hall_id: number;
  online: boolean;
  battery_level?: number | null;
  signal_quality?: number | null;
  last_seen_at: string;
  last_event_at?: string | null;
  error_count_1h: number;
  firmware_version?: string;
  updated_at: string;
}

export interface GatewayHealthDTO {
  id: number;
  type: string;
  name: string;
  ip: string;
  status: GatewayStatus;
  device_count: number;
  firmware_version: string;
  last_seen_at: string | null;
}

/* ==================== TriggerLog ==================== */

export interface TriggerLogDTO {
  id: number;
  hall_id: number;
  rule_id: string | null;
  device_id: number;
  event_type: string;
  event_data: Record<string, unknown> | null;
  triggered: boolean;
  skip_reason: string;
  executed_actions: Record<string, unknown>[] | null;
  created_at: string;
}

export interface TriggerLogListParams {
  hall_id: number;
  rule_id?: string;
  device_id?: number;
  event_type?: string;
  triggered_only?: boolean;
  skip_only?: boolean;
  since?: string;
  until?: string;
  page: number;
  page_size: number;
}

/* ==================== Alert ==================== */

export interface AlertDTO {
  key: string;
  hall_id: number;
  event_type: string;
  device_id?: number;
  gateway_id?: number;
  rule_id?: string;
  level: AlertLevel;
  message: string;
  created_at: string;
}
