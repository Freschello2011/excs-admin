/**
 * device-mgmt-v2 P6 — preset / protocol-profile / plugin / v2 device API client
 *
 * 这些 endpoint P3/P4 直注 router.go，未走 OpenAPI codegen — 必须用 raw axios
 * 调用，配合 src/types/deviceConnector.ts 的手写类型保持类型安全。
 */
import request from './request';
import type {
  PresetCatalogDTO,
  PresetDetailDTO,
  ProtocolProfileListItem,
  ProtocolProfileDetail,
  UpdateProtocolProfileBody,
  CreateProtocolProfileBody,
  PluginDTO,
  PluginDeviceDTO,
  CreateDeviceV2Body,
  DeviceV2ListItem,
  EffectiveCommandsResponse,
} from '@/types/deviceConnector';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

/* ===== preset-catalog (read-only) ===== */

export const presetCatalogApi = {
  list: () =>
    request.get<ApiEnvelope<PresetCatalogDTO[]>>('/api/v1/preset-catalog'),
  get: (key: string) =>
    request.get<ApiEnvelope<PresetDetailDTO>>(`/api/v1/preset-catalog/${encodeURIComponent(key)}`),
};

/* ===== protocol-profiles ===== */

export const protocolProfileApi = {
  list: () =>
    request.get<ApiEnvelope<ProtocolProfileListItem[]>>('/api/v1/protocol-profiles'),
  get: (protocol: string) =>
    request.get<ApiEnvelope<ProtocolProfileDetail>>(`/api/v1/protocol-profiles/${encodeURIComponent(protocol)}`),
  create: (body: CreateProtocolProfileBody) =>
    request.post<ApiEnvelope<{ ok: boolean }>>('/api/v1/protocol-profiles', body),
  update: (protocol: string, body: UpdateProtocolProfileBody) =>
    request.put<ApiEnvelope<{ ok: boolean }>>(
      `/api/v1/protocol-profiles/${encodeURIComponent(protocol)}`,
      body,
    ),
};

/* ===== plugins ===== */

export const pluginApi = {
  list: () => request.get<ApiEnvelope<PluginDTO[]>>('/api/v1/plugins'),
  listDevices: (pluginId: string) =>
    request.get<ApiEnvelope<PluginDeviceDTO[]>>(
      `/api/v1/plugins/${encodeURIComponent(pluginId)}/devices`,
    ),
};

/* ===== Device v2 ===== */

export const deviceV2Api = {
  /** 创建 v2 device。注意路径是 /v2/devices 而非 /devices（v1 path 仍 alive） */
  create: (body: CreateDeviceV2Body) =>
    request.post<ApiEnvelope<DeviceV2ListItem>>('/api/v1/v2/devices', body),
  /** 更新 v2 device — 端点同 v1 (PUT /devices/:id)，按 connector_kind 分支处理 */
  update: (id: number, body: Partial<CreateDeviceV2Body>) =>
    request.put<ApiEnvelope<DeviceV2ListItem>>(`/api/v1/devices/${id}`, body),
  delete: (id: number) =>
    request.delete<ApiEnvelope<{ ok: boolean }>>(`/api/v1/devices/${id}`),
  clone: (id: number) =>
    request.post<ApiEnvelope<DeviceV2ListItem>>(`/api/v1/devices/${id}/clone`),
  /** 立即触发一次 query（P4 端点位于 v2 命名空间下） */
  query: (id: number) =>
    request.post<ApiEnvelope<{ ok: boolean }>>(`/api/v1/v2/devices/${id}/query`),
  /** 读最近一次 retained state 缓存 */
  state: (id: number) =>
    request.get<ApiEnvelope<Record<string, unknown>>>(`/api/v1/v2/devices/${id}/state`),
  /** effective-commands 路径不变；后端内部已切 v1/v2 分支 */
  effectiveCommands: (id: number) =>
    request.get<ApiEnvelope<EffectiveCommandsResponse>>(
      `/api/v1/devices/${id}/effective-commands`,
    ),
};
