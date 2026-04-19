/* ==================== Enums ==================== */

export type HallStatus = 'active' | 'grace' | 'expired';
export type DisplayMode = 'normal' | 'simple_fusion' | 'touch_interactive';
export type DeviceType = 'projector' | 'player' | 'lighting' | 'audio' | 'sensor' | 'relay' | 'screen' | 'camera' | 'custom';
export type DeviceProtocol = 'pjlink' | 'tcp' | 'rs232' | 'rs485' | 'artnet' | 'modbus' | 'osc' | 'wol' | 'plugin';
export type DeviceStatus = 'online' | 'offline';
export type AppInstanceStatus = 'paired' | 'offline';
export type PairingTargetType = 'exhibit' | 'exhibit_debug' | 'hall';
export type PairingCodeStatus = 'active' | 'used' | 'expired' | 'locked';
export type ControlAppSessionStatus = 'online' | 'offline';

/* ==================== Nested Value Objects ==================== */

export interface MqttConfig {
  broker_url: string;
  topic_prefix: string;
}

export interface ServicePeriod {
  service_start: string;
  service_end: string;
  grace_days: number;
  status: HallStatus;
}

export interface SimpleFusionConfig {
  projector_count: number;
  overlap_pixels: number;
}

export interface ConnectionConfig {
  ip?: string;
  port?: number;
  password?: string;
  [key: string]: unknown;
}

export interface CommandTemplate {
  open?: string;
  close?: string;
  get_status?: string;
  [key: string]: string | undefined;
}

export interface DeviceInfo {
  os?: string;
  hostname?: string;
  cpu?: string;
  gpu?: string;
  ram_gb?: number;
  local_ip?: string;
  mac_address?: string;
}

export interface ExhibitScript {
  content: string;
  sort_order: number;
}

/* ==================== Hall ==================== */

/** Hall list item (GET /api/v1/halls) */
export interface HallListItem {
  id: number;
  mdm_showroom_id: number;
  name: string;
  status: HallStatus;
  service_start: string;
  service_end: string;
  exhibit_count: number;
  device_count: number;
  app_instance_count: number;
  online_instance_count: number;
}

/** Hall detail (GET /api/v1/halls/:hallId) */
export interface HallDetail {
  id: number;
  mdm_showroom_id: number;
  name: string;
  description: string;
  mqtt_config: MqttConfig;
  service_period: ServicePeriod;
  hall_master_exhibit_id: number | null;
  hall_master_fallback_id: number | null;
  ai_knowledge_text: string;
  status: HallStatus;
  exhibit_count: number;
  device_count: number;
  created_at: string;
  updated_at: string;
}

/* ==================== Hall Runtime Status ==================== */

export interface RuntimeSceneInfo {
  id: number;
  name: string;
}

export interface RuntimeAppInstance {
  id: number;
  exhibit_id: number;
  exhibit_name: string;
  is_hall_master: boolean;
  status: AppInstanceStatus;
  last_heartbeat_at: string;
}

export interface HallRuntimeStatus {
  hall_id: number;
  service_status: HallStatus;
  current_scene: RuntimeSceneInfo | null;
  running_show: { id: number; name: string } | null;
  app_instances: RuntimeAppInstance[];
  online_device_count: number;
  offline_device_count: number;
}

/* ==================== Exhibit ==================== */

/** Exhibit list item (GET /api/v1/halls/:hallId/exhibits) */
export interface ExhibitListItem {
  id: number;
  name: string;
  description: string;
  sort_order: number;
  display_mode: DisplayMode;
  enable_ai_tag: boolean;
  device_count: number;
  content_count: number;
  has_ai_avatar: boolean;
  script_count: number;
}

/** Create/update exhibit body */
export interface ExhibitBody {
  name: string;
  description?: string;
  sort_order: number;
  display_mode: DisplayMode;
  enable_ai_tag?: boolean;
  simple_fusion_config?: SimpleFusionConfig;
}

/* ==================== Device ==================== */

/** Device list item (GET /api/v1/devices) — model-derived 字段由后端 join 返回 */
export interface DeviceListItem {
  id: number;
  hall_id: number;
  hall_name?: string;
  exhibit_id: number | null;
  exhibit_name: string | null;
  model_id: number;
  model_code: string;
  model_name: string;
  brand_name: string;
  brand_logo_url?: string;
  subcategory_code: string;
  subcategory_name: string;
  category_name?: string;
  /** 协议（model 派生，DTO 仍返回方便前端展示） */
  protocol: string;
  name: string;
  connection_config: ConnectionConfig;
  notes?: string;
  serial_no?: string;
  status: DeviceStatus;
  last_heartbeat_at?: string | null;
  last_status_at?: string | null;
}

/** Create / Update device body */
export interface DeviceBody {
  hall_id: number;
  exhibit_id?: number | null;
  model_id: number;
  name: string;
  connection_config: ConnectionConfig;
  notes?: string;
  serial_no?: string;
}

/* ==================== App Instance ==================== */

/** App instance list item (GET /api/v1/halls/:hallId/app-instances) */
export interface AppInstanceListItem {
  id: number;
  machine_code: string;
  exhibit_id: number;
  exhibit_name: string;
  is_hall_master: boolean;
  role: 'primary' | 'debug';
  parent_id?: number;
  debug_expires_at?: string;
  status: AppInstanceStatus;
  device_info: DeviceInfo;
  paired_at: string;
  last_heartbeat_at: string | null;
}

/** Pairing code list item */
export interface AnnouncedDevice {
  code: string;
  machine_code: string;
  device_info: DeviceInfo;
  created_at: string;
  expires_at: string;
}

export interface PairingCodeListItem {
  id: number;
  code: string;
  target_type: PairingTargetType;
  target_id: number;
  target_name: string;
  status: PairingCodeStatus;
  failed_attempts: number;
  used_by_instance_id: number | null;
  expires_at: string;
  locked_until: string | null;
  created_at: string;
}

/** Batch generate result */
export interface BatchGenerateResult {
  generated: PairingCodeListItem[];
  skipped: { target_id: number; target_name: string; reason: string }[];
}

/** Export pairing code item */
export interface ExportPairingCodeItem {
  exhibit_name: string;
  code: string;
  expires_at: string;
}

/** Control app session list item */
export interface ControlAppSessionItem {
  id: number;
  user_id: number;
  user_name: string;
  hall_id: number;
  current_hall_id: number;
  original_hall_id: number;
  allow_hall_switch: boolean;
  device_uuid: string;
  status: ControlAppSessionStatus;
  connected_at: string;
  last_active_at: string;
}

/** Generate pairing code body */
export interface GeneratePairingCodeBody {
  target_type: PairingTargetType;
  target_id: number;
}

/** Switch control hall body */
export interface SwitchControlHallBody {
  new_hall_id: number;
}

/* ==================== API Request Params ==================== */

export interface HallListParams {
  page?: number;
  page_size?: number;
  keyword?: string;
  status?: HallStatus | 'all';
}

export interface HallConfigBody {
  ai_knowledge_text?: string;
  hall_master_exhibit_id?: number | null;
  hall_master_fallback_id?: number | null;
}

export interface ServicePeriodBody {
  service_start: string;
  service_end: string;
  grace_days: number;
}

export interface SyncMdmBody {
  mdm_showroom_ids?: number[];
}

export interface SyncMdmResult {
  synced: number;
  created: number;
  updated: number;
  failed: string[];
}

export interface DeviceListParams {
  hall_id: number;
  exhibit_id?: number;
  subcategory_id?: number;
  brand_id?: number;
  model_id?: number;
}

/** Effective command (GET /api/v1/devices/:deviceId/effective-commands) — 三层合并结果 */
export interface EffectiveCommand {
  name: string;
  code: string;
  params_schema?: Record<string, unknown> | null;
  icon?: string;
  category?: string;
  description?: string;
  source: 'baseline' | 'model' | 'override';
}

export interface SwitchMasterBody {
  new_master_exhibit_id: number;
}
