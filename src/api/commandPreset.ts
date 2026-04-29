/**
 * device-mgmt-v2 P9-C — command_preset API client（field-deployment §8）
 *
 * 设备实例级"命令书签"：admin 在调试台拖选通道生成。
 *
 * 路径 /api/v1/v2/devices/:id/command-presets/:name
 *   - PATCH 新增 / 替换（按 name 唯一）
 *   - DELETE 按 name 删除
 *
 * name URL-encode 必须；后端拒 / 与换行（path 参数注入防御）。中文 / emoji 可。
 */
import request from './request';
import type { components } from '@/api/gen/schema.gen';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export type CommandPreset = components['schemas']['CommandPreset'];
export type UpsertCommandPresetRequest = components['schemas']['UpsertCommandPresetRequest'];

export const commandPresetApi = {
  upsert: (deviceId: number, name: string, body: UpsertCommandPresetRequest) =>
    request.patch<ApiEnvelope<CommandPreset>>(
      `/api/v1/v2/devices/${deviceId}/command-presets/${encodeURIComponent(name)}`,
      body,
    ),
  delete: (deviceId: number, name: string) =>
    request.delete<ApiEnvelope<{ ok: boolean }>>(
      `/api/v1/v2/devices/${deviceId}/command-presets/${encodeURIComponent(name)}`,
    ),
};
