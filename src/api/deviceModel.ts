/**
 * Phase 3-E：deviceModelApi 重写为 AxiosResponse 兼容壳，代理到 deviceCatalogClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。
 */
import type { AxiosResponse } from 'axios';
import {
  deviceCatalogClient,
  type CreateModelBody,
  type DeprecateDeviceModelResponse,
  type DeviceModelDetail,
  type DeviceModelListPage,
  type ModelListQuery,
  type UpdateModelBody,
} from './gen/client';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

function ok<T>(data: T): AxiosResponse<ApiResponse<T>> {
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
  };
}

export const deviceModelApi = {
  list(params?: ModelListQuery): Promise<AxiosResponse<ApiResponse<DeviceModelListPage>>> {
    return deviceCatalogClient.listDeviceModels(params).then((d) => ok(d));
  },

  get(id: number): Promise<AxiosResponse<ApiResponse<DeviceModelDetail>>> {
    return deviceCatalogClient.getDeviceModel(id).then((d) => ok(d));
  },

  create(data: CreateModelBody): Promise<AxiosResponse<ApiResponse<DeviceModelDetail>>> {
    return deviceCatalogClient.createDeviceModel(data).then((d) => ok(d));
  },

  update(id: number, data: UpdateModelBody): Promise<AxiosResponse<ApiResponse<DeviceModelDetail>>> {
    return deviceCatalogClient.updateDeviceModel(id, data).then((d) => ok(d));
  },

  delete(id: number): Promise<AxiosResponse<ApiResponse<null>>> {
    return deviceCatalogClient.deleteDeviceModel(id).then(() => ok(null));
  },

  /** 克隆型号 — 返回预填的 detail（id/model_code/name 留空） */
  clone(id: number): Promise<AxiosResponse<ApiResponse<DeviceModelDetail>>> {
    return deviceCatalogClient.cloneDeviceModel(id).then((d) => ok(d));
  },

  /** 弃用 / 启用切换 — 后端仅提供 deprecate；启用通过 update 设 status=active（服务端自动）或复用 deprecate 端点语义 */
  deprecate(id: number): Promise<AxiosResponse<ApiResponse<DeprecateDeviceModelResponse>>> {
    return deviceCatalogClient.deprecateDeviceModel(id).then((d) => ok(d));
  },
};
