import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  AiAvatarDetail,
  AiAvatarBody,
  TemplateListItem,
  AiAvatarTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  TemplateUploadUrlRequest,
  TemplateUploadUrlResult,
  TemplateUploadCompleteRequest,
  TemplateUploadCompleteResult,
  VoiceItem,
  TtsSynthesizeRequest,
  TtsSynthesizeResult,
  KnowledgeFile,
  KnowledgeUploadUrlRequest,
  KnowledgeUploadUrlResult,
  KnowledgeSearchRequest,
  KnowledgeChunk,
  TestTagSearchRequest,
  TestTagSearchResult,
} from '@/types/ai';

export const aiApi = {
  /** 获取 AI 形象配置 */
  getAvatar(exhibitId: number, options?: { skipErrorMessage?: boolean }): Promise<AxiosResponse<ApiResponse<AiAvatarDetail>>> {
    return request.get(`/api/v1/ai/avatars/${exhibitId}`, {
      skipErrorMessage: options?.skipErrorMessage,
    });
  },

  /** 配置 AI 形象 */
  updateAvatar(exhibitId: number, data: AiAvatarBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/ai/avatars/${exhibitId}`, data);
  },

  /** 激活 AI 形象 */
  activateAvatar(exhibitId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/ai/avatars/${exhibitId}/activate`);
  },

  /** 停用 AI 形象 */
  deactivateAvatar(exhibitId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/ai/avatars/${exhibitId}/deactivate`);
  },

  /* ==================== Avatar Templates ==================== */

  /** 创建形象模板 */
  createTemplate(data: CreateTemplateRequest): Promise<AxiosResponse<ApiResponse<AiAvatarTemplate>>> {
    return request.post('/api/v1/ai/avatar-templates', data);
  },

  /** 更新形象模板（支持 name/description/default_layout_config） */
  updateTemplate(templateId: number, data: UpdateTemplateRequest): Promise<AxiosResponse<ApiResponse<AiAvatarTemplate>>> {
    return request.put(`/api/v1/ai/avatar-templates/${templateId}`, data);
  },

  /** 获取模板上传 URL */
  getTemplateUploadURL(templateId: number, data: TemplateUploadUrlRequest): Promise<AxiosResponse<ApiResponse<TemplateUploadUrlResult>>> {
    return request.post(`/api/v1/ai/avatar-templates/${templateId}/upload-url`, data);
  },

  /** 通知视频上传完成 */
  completeTemplateUpload(templateId: number, data: TemplateUploadCompleteRequest): Promise<AxiosResponse<ApiResponse<TemplateUploadCompleteResult>>> {
    return request.post(`/api/v1/ai/avatar-templates/${templateId}/upload-complete`, data);
  },

  /** 获取模板列表 */
  listTemplates(): Promise<AxiosResponse<ApiResponse<{ list: TemplateListItem[] }>>> {
    return request.get('/api/v1/ai/avatar-templates');
  },

  /** 获取模板详情 */
  getTemplate(templateId: number): Promise<AxiosResponse<ApiResponse<AiAvatarTemplate>>> {
    return request.get(`/api/v1/ai/avatar-templates/${templateId}`);
  },

  /** 删除形象模板 */
  deleteTemplate(templateId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/ai/avatar-templates/${templateId}`);
  },

  /* ==================== Voices & TTS ==================== */

  /** 获取可用语音列表 */
  listVoices(): Promise<AxiosResponse<ApiResponse<{ list: VoiceItem[] }>>> {
    return request.get('/api/v1/ai/voices');
  },

  /** TTS 合成试听 */
  synthesizeSpeech(data: TtsSynthesizeRequest): Promise<AxiosResponse<ApiResponse<TtsSynthesizeResult>>> {
    return request.post('/api/v1/ai/tts/synthesize', data);
  },

  /* ==================== Knowledge Files ==================== */

  /** 获取知识库文件上传 URL */
  getKnowledgeUploadURL(data: KnowledgeUploadUrlRequest): Promise<AxiosResponse<ApiResponse<KnowledgeUploadUrlResult>>> {
    return request.post('/api/v1/ai/knowledge-files/upload-url', data);
  },

  /** 通知知识文件上传完成 */
  completeKnowledgeUpload(fileId: number): Promise<AxiosResponse<ApiResponse<{ file_id: number; status: string }>>> {
    return request.post(`/api/v1/ai/knowledge-files/${fileId}/upload-complete`);
  },

  /** 获取知识库文件列表 */
  listKnowledgeFiles(params: { exhibit_id?: number; hall_id?: number }): Promise<AxiosResponse<ApiResponse<{ list: KnowledgeFile[] }>>> {
    return request.get('/api/v1/ai/knowledge-files', { params });
  },

  /** 删除知识库文件 */
  deleteKnowledgeFile(fileId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/ai/knowledge-files/${fileId}`);
  },

  /** 测试知识检索 */
  searchKnowledge(data: KnowledgeSearchRequest): Promise<AxiosResponse<ApiResponse<{ chunks: KnowledgeChunk[] }>>> {
    return request.post('/api/v1/ai/knowledge/search', data);
  },

  /* ==================== Test Chat & Tag Search ==================== */

  /** 测试对话（SSE 流） — 返回 ReadableStream，调用方自行解析 SSE 事件 */
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
    return request.post(`/api/v1/ai/avatars/${exhibitId}/test-tag-search?hall_id=${hallId}`, data);
  },
};
