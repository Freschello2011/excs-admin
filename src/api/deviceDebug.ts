/**
 * device-mgmt-v2 P9-C.2 — 设备调试台 bootstrap bundle 客户端。
 *
 * 单端点 GET /api/v1/v2/devices/:id/debug-bundle 一次拉齐：
 *   - device 元数据 + channel_map / command_presets / connector_kind / connector_ref
 *   - 后端解算的 base_channel / cascade_units / max_channel（与 PATCH 写路径同口径）
 *   - effective_commands（preset 编辑器选 command_code 用）
 *
 * 该响应不进 OpenAPI 单源（admin 专用页 + 字段对单源化收益小，详见 server router 注释）。
 */
import request from './request';
import type { components } from '@/api/gen/schema.gen';
import type { ChannelMap } from './channelMap';
import type { CommandPreset } from './commandPreset';
import type { ConnectorKind, ConnectorRef } from '@/types/deviceConnector';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface DeviceDebugDeviceView {
  id: number;
  hall_id: number;
  exhibit_id?: number | null;
  name: string;
  connector_kind: ConnectorKind | '';
  connector_ref: ConnectorRef;
  connection_config: Record<string, unknown>;
  status: 'online' | 'offline' | 'unknown';
  last_heartbeat_at?: string | null;
  channel_map: ChannelMap;
  command_presets: CommandPreset[];
}

export interface DeviceDebugBundle {
  device: DeviceDebugDeviceView;
  base_channel: number;
  cascade_units: number;
  max_channel: number;
  effective_commands: components['schemas']['EffectiveCommandDTO'][];
}

export const deviceDebugApi = {
  bundle: (deviceId: number) =>
    request.get<ApiEnvelope<DeviceDebugBundle>>(
      `/api/v1/v2/devices/${deviceId}/debug-bundle`,
    ),
};
