import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type { DeviceCategoryDTO, DeviceSubcategoryDTO } from '@/types/deviceCategory';

export const deviceCategoryApi = {
  /** 列出设备大类 */
  list(): Promise<AxiosResponse<ApiResponse<DeviceCategoryDTO[]>>> {
    return request.get('/api/v1/device-categories');
  },

  /** 列出设备小类（可按 category_id 筛） */
  listSubcategories(
    categoryId?: number,
  ): Promise<AxiosResponse<ApiResponse<DeviceSubcategoryDTO[]>>> {
    return request.get('/api/v1/device-subcategories', {
      params: categoryId !== undefined ? { category_id: categoryId } : undefined,
    });
  },
};
