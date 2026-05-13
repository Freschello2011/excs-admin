/**
 * Phase 3-D：releaseApi 重写为 AxiosResponse 兼容壳，代理到 releaseClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。新代码请直接用 releaseClient（unwrap 后返回 .data）。
 */
import type { AxiosResponse } from 'axios';
import {
  releaseClient,
  type AppRelease,
  type HallAppVersionDTO,
  type HallAppVersionListData,
  type RequestReleaseUploadRequest,
  type RequestReleaseUploadResponse,
  type CreateReleaseBody,
  type SetHallVersionBody,
  type ReleaseListParams,
  type PageData,
} from './gen/client';

/**
 * release 上传凭证的本地别名（与 content context 的 RequestUploadResult 撞名，故不进 client.ts 全局导出）。
 * 老调用方仍 import 这两个名字；类型等价于 yaml 的 RequestReleaseUploadRequest/Response。
 */
export type RequestUploadBody = RequestReleaseUploadRequest;
export type RequestUploadResult = RequestReleaseUploadResponse;

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

function ok<T>(data: T, status = 200): AxiosResponse<ApiResponse<T>> {
  return {
    data: { code: 0, message: 'ok', data },
    status,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
  };
}

export const releaseApi = {
  requestUpload(
    body: RequestUploadBody,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<RequestUploadResult>>> {
    return releaseClient.requestReleaseUpload(body, reason).then((d) => ok(d));
  },
  listReleases(
    params: ReleaseListParams,
  ): Promise<AxiosResponse<ApiResponse<PageData<AppRelease>>>> {
    return releaseClient.listReleases(params).then((d) => ok(d));
  },
  createRelease(
    body: CreateReleaseBody,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<AppRelease>>> {
    return releaseClient.createRelease(body, reason).then((d) => ok(d, 201));
  },
  deleteRelease(id: number, reason?: string): Promise<AxiosResponse<ApiResponse<null>>> {
    return releaseClient.deleteRelease(id, reason).then(() => ok(null));
  },
  /**
   * 2026-05-10：返回 list（一个 hall 可能多 platform）。
   * 老调用方（select: res.data.data 后当成单条用）需按 .list[0] 或 .list.find(p=>p.platform===...) 适配。
   */
  getHallVersion(
    hallId: number,
  ): Promise<AxiosResponse<ApiResponse<HallAppVersionListData>>> {
    return releaseClient.getHallAppVersion(hallId).then((d) => ok(d));
  },
  setHallVersion(
    hallId: number,
    body: SetHallVersionBody,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<null>>> {
    return releaseClient.setHallAppVersion(hallId, body, reason).then(() => ok(null));
  },
  /** 把展厅 × 平台目标版本抹平到当前 installed_version；rollout_status 切 done。 */
  syncHallVersionToInstalled(
    hallId: number,
    platform: string,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<HallAppVersionDTO>>> {
    return releaseClient
      .syncHallAppVersionToInstalled(hallId, { platform }, reason)
      .then((d) => ok(d));
  },
  notifyUpdate(
    hallId: number,
    version: string,
    reason?: string,
  ): Promise<AxiosResponse<ApiResponse<null>>> {
    return releaseClient.notifyAppUpdate(hallId, { version }, reason).then(() => ok(null));
  },
};
