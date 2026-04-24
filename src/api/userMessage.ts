/**
 * Phase 9 站内消息 API。
 *
 * 注意不要与 `@/api/notification`（展厅运维通知配置/日志）混用；那是按 hall 配接收人
 * 发短信；本模块是"用户自身收件箱"。后端路径：/user-messages/*
 */
import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type { UserMessageListParams, UserMessageListResult } from '@/types/userMessage';

export const userMessageApi = {
  list(params?: UserMessageListParams): Promise<AxiosResponse<ApiResponse<UserMessageListResult>>> {
    return request.get('/api/v1/user-messages', { params });
  },

  unreadCount(): Promise<AxiosResponse<ApiResponse<{ unread: number }>>> {
    return request.get('/api/v1/user-messages/unread-count');
  },

  markRead(id: number): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return request.post(`/api/v1/user-messages/${id}/read`);
  },

  markAllRead(): Promise<AxiosResponse<ApiResponse<{ ok: boolean }>>> {
    return request.post('/api/v1/user-messages/mark-all-read');
  },
};
