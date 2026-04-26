// Phase 3-C：从手写 axios 调用迁到 OpenAPI typed client。
//
// `notificationApi.*` 保留 AxiosResponse<ApiResponse<T>> 形态——react-query
// `select: (res) => res.data.data` / 老 `.then(res => res.data)` 调用方零改动；
// 内部全部代理到 `notificationClient.*`（typed，剥 envelope）。
//
// 新调用方应直接用 `import { notificationClient } from '@/api/gen/client'`。

import type { AxiosResponse } from 'axios';
import type { ApiResponse, PaginatedData } from '@/types/api';
import {
  notificationClient,
  type NotificationConfigDTO,
  type NotificationLogDTO,
  type NotificationLogPage,
  type UpdateNotificationConfigRequest,
  type NotificationLogParams,
} from './gen/client';

function envelope<T>(data: T): AxiosResponse<ApiResponse<T>> {
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {} as never,
    config: {} as never,
  } as AxiosResponse<ApiResponse<T>>;
}

export const notificationApi = {
  /** 1. 通知配置列表 */
  getConfigs(hallId: number): Promise<AxiosResponse<ApiResponse<NotificationConfigDTO[]>>> {
    return notificationClient.listNotificationConfigs(hallId).then(envelope);
  },

  /** 2. 更新通知配置 */
  updateConfig(
    hallId: number,
    eventType: string,
    data: UpdateNotificationConfigRequest,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return notificationClient.updateNotificationConfig(hallId, eventType, data).then(envelope);
  },

  /** 3. 通知日志列表 */
  getLogs(
    hallId: number,
    params: NotificationLogParams,
  ): Promise<AxiosResponse<ApiResponse<PaginatedData<NotificationLogDTO>>>> {
    // NotificationLogPage 与 PaginatedData<NotificationLogDTO> 字段集对齐
    // （list / total / page / page_size），结构兼容；类型 cast 保留老 react-query select 路径。
    return notificationClient
      .listNotificationLogs(hallId, params)
      .then((p: NotificationLogPage) => envelope(p as PaginatedData<NotificationLogDTO>));
  },
};
