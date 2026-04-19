import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type { OperationLogItem, OperationLogParams } from '@/types/log';

export const logApi = {
  /** 1. 操作日志列表 */
  getLogs(params: OperationLogParams): Promise<AxiosResponse<ApiResponse<PaginatedData<OperationLogItem>>>> {
    return request.get('/api/v1/operation-logs', { params });
  },

  /** 2. 导出 CSV — returns blob */
  exportCSV(params: Omit<OperationLogParams, 'page' | 'page_size'>): Promise<AxiosResponse<Blob>> {
    const token = localStorage.getItem('excs-access-token') || '';
    return request.get('/api/v1/operation-logs/export', {
      params: { ...params, token },
      responseType: 'blob',
    });
  },
};
