/**
 * Phase 3-E：deviceBrandApi 重写为 AxiosResponse 兼容壳，代理到 deviceCatalogClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。
 */
import type { AxiosResponse } from 'axios';
import {
  deviceCatalogClient,
  type BrandListQuery,
  type CreateBrandBody,
  type DeviceBrandDTO,
  type UpdateBrandBody,
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

export const deviceBrandApi = {
  list(params?: BrandListQuery): Promise<AxiosResponse<ApiResponse<DeviceBrandDTO[]>>> {
    return deviceCatalogClient.listDeviceBrands(params).then((d) => ok(d));
  },

  create(data: CreateBrandBody): Promise<AxiosResponse<ApiResponse<DeviceBrandDTO>>> {
    return deviceCatalogClient.createDeviceBrand(data).then((d) => ok(d));
  },

  update(id: number, data: UpdateBrandBody): Promise<AxiosResponse<ApiResponse<DeviceBrandDTO>>> {
    return deviceCatalogClient.updateDeviceBrand(id, data).then((d) => ok(d));
  },

  delete(id: number): Promise<AxiosResponse<ApiResponse<null>>> {
    return deviceCatalogClient.deleteDeviceBrand(id).then(() => ok(null));
  },
};
