/**
 * Phase 2-B：content context AxiosResponse 兼容壳。
 *
 * 历史 react-query 调用方写：
 *   const { data: res } = useQuery({ queryFn: () => contentApi.getContent(id) });
 *   const detail = res.data.data;  // 第一层 axios.data，第二层 ApiResponse.data
 *
 * 新 typed client (`contentClient.*`) 已剥 envelope，只返 .data。为了让历史调用方零改动，
 * 这里把每个方法包成 AxiosResponse<ApiResponse<T>>，内部 await typed call 后回填到
 * `{ data: { code: 0, message: 'ok', data: ... } }` 的形状。
 *
 * 新代码请直接 import `contentClient` from '@/api/gen/client'。
 */
import type { AxiosResponse } from 'axios';
import {
  contentClient,
  type AdminListContentsParams,
  type CleanupResult,
  type ConfigureSlideshowRequest,
  type ContentDetailDTO,
  type ContentListPage,
  type CreateTagRequest,
  type DistributionDTO,
  type DownloadURLResult,
  type ExhibitContentDTO,
  type GetContentDistributionsParams,
  type ListContentsParams,
  type OSSStatsResult,
  type PipelineStatusResult,
  type QueueStatusResult,
  type RejectContentRequest,
  type RequestUploadRequest,
  type RequestUploadResult,
  type ResubmitContentRequest,
  type SearchContentTagsParams,
  type SlideshowConfig,
  type TagDTO,
  type UpdateTagRequest,
  type VendorListMyContentsParams,
  type WatermarkRequest,
} from './gen/client';
import type { ApiResponse } from '@/types/api';

/** 把 typed Promise<T> 包成 AxiosResponse<ApiResponse<T>>（react-query select 第二层 .data 兜底）。 */
async function asAxiosResp<T>(p: Promise<T>): Promise<AxiosResponse<ApiResponse<T>>> {
  const data = await p;
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    // 类型上 AxiosResponse 还要 config，调用方都是 select(res => res.data.data) 不读 config，强制 cast 安全。
    config: {} as AxiosResponse<ApiResponse<T>>['config'],
  };
}

export const contentApi = {
  /* ==================== Content ==================== */

  getContent(contentId: number) {
    return asAxiosResp<ContentDetailDTO>(contentClient.getContent(contentId));
  },
  listContents(params: ListContentsParams) {
    return asAxiosResp<ContentListPage>(contentClient.listContents(params));
  },
  updateContent(contentId: number, name: string) {
    return asAxiosResp<ContentDetailDTO>(contentClient.updateContent(contentId, { name }));
  },
  deleteContent(contentId: number) {
    return asAxiosResp<void>(contentClient.deleteContent(contentId));
  },

  /* ==================== Bind / Unbind ==================== */

  bindToExhibit(contentId: number, exhibitId: number) {
    return asAxiosResp<void>(contentClient.bindToExhibit(contentId, exhibitId));
  },
  unbindContent(contentId: number) {
    return asAxiosResp<void>(contentClient.unbindContent(contentId));
  },

  /* ==================== Upload ==================== */

  requestUpload(hallId: number, data: RequestUploadRequest) {
    return asAxiosResp<RequestUploadResult>(contentClient.requestUpload(hallId, data));
  },
  uploadComplete(contentId: number, data: { content_id: number }) {
    return asAxiosResp(contentClient.uploadComplete(contentId, data));
  },

  /* ==================== Pipeline ==================== */

  getPipelineStatus(contentId: number) {
    return asAxiosResp<PipelineStatusResult>(contentClient.getPipelineStatus(contentId));
  },

  /* ==================== Tags ==================== */

  searchTags(params: SearchContentTagsParams) {
    return asAxiosResp<TagDTO[]>(contentClient.searchTags(params));
  },
  getContentTags(contentId: number) {
    return asAxiosResp<TagDTO[]>(contentClient.getContentTags(contentId));
  },
  createTag(contentId: number, data: CreateTagRequest) {
    return asAxiosResp<TagDTO>(contentClient.createTag(contentId, data));
  },
  updateTag(tagId: number, data: UpdateTagRequest) {
    return asAxiosResp<TagDTO>(contentClient.updateTag(tagId, data));
  },
  deleteTag(tagId: number) {
    return asAxiosResp<void>(contentClient.deleteTag(tagId));
  },
  retag(contentId: number) {
    return asAxiosResp<void>(contentClient.retag(contentId));
  },

  /* ==================== Distribution / Download / Watermark ==================== */

  getDistributions(params: GetContentDistributionsParams) {
    return asAxiosResp<DistributionDTO[]>(contentClient.getDistributions(params));
  },
  getDownloadUrl(contentId: number) {
    return asAxiosResp<DownloadURLResult>(contentClient.getDownloadUrl(contentId));
  },
  setWatermark(contentId: number, data: WatermarkRequest) {
    return asAxiosResp<void>(contentClient.setWatermark(contentId, data));
  },

  /* ==================== OSS Stats / Cleanup / Queue ==================== */

  getOSSStats(hallId: number) {
    return asAxiosResp<OSSStatsResult>(contentClient.getOSSStats(hallId));
  },
  triggerCleanup(hallId: number) {
    return asAxiosResp<CleanupResult>(contentClient.triggerCleanup(hallId));
  },
  getQueueStatus() {
    return asAxiosResp<QueueStatusResult>(contentClient.getQueueStatus());
  },

  /* ==================== Exhibit Content / Unbound ==================== */

  getExhibitContent(exhibitId: number) {
    return asAxiosResp<ExhibitContentDTO[]>(contentClient.getExhibitContent(exhibitId));
  },
  uploadToExhibit(exhibitId: number, data: { filename: string; content_type: string; file_size: number }) {
    return asAxiosResp<RequestUploadResult>(contentClient.uploadToExhibit(exhibitId, data));
  },
  getUnboundContent(hallId: number) {
    return asAxiosResp<ExhibitContentDTO[]>(contentClient.getUnboundContent(hallId));
  },

  /* ==================== Slideshow ==================== */

  getSlideshowConfig(exhibitId: number) {
    return asAxiosResp<SlideshowConfig | null>(contentClient.getSlideshowConfig(exhibitId));
  },
  configureSlideshow(exhibitId: number, data: ConfigureSlideshowRequest) {
    return asAxiosResp<SlideshowConfig>(contentClient.configureSlideshow(exhibitId, data));
  },
  deleteSlideshow(exhibitId: number) {
    return asAxiosResp<null>(contentClient.deleteSlideshow(exhibitId));
  },

  /* ==================== Phase 10 — 内容生命周期 ==================== */

  rejectContent(contentId: number, body: RejectContentRequest) {
    return asAxiosResp<null>(contentClient.rejectContent(contentId, body));
  },
  withdrawContent(contentId: number) {
    return asAxiosResp<null>(contentClient.withdrawContent(contentId));
  },
  adminListContents(params: AdminListContentsParams) {
    return asAxiosResp<ContentListPage>(contentClient.adminListContents(params));
  },

  /* ==================== Phase 12 — 版本链 ==================== */

  getVersionChain(contentId: number) {
    return asAxiosResp<ContentDetailDTO[]>(contentClient.getVersionChain(contentId));
  },

  /* ==================== Phase 10 — 供应商工作台 ==================== */

  vendorListMyContents(params?: VendorListMyContentsParams) {
    return asAxiosResp<ContentListPage>(contentClient.vendorListMyContents(params));
  },
  vendorRequestUpload(body: RequestUploadRequest) {
    return asAxiosResp<RequestUploadResult>(contentClient.vendorRequestUpload(body));
  },
  vendorResubmit(parentContentId: number, body: ResubmitContentRequest) {
    return asAxiosResp<RequestUploadResult>(contentClient.vendorResubmit(parentContentId, body));
  },

  /* ==================== Bind alias used by RejectContentModal flow ==================== */

  /** 兼容老接口；reject 后管理员可继续点 bind。 */
};

/** 历史命名兼容（少数文件直接 import default 而非 named）—— 不预期，但留接口。 */
export default contentApi;
