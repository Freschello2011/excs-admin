/**
 * Phase 3-A：show 全部 19 端点已切到 typed `showClient`（@/api/gen/client）。
 *
 * 本文件保留为 AxiosResponse 兼容壳：老 react-query 调用方写
 * `useQuery({ queryFn: () => showApi.getShow(id), select: (res) => res.data.data })`
 * 完全零改动。新代码请直接 import `showClient`（自带 unwrap，返回纯 data）。
 */
import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  ShowListPage,
  ShowDTO,
  ShowVersionDTO,
  ShowControlResult,
  ShowTrackDTO,
  ShowActionDTO,
  ShowListParams,
  CreateShowRequest,
  UpdateShowRequest,
  CreateShowTrackRequest,
  UpdateShowTrackRequest,
  CreateShowActionRequest,
  UpdateShowActionRequest,
  SaveShowTimelineRequest,
  RehearseAction,
  RehearseShowRequest,
} from '@/api/gen/client';

export const showApi = {
  /* ==================== Show CRUD ==================== */

  getShows(params: ShowListParams): Promise<AxiosResponse<ApiResponse<ShowListPage>>> {
    return request.get('/api/v1/shows', { params });
  },

  getShow(showId: number): Promise<AxiosResponse<ApiResponse<ShowDTO>>> {
    return request.get(`/api/v1/shows/${showId}`);
  },

  createShow(data: CreateShowRequest): Promise<AxiosResponse<ApiResponse<ShowDTO>>> {
    return request.post('/api/v1/shows', data);
  },

  updateShow(showId: number, data: UpdateShowRequest): Promise<AxiosResponse<ApiResponse<ShowDTO>>> {
    return request.put(`/api/v1/shows/${showId}`, data);
  },

  deleteShow(showId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/shows/${showId}`);
  },

  /* ==================== Track ==================== */

  addTrack(showId: number, data: CreateShowTrackRequest): Promise<AxiosResponse<ApiResponse<ShowTrackDTO>>> {
    return request.post(`/api/v1/shows/${showId}/tracks`, data);
  },

  updateTrack(
    showId: number,
    trackId: number,
    data: UpdateShowTrackRequest,
  ): Promise<AxiosResponse<ApiResponse<ShowTrackDTO>>> {
    return request.put(`/api/v1/shows/${showId}/tracks/${trackId}`, data);
  },

  deleteTrack(showId: number, trackId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/shows/${showId}/tracks/${trackId}`);
  },

  /* ==================== Action ==================== */

  addAction(
    showId: number,
    trackId: number,
    data: CreateShowActionRequest,
  ): Promise<AxiosResponse<ApiResponse<ShowActionDTO>>> {
    return request.post(`/api/v1/shows/${showId}/tracks/${trackId}/actions`, data);
  },

  updateAction(
    showId: number,
    actionId: number,
    data: UpdateShowActionRequest,
  ): Promise<AxiosResponse<ApiResponse<ShowActionDTO>>> {
    return request.put(`/api/v1/shows/${showId}/actions/${actionId}`, data);
  },

  deleteAction(showId: number, actionId: number): Promise<AxiosResponse<ApiResponse<void>>> {
    return request.delete(`/api/v1/shows/${showId}/actions/${actionId}`);
  },

  /* ==================== Timeline ==================== */

  saveTimeline(showId: number, data: SaveShowTimelineRequest): Promise<AxiosResponse<ApiResponse<ShowDTO>>> {
    return request.put(`/api/v1/shows/${showId}/timeline`, data);
  },

  /* ==================== Publish & Versions ==================== */

  publishShow(showId: number): Promise<AxiosResponse<ApiResponse<ShowVersionDTO>>> {
    return request.post(`/api/v1/shows/${showId}/publish`);
  },

  getVersions(showId: number): Promise<AxiosResponse<ApiResponse<ShowVersionDTO[]>>> {
    return request.get(`/api/v1/shows/${showId}/versions`);
  },

  /* ==================== Show control ==================== */

  startShow(showId: number): Promise<AxiosResponse<ApiResponse<ShowControlResult>>> {
    return request.post(`/api/v1/shows/${showId}/start`);
  },
  pauseShow(showId: number): Promise<AxiosResponse<ApiResponse<ShowControlResult>>> {
    return request.post(`/api/v1/shows/${showId}/pause`);
  },
  resumeShow(showId: number): Promise<AxiosResponse<ApiResponse<ShowControlResult>>> {
    return request.post(`/api/v1/shows/${showId}/resume`);
  },
  cancelShow(showId: number): Promise<AxiosResponse<ApiResponse<ShowControlResult>>> {
    return request.post(`/api/v1/shows/${showId}/cancel`);
  },

  /* ==================== Rehearsal ==================== */

  rehearse(showId: number, action: RehearseAction): Promise<AxiosResponse<ApiResponse<ShowControlResult>>> {
    return request.post(`/api/v1/shows/${showId}/rehearse`, { action } satisfies RehearseShowRequest);
  },
};
