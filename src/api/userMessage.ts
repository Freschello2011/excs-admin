// Phase 3-G：站内消息 4 端点切到 OpenAPI typed client。
//
// `userMessageApi.*` 保留 AxiosResponse<ApiResponse<T>> 形态。
// 新调用方应直接用 `import { userMessageClient } from '@/api/gen/client'`。

import type { AxiosResponse } from 'axios';
import type { ApiResponse } from '@/types/api';
import {
  userMessageClient,
  type UserMessageListParams,
  type UserMessageListResult,
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

export const userMessageApi = {
  list(params?: UserMessageListParams): Promise<AxiosResponse<ApiResponse<UserMessageListResult>>> {
    return userMessageClient.list(params ?? {}).then(envelope);
  },

  unreadCount(): Promise<AxiosResponse<ApiResponse<{ unread: number }>>> {
    return userMessageClient.unreadCount().then((r) => envelope({ unread: r.unread }));
  },

  markRead(id: number): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return userMessageClient.markRead(id).then((r) => envelope({ id: r.id }));
  },

  markAllRead(): Promise<AxiosResponse<ApiResponse<{ ok: boolean }>>> {
    return userMessageClient.markAllRead().then((r) => envelope({ ok: r.ok }));
  },
};
