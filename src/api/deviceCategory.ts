/**
 * Phase 3-E：deviceCategoryApi 重写为 AxiosResponse 兼容壳，代理到 deviceCatalogClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。
 */
import type { AxiosResponse } from 'axios';
import {
  deviceCatalogClient,
  type DeviceCategoryDTO,
  type DeviceSubcategoryDTO,
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

export const deviceCategoryApi = {
  /** 列出设备大类 */
  list(): Promise<AxiosResponse<ApiResponse<DeviceCategoryDTO[]>>> {
    return deviceCatalogClient.listDeviceCategories().then((d) => ok(d));
  },

  /** 列出设备小类（可按 category_id 筛） */
  listSubcategories(
    categoryId?: number,
  ): Promise<AxiosResponse<ApiResponse<DeviceSubcategoryDTO[]>>> {
    return deviceCatalogClient.listDeviceSubcategories(categoryId).then((d) => ok(d));
  },
};
