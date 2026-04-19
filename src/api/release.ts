import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type {
  AppRelease,
  HallAppVersion,
  CreateReleaseBody,
  SetHallVersionBody,
  ReleaseListParams,
} from '@/types/release';

export interface RequestUploadBody {
  platform: string;
  arch: string;
  version: string;
  filename: string;
  content_type?: string;
}

export interface RequestUploadResult {
  presigned_url: string;
  oss_key: string;
}

export const releaseApi = {
  /** 获取上传凭证 */
  requestUpload(body: RequestUploadBody): Promise<AxiosResponse<ApiResponse<RequestUploadResult>>> {
    return request.post('/api/v1/releases/request-upload', body);
  },

  /** 列出版本（按平台筛选） */
  listReleases(params: ReleaseListParams): Promise<AxiosResponse<ApiResponse<PaginatedData<AppRelease>>>> {
    return request.get('/api/v1/releases', { params });
  },

  /** 创建新版本 */
  createRelease(body: CreateReleaseBody): Promise<AxiosResponse<ApiResponse<AppRelease>>> {
    return request.post('/api/v1/releases', body);
  },

  /** 删除版本 */
  deleteRelease(id: number): Promise<AxiosResponse<ApiResponse<null>>> {
    return request.delete(`/api/v1/releases/${id}`);
  },

  /** 获取展厅目标版本 */
  getHallVersion(hallId: number): Promise<AxiosResponse<ApiResponse<HallAppVersion | null>>> {
    return request.get(`/api/v1/halls/${hallId}/app-version`);
  },

  /** 设置展厅目标版本 */
  setHallVersion(hallId: number, body: SetHallVersionBody): Promise<AxiosResponse<ApiResponse<null>>> {
    return request.put(`/api/v1/halls/${hallId}/app-version`, body);
  },

  /** 推送更新通知 */
  notifyUpdate(hallId: number, version: string): Promise<AxiosResponse<ApiResponse<null>>> {
    return request.post(`/api/v1/halls/${hallId}/notify-update`, { version });
  },
};
