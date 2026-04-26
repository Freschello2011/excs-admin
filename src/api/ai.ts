/**
 * Phase 3-B：ai 全部 22 端点已切到 typed `aiClient`（@/api/gen/client）。
 *
 * 本文件保留为 AxiosResponse 兼容壳：老 react-query 调用方写
 * `useQuery({ queryFn: () => aiApi.getAvatar(id), select: (res) => res.data.data })`
 * 完全零改动。新代码请直接 import `aiClient`（自带 unwrap，返回纯 data）。
 *
 * 例外：testChat（SSE 流）保留原 fetch 实现 —— typed client 不消费 SSE 字节流，
 * 调用方走 fetch + ReadableStream。
 */
import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import {
  aiClient,
  type AiAvatarDetail,
  type AiAvatarBody,
  type TemplateListItem,
  type AiAvatarTemplate,
  type CreateTemplateRequest,
  type UpdateTemplateRequest,
  type TemplateUploadUrlRequest,
  type TemplateUploadUrlResult,
  type TemplateUploadCompleteRequest,
  type TemplateUploadCompleteResult,
  type VoiceItem,
  type TtsSynthesizeRequest,
  type TtsSynthesizeResult,
  type KnowledgeFile,
  type KnowledgeUploadUrlRequest,
  type KnowledgeUploadUrlResult,
  type KnowledgeSearchRequest,
  type KnowledgeChunk,
  type TestTagSearchRequest,
  type TestTagSearchResult,
} from '@/api/gen/client';

/** 把 typed Promise<T> 包成 AxiosResponse<ApiResponse<T>>（react-query select(res.data.data) 老调用零改动） */
function asAxiosLike<T>(p: Promise<T>): Promise<AxiosResponse<ApiResponse<T>>> {
  return p.then((data) => ({
    data: { code: 0, message: 'ok', data } as ApiResponse<T>,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
  }));
}

export const aiApi = {
  /** 获取 AI 形象配置 */
  getAvatar(
    exhibitId: number,
    options?: { skipErrorMessage?: boolean },
  ): Promise<AxiosResponse<ApiResponse<AiAvatarDetail>>> {
    return asAxiosLike(aiClient.getAvatar(exhibitId, options));
  },

  /** 配置 AI 形象 */
  updateAvatar(exhibitId: number, data: AiAvatarBody): Promise<AxiosResponse<ApiResponse<AiAvatarDetail>>> {
    return asAxiosLike(aiClient.configureAvatar(exhibitId, data));
  },

  /** 激活 AI 形象（hall_id 必填，path:/api/v1/ai/avatars/:id/activate?hall_id=） */
  activateAvatar(exhibitId: number, hallId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosLike(aiClient.activateAvatar(exhibitId, hallId));
  },

  /** 停用 AI 形象 */
  deactivateAvatar(exhibitId: number, hallId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosLike(aiClient.deactivateAvatar(exhibitId, hallId));
  },

  /* ==================== Avatar Templates ==================== */

  createTemplate(data: CreateTemplateRequest): Promise<AxiosResponse<ApiResponse<AiAvatarTemplate>>> {
    return asAxiosLike(aiClient.createTemplate(data));
  },

  updateTemplate(templateId: number, data: UpdateTemplateRequest): Promise<AxiosResponse<ApiResponse<AiAvatarTemplate>>> {
    return asAxiosLike(aiClient.updateTemplate(templateId, data));
  },

  getTemplateUploadURL(templateId: number, data: TemplateUploadUrlRequest): Promise<AxiosResponse<ApiResponse<TemplateUploadUrlResult>>> {
    return asAxiosLike(aiClient.getTemplateUploadURL(templateId, data));
  },

  completeTemplateUpload(templateId: number, data: TemplateUploadCompleteRequest): Promise<AxiosResponse<ApiResponse<TemplateUploadCompleteResult>>> {
    return asAxiosLike(aiClient.completeTemplateUpload(templateId, data));
  },

  listTemplates(): Promise<AxiosResponse<ApiResponse<{ list: TemplateListItem[] }>>> {
    return asAxiosLike(aiClient.listTemplates() as Promise<{ list: TemplateListItem[] }>);
  },

  getTemplate(templateId: number): Promise<AxiosResponse<ApiResponse<AiAvatarTemplate>>> {
    return asAxiosLike(aiClient.getTemplate(templateId));
  },

  deleteTemplate(templateId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosLike(aiClient.deleteTemplate(templateId));
  },

  /* ==================== Voices & TTS ==================== */

  listVoices(): Promise<AxiosResponse<ApiResponse<{ list: VoiceItem[] }>>> {
    return asAxiosLike(aiClient.listVoices() as Promise<{ list: VoiceItem[] }>);
  },

  synthesizeSpeech(data: TtsSynthesizeRequest): Promise<AxiosResponse<ApiResponse<TtsSynthesizeResult>>> {
    return asAxiosLike(aiClient.synthesizeSpeech(data));
  },

  /* ==================== Knowledge Files ==================== */

  getKnowledgeUploadURL(data: KnowledgeUploadUrlRequest): Promise<AxiosResponse<ApiResponse<KnowledgeUploadUrlResult>>> {
    return asAxiosLike(aiClient.getKnowledgeUploadURL(data));
  },

  completeKnowledgeUpload(fileId: number): Promise<AxiosResponse<ApiResponse<KnowledgeFile>>> {
    return asAxiosLike(aiClient.completeKnowledgeUpload(fileId));
  },

  listKnowledgeFiles(params: { exhibit_id?: number; hall_id: number }): Promise<AxiosResponse<ApiResponse<{ list: KnowledgeFile[] }>>> {
    return asAxiosLike(aiClient.listKnowledgeFiles(params) as Promise<{ list: KnowledgeFile[] }>);
  },

  deleteKnowledgeFile(fileId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return asAxiosLike(aiClient.deleteKnowledgeFile(fileId));
  },

  searchKnowledge(data: KnowledgeSearchRequest): Promise<AxiosResponse<ApiResponse<{ chunks: KnowledgeChunk[] }>>> {
    return asAxiosLike(aiClient.searchKnowledge(data) as Promise<{ chunks: KnowledgeChunk[] }>);
  },

  /* ==================== Test Chat & Tag Search ==================== */

  /** 测试对话（SSE 流） — 返回 ReadableStream，调用方自行解析 SSE 事件。typed client 不消费此响应。 */
  testChat(
    exhibitId: number,
    hallId: number,
    data: { text: string; session_key?: string },
    signal?: AbortSignal,
  ): Promise<Response> {
    const token = localStorage.getItem('excs-access-token');
    const baseURL = import.meta.env.VITE_API_BASE_URL || '';
    return fetch(`${baseURL}/api/v1/ai/avatars/${exhibitId}/test-chat?hall_id=${hallId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal,
    });
  },

  /** 测试标签搜索 */
  testTagSearch(exhibitId: number, hallId: number, data: TestTagSearchRequest): Promise<AxiosResponse<ApiResponse<TestTagSearchResult>>> {
    return asAxiosLike(aiClient.testTagSearch(exhibitId, hallId, data));
  },
};

// 让 request 显式被引用，避免 import-未使用 lint（保留 axios 拦截器入口）
void request;
