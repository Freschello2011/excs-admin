/**
 * Phase 3-E：logApi 重写为 AxiosResponse 兼容壳，代理到 operationLogsClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。
 *
 * exportCSV 走 axios blob 路径（不剥 envelope），保留原 AxiosResponse<Blob> 形状。
 */
import type { AxiosResponse } from 'axios';
import {
  operationLogsClient,
  type OperationLogPage,
  type OperationLogParams,
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

function okBlob(data: Blob): AxiosResponse<Blob> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/csv; charset=utf-8' },
    config: {} as AxiosResponse['config'],
  };
}

export const logApi = {
  /** 1. 操作日志列表 */
  getLogs(params: OperationLogParams): Promise<AxiosResponse<ApiResponse<OperationLogPage>>> {
    return operationLogsClient.listOperationLogs(params).then((d) => ok(d));
  },

  /** 2. 导出 CSV — returns blob */
  exportCSV(params: Omit<OperationLogParams, 'page' | 'page_size'>): Promise<AxiosResponse<Blob>> {
    const token = localStorage.getItem('excs-access-token') || '';
    return operationLogsClient
      .exportOperationLogs({ ...params, token })
      .then((blob) => okBlob(blob));
  },
};
