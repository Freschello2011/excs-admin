import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  NASArchiveListItem,
  NASArchiveListParams,
  NASStats,
  NASRegenerateTokenResp,
} from '@/types/nas';
import type { PaginatedData } from '@/types/api';

export const nasArchiveApi = {
  /** NAS 归档记录列表（分页 + 筛选） */
  list(params: NASArchiveListParams): Promise<AxiosResponse<ApiResponse<PaginatedData<NASArchiveListItem>>>> {
    return request.get('/api/v1/nas-archive/list', { params });
  },

  /** 存储统计页 NAS 卡片数据 */
  stats(): Promise<AxiosResponse<ApiResponse<NASStats>>> {
    return request.get('/api/v1/nas-archive/stats');
  },

  /** 失败记录手动重试 */
  retry(id: number): Promise<AxiosResponse<ApiResponse<{ ok: boolean }>>> {
    return request.post(`/api/v1/nas-archive/${id}/retry`);
  },

  /** 重新生成 Agent Token（明文仅返回一次） */
  regenerateToken(): Promise<AxiosResponse<ApiResponse<NASRegenerateTokenResp>>> {
    return request.post('/api/v1/sys-configs/nas/regenerate-token');
  },
};
