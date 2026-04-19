import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type {
  CreateModelBody,
  DeviceModelDetail,
  DeviceModelListItem,
  ModelListQuery,
  UpdateModelBody,
} from '@/types/deviceModel';

export const deviceModelApi = {
  list(params?: ModelListQuery): Promise<AxiosResponse<ApiResponse<PaginatedData<DeviceModelListItem>>>> {
    return request.get('/api/v1/device-models', { params });
  },

  get(id: number): Promise<AxiosResponse<ApiResponse<DeviceModelDetail>>> {
    return request.get(`/api/v1/device-models/${id}`);
  },

  create(data: CreateModelBody): Promise<AxiosResponse<ApiResponse<DeviceModelDetail>>> {
    return request.post('/api/v1/device-models', data);
  },

  update(id: number, data: UpdateModelBody): Promise<AxiosResponse<ApiResponse<DeviceModelDetail>>> {
    return request.put(`/api/v1/device-models/${id}`, data);
  },

  delete(id: number): Promise<AxiosResponse<ApiResponse<null>>> {
    return request.delete(`/api/v1/device-models/${id}`);
  },

  /** 克隆型号 — 返回预填的 detail（id/model_code/name 留空） */
  clone(id: number): Promise<AxiosResponse<ApiResponse<DeviceModelDetail>>> {
    return request.post(`/api/v1/device-models/${id}/clone`);
  },

  /** 弃用 / 启用切换 — 后端仅提供 deprecate；启用通过 update 设 status=active（服务端自动）或复用 deprecate 端点语义 */
  deprecate(id: number): Promise<AxiosResponse<ApiResponse<{ device_count: number }>>> {
    return request.post(`/api/v1/device-models/${id}/deprecate`);
  },
};
