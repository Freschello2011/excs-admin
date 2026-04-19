import request from './request';
import type { AxiosResponse } from 'axios';
import type { ApiResponse } from '@/types/api';
import type { ConfigGroupData, GroupInfo } from '@/types/sysConfig';

export const sysConfigApi = {
  /** 获取所有配置分组 */
  getGroups(): Promise<AxiosResponse<ApiResponse<GroupInfo[]>>> {
    return request.get('/api/v1/sys-configs/groups');
  },

  /** 获取指定分组的配置 */
  getGroupConfigs(group: string): Promise<AxiosResponse<ApiResponse<ConfigGroupData>>> {
    return request.get(`/api/v1/sys-configs/${group}`);
  },

  /** 更新指定分组的配置 */
  updateGroupConfigs(
    group: string,
    items: { key: string; value: string }[],
  ): Promise<AxiosResponse<ApiResponse<null>>> {
    return request.put(`/api/v1/sys-configs/${group}`, { items });
  },

  /** 上传 Logo */
  uploadLogo(file: File): Promise<AxiosResponse<ApiResponse<{ logo_url: string }>>> {
    const formData = new FormData();
    formData.append('file', file);
    return request.post('/api/v1/branding/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
