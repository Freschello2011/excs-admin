import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type {
  ContentListItem,
  ContentListParams,
  ContentDetail,
  RequestUploadBody,
  RequestUploadResult,
  UploadCompleteBody,
  UploadCompleteResult,
  PipelineStatusResult,
  ContentTag,
  CreateTagBody,
  UpdateTagBody,
  TagSearchParams,
  DistributionItem,
  DistributionListParams,
  DownloadUrlResult,
  WatermarkBody,
  OSSStatsResult,
  ContentCleanupResult,
  QueueStatus,
  ExhibitContentItem,
  SlideshowConfig,
  ConfigureSlideshowBody,
} from '@/types/content';

export const contentApi = {
  /* ==================== Content ==================== */

  /** 内容详情 */
  getContent(contentId: number): Promise<AxiosResponse<ApiResponse<ContentDetail>>> {
    return request.get(`/api/v1/contents/${contentId}`);
  },

  /** 内容列表 */
  listContents(params: ContentListParams): Promise<AxiosResponse<ApiResponse<PaginatedData<ContentListItem>>>> {
    return request.get('/api/v1/contents', { params });
  },

  /** 更新内容名称 */
  updateContent(contentId: number, name: string): Promise<AxiosResponse<ApiResponse<ContentListItem>>> {
    return request.put(`/api/v1/contents/${contentId}`, { name });
  },

  /** 删除内容 */
  deleteContent(contentId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/contents/${contentId}`);
  },

  /** 绑定到展项 */
  bindToExhibit(contentId: number, exhibitId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/contents/${contentId}/bind-exhibit`, { exhibit_id: exhibitId });
  },

  /** 解绑内容 */
  unbindContent(contentId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/contents/${contentId}/unbind`);
  },

  /* ==================== Upload ==================== */

  /** 获取上传凭证（按展厅） */
  requestUpload(hallId: number, data: RequestUploadBody): Promise<AxiosResponse<ApiResponse<RequestUploadResult>>> {
    return request.post('/api/v1/contents/upload', data, { params: { hall_id: hallId } });
  },

  /** 上传完成通知 */
  uploadComplete(contentId: number, data: UploadCompleteBody): Promise<AxiosResponse<ApiResponse<UploadCompleteResult>>> {
    return request.post(`/api/v1/contents/${contentId}/upload-complete`, data);
  },

  /* ==================== Pipeline ==================== */

  /** 流水线状态 */
  getPipelineStatus(contentId: number): Promise<AxiosResponse<ApiResponse<PipelineStatusResult>>> {
    return request.get(`/api/v1/contents/${contentId}/pipeline-status`);
  },

  /* ==================== Tags ==================== */

  /** 搜索标签（全文检索） */
  searchTags(params: TagSearchParams): Promise<AxiosResponse<ApiResponse<ContentTag[]>>> {
    return request.get('/api/v1/content-tags', { params });
  },

  /** 内容标签列表 */
  getContentTags(contentId: number): Promise<AxiosResponse<ApiResponse<ContentTag[]>>> {
    return request.get(`/api/v1/contents/${contentId}/tags`);
  },

  /** 创建标签 */
  createTag(contentId: number, data: CreateTagBody): Promise<AxiosResponse<ApiResponse<ContentTag>>> {
    return request.post(`/api/v1/contents/${contentId}/tags`, data);
  },

  /** 更新标签 */
  updateTag(tagId: number, data: UpdateTagBody): Promise<AxiosResponse<ApiResponse<ContentTag>>> {
    return request.put(`/api/v1/content-tags/${tagId}`, data);
  },

  /** 删除标签 */
  deleteTag(tagId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/content-tags/${tagId}`);
  },

  /** 重新触发 AI 标签 */
  retag(contentId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.post(`/api/v1/contents/${contentId}/retag`);
  },

  /* ==================== Distribution ==================== */

  /** 分发状态查询 */
  getDistributions(params: DistributionListParams): Promise<AxiosResponse<ApiResponse<DistributionItem[]>>> {
    return request.get('/api/v1/content-distributions', { params });
  },

  /** 获取离线分发下载链接 */
  getDownloadUrl(contentId: number): Promise<AxiosResponse<ApiResponse<DownloadUrlResult>>> {
    return request.get(`/api/v1/contents/${contentId}/download-url`);
  },

  /** 设置水印标记 */
  setWatermark(contentId: number, data: WatermarkBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/contents/${contentId}/watermark`, data);
  },

  /* ==================== OSS Stats ==================== */

  /** OSS 存储统计 */
  getOSSStats(hallId: number): Promise<AxiosResponse<ApiResponse<OSSStatsResult>>> {
    return request.get(`/api/v1/halls/${hallId}/oss-stats`);
  },

  /** 触发过期内容清理 */
  triggerCleanup(hallId: number): Promise<AxiosResponse<ApiResponse<ContentCleanupResult>>> {
    return request.post(`/api/v1/halls/${hallId}/content-cleanup`);
  },

  /* ==================== Queue Status ==================== */

  /** 队列状态 */
  getQueueStatus(): Promise<AxiosResponse<ApiResponse<QueueStatus>>> {
    return request.get('/api/v1/content-pipeline/queue-status');
  },

  /* ==================== Exhibit Content ==================== */

  /** 展项级内容列表 */
  getExhibitContent(exhibitId: number): Promise<AxiosResponse<ApiResponse<ExhibitContentItem[]>>> {
    return request.get(`/api/v1/exhibits/${exhibitId}/content`);
  },

  /** 上传到展项 */
  uploadToExhibit(exhibitId: number, data: { filename: string; content_type: string; file_size: number }): Promise<AxiosResponse<ApiResponse<RequestUploadResult>>> {
    return request.post(`/api/v1/exhibits/${exhibitId}/upload`, data);
  },

  /** 展厅未绑定内容 */
  getUnboundContent(hallId: number): Promise<AxiosResponse<ApiResponse<ExhibitContentItem[]>>> {
    return request.get(`/api/v1/halls/${hallId}/unbound-contents`);
  },

  /* ==================== Slideshow ==================== */

  /** 获取图文汇报配置 */
  getSlideshowConfig(exhibitId: number): Promise<AxiosResponse<ApiResponse<SlideshowConfig | null>>> {
    return request.get(`/api/v1/exhibits/${exhibitId}/slideshow`);
  },

  /** 配置图文汇报 */
  configureSlideshow(exhibitId: number, data: ConfigureSlideshowBody): Promise<AxiosResponse<ApiResponse<SlideshowConfig>>> {
    return request.put(`/api/v1/exhibits/${exhibitId}/slideshow`, data);
  },

  /** 删除图文汇报配置 */
  deleteSlideshow(exhibitId: number): Promise<AxiosResponse<ApiResponse<null>>> {
    return request.delete(`/api/v1/exhibits/${exhibitId}/slideshow`);
  },
};
