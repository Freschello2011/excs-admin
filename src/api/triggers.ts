/**
 * device-mgmt-v2 P6 — Trigger CRUD + _check_conflict + test
 *
 * 路径用 /api/v1/v2/triggers (P4 直注 router 的 v2 路径)。
 */
import request from './request';
import type {
  Trigger,
  CreateTriggerBody,
  ConflictReport,
  ResourceKind,
} from '@/types/deviceConnector';
import type { components } from '@/api/gen/schema.gen';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

interface ListParams {
  hall_id?: number;
  exhibit_id?: number;
  enabled?: boolean;
  device_id?: number;
  kind?: 'listener' | 'timer';
}

export type DeviceEventBindingDTO = components['schemas']['DeviceEventBindingDTO'];
export type DeviceEventBindingInput = components['schemas']['DeviceEventBindingInput'];

export const triggerApi = {
  /** 注意：后端返 `{list, total}` 对象，不是裸数组 */
  list: (params: ListParams) =>
    request.get<ApiEnvelope<{ list: Trigger[]; total: number }>>('/api/v1/v2/triggers', {
      params: { ...params, include_bindings_raw: true },
    }),
  get: (id: number) =>
    request.get<ApiEnvelope<Trigger>>(`/api/v1/v2/triggers/${id}`),
  create: (body: CreateTriggerBody) =>
    request.post<ApiEnvelope<Trigger>>('/api/v1/v2/triggers', body),
  update: (id: number, body: Partial<CreateTriggerBody>) =>
    request.put<ApiEnvelope<Trigger>>(`/api/v1/v2/triggers/${id}`, body),
  delete: (id: number) =>
    request.delete<ApiEnvelope<{ ok: boolean }>>(`/api/v1/v2/triggers/${id}`),
  /** 端口/串口冲突预检（admin 调云端，云端再透传到展厅 App） */
  checkConflict: (body: {
    hall_id: number;
    exhibit_id: number;
    resource_kind: ResourceKind;
    identifier: string;
    /** 编辑时排除当前 trigger 自身（避免自冲突） */
    ignore_trigger_id?: number;
  }) =>
    request.post<ApiEnvelope<ConflictReport>>(
      '/api/v1/v2/triggers/_check_conflict',
      body,
      { skipErrorMessage: true },
    ),
  /** 手动触发一次（"模拟收"测试） */
  test: (id: number) =>
    request.post<ApiEnvelope<{ ok: boolean }>>(`/api/v1/v2/triggers/${id}/test`),
  listDeviceEventBindings: (deviceId: number) =>
    request.get<ApiEnvelope<{ list: DeviceEventBindingDTO[]; total: number }>>(
      `/api/v1/v2/devices/${deviceId}/event-bindings`,
    ),
  replaceDeviceEventBindings: (deviceId: number, bindings: DeviceEventBindingInput[]) =>
    request.put<ApiEnvelope<{ list: DeviceEventBindingDTO[]; total: number }>>(
      `/api/v1/v2/devices/${deviceId}/event-bindings`,
      { bindings },
    ),
};
