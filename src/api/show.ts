import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse, PaginatedData } from '@/types/api';
import type {
  ShowListItem,
  ShowListParams,
  ShowDetail,
  ShowCreateBody,
  ShowUpdateBody,
  TrackBody,
  ActionBody,
  ShowVersionItem,
  SaveTimelineBody,
} from '@/types/show';

export const showApi = {
  /* ==================== Show CRUD ==================== */

  /** 演出列表 */
  getShows(params: ShowListParams): Promise<AxiosResponse<ApiResponse<PaginatedData<ShowListItem>>>> {
    return request.get('/api/v1/shows', { params });
  },

  /** 演出详情 */
  getShow(showId: number): Promise<AxiosResponse<ApiResponse<ShowDetail>>> {
    return request.get(`/api/v1/shows/${showId}`);
  },

  /** 创建演出 */
  createShow(data: ShowCreateBody): Promise<AxiosResponse<ApiResponse<ShowDetail>>> {
    return request.post('/api/v1/shows', data);
  },

  /** 更新演出基本信息 */
  updateShow(showId: number, data: ShowUpdateBody): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/shows/${showId}`, data);
  },

  /** 删除演出 */
  deleteShow(showId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/shows/${showId}`);
  },

  /* ==================== Track ==================== */

  /** 添加轨道 */
  addTrack(showId: number, data: TrackBody): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return request.post(`/api/v1/shows/${showId}/tracks`, data);
  },

  /** 更新轨道 */
  updateTrack(showId: number, trackId: number, data: Partial<TrackBody>): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/shows/${showId}/tracks/${trackId}`, data);
  },

  /** 删除轨道 */
  deleteTrack(showId: number, trackId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/shows/${showId}/tracks/${trackId}`);
  },

  /* ==================== Action ==================== */

  /** 添加动作 */
  addAction(showId: number, trackId: number, data: ActionBody): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return request.post(`/api/v1/shows/${showId}/tracks/${trackId}/actions`, data);
  },

  /** 更新动作 */
  updateAction(showId: number, actionId: number, data: Partial<ActionBody>): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.put(`/api/v1/shows/${showId}/actions/${actionId}`, data);
  },

  /** 删除动作 */
  deleteAction(showId: number, actionId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/shows/${showId}/actions/${actionId}`);
  },

  /* ==================== Timeline ==================== */

  /** 批量保存时间轴（全量替换 tracks + actions） */
  saveTimeline(showId: number, data: SaveTimelineBody): Promise<AxiosResponse<ApiResponse<ShowDetail>>> {
    return request.put(`/api/v1/shows/${showId}/timeline`, data);
  },

  /* ==================== Publish & Versions ==================== */

  /** 发布版本 */
  publishShow(showId: number): Promise<AxiosResponse<ApiResponse<{ version: number; published_at: string }>>> {
    return request.post(`/api/v1/shows/${showId}/publish`);
  },

  /** 版本历史 */
  getVersions(showId: number): Promise<AxiosResponse<ApiResponse<ShowVersionItem[]>>> {
    return request.get(`/api/v1/shows/${showId}/versions`);
  },

  /* ==================== Rehearsal ==================== */

  /** 排练控制（start / pause / stop） */
  rehearse(
    showId: number,
    action: 'start' | 'pause' | 'stop',
  ): Promise<AxiosResponse<ApiResponse<{ msg_id: string; show_id: number; status: string }>>> {
    return request.post(`/api/v1/shows/${showId}/rehearse`, { action });
  },
};
