/**
 * device-mgmt-v2 P9-C — channel_map API client（field-deployment §8）
 *
 * 全量替换 device.channel_map（jsonb 列）。后端不变量见
 * 02-server/internal/domain/hall/device_field_deployment.go：
 *   - index ∈ [1, max_channel]
 *   - index 同 device 内唯一
 *   - label trim 后非空
 *
 * 路径 /api/v1/v2/devices/:id/channel-map（带 v2 前缀；老 v1 不存在此端点）。
 */
import request from './request';
import type { components } from '@/api/gen/schema.gen';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export type ChannelEntry = components['schemas']['ChannelEntry'];
export type ChannelMap = components['schemas']['ChannelMap'];
export type UpdateChannelMapRequest = components['schemas']['UpdateChannelMapRequest'];
export type UpdateChannelMapResponse = components['schemas']['UpdateChannelMapResponse'];

export const channelMapApi = {
  update: (deviceId: number, body: UpdateChannelMapRequest) =>
    request.patch<ApiEnvelope<UpdateChannelMapResponse>>(
      `/api/v1/v2/devices/${deviceId}/channel-map`,
      body,
    ),
};
