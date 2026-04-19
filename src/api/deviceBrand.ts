import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  BrandListQuery,
  CreateBrandBody,
  DeviceBrandDTO,
  UpdateBrandBody,
} from '@/types/deviceBrand';

export const deviceBrandApi = {
  list(params?: BrandListQuery): Promise<AxiosResponse<ApiResponse<DeviceBrandDTO[]>>> {
    return request.get('/api/v1/device-brands', { params });
  },

  create(data: CreateBrandBody): Promise<AxiosResponse<ApiResponse<DeviceBrandDTO>>> {
    return request.post('/api/v1/device-brands', data);
  },

  update(id: number, data: UpdateBrandBody): Promise<AxiosResponse<ApiResponse<DeviceBrandDTO>>> {
    return request.put(`/api/v1/device-brands/${id}`, data);
  },

  delete(id: number): Promise<AxiosResponse<ApiResponse<null>>> {
    return request.delete(`/api/v1/device-brands/${id}`);
  },
};
