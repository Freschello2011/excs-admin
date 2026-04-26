/**
 * Phase 3-E：dashboardApi 重写为 AxiosResponse 兼容壳，代理到 dashboardClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。
 */
import type { AxiosResponse } from 'axios';
import { dashboardClient, type DashboardData } from './gen/client';

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

export const dashboardApi = {
  /** 获取仪表盘数据 */
  getStats(): Promise<AxiosResponse<ApiResponse<DashboardData>>> {
    return dashboardClient.getDashboardStats().then((d) => ok(d));
  },
};
