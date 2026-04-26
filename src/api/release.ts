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
  requestUpload(body: RequestUploadBody): Promise<AxiosResponse<ApiResponse<RequestUploadResult>>> {
    return releaseClient.requestReleaseUpload(body).then((d) => ok(d));
  },
  listReleases(
    params: ReleaseListParams,
  ): Promise<AxiosResponse<ApiResponse<PageData<AppRelease>>>> {
    return releaseClient.listReleases(params).then((d) => ok(d));
  },
  createRelease(body: CreateReleaseBody): Promise<AxiosResponse<ApiResponse<AppRelease>>> {
    return releaseClient.createRelease(body).then((d) => ok(d, 201));
  },
  deleteRelease(id: number): Promise<AxiosResponse<ApiResponse<null>>> {
    return releaseClient.deleteRelease(id).then(() => ok(null));
  },
  getHallVersion(
    hallId: number,
  ): Promise<AxiosResponse<ApiResponse<HallAppVersionDTO | null>>> {
    return releaseClient.getHallAppVersion(hallId).then((d) => ok(d));
  },
  setHallVersion(
    hallId: number,
    body: SetHallVersionBody,
  ): Promise<AxiosResponse<ApiResponse<null>>> {
    return releaseClient.setHallAppVersion(hallId, body).then(() => ok(null));
  },
  notifyUpdate(hallId: number, version: string): Promise<AxiosResponse<ApiResponse<null>>> {
    return releaseClient.notifyAppUpdate(hallId, { version }).then(() => ok(null));
  },
};
