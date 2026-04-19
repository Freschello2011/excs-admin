import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type { DashboardData } from '@/types/dashboard';

export const dashboardApi = {
  /** 获取仪表盘数据 */
  getStats(): Promise<AxiosResponse<ApiResponse<DashboardData>>> {
    return request.get('/api/v1/dashboard/stats');
  },
};
