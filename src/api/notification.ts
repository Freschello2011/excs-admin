import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type {
  NotificationConfigItem,
  NotificationConfigBody,
  NotificationLogItem,
  NotificationLogParams,
} from '@/types/notification';

export const notificationApi = {
  /** 1. 通知配置列表 */
  getConfigs(hallId: number): Promise<AxiosResponse<ApiResponse<NotificationConfigItem[]>>> {
    return request.get(`/api/v1/halls/${hallId}/notification-configs`);
  },

  /** 2. 更新通知配置 */
  updateConfig(
    hallId: number,
    eventType: string,
    data: NotificationConfigBody,
  ): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/halls/${hallId}/notification-configs/${eventType}`, data);
  },

  /** 3. 通知日志列表 */
  getLogs(hallId: number, params: NotificationLogParams): Promise<AxiosResponse<ApiResponse<PaginatedData<NotificationLogItem>>>> {
    return request.get(`/api/v1/halls/${hallId}/notification-logs`, { params });
  },
};
