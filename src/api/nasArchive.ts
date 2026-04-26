/**
 * Phase 3-D：nasArchiveApi 重写为 AxiosResponse 兼容壳，代理到 nasArchiveClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。
 *
 * Phase 3-E：regenerateToken 迁到 sysConfigClient.regenerateNASToken（端点实质归 sys-config context）。
 */
import type { AxiosResponse } from 'axios';
import {
  nasArchiveClient,
  sysConfigClient,
  type NASArchiveListItem,
  type NASArchiveListParams,
  type NASStats,
  type NASRegenerateTokenResp,
} from './gen/client';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}

function ok<T>(data: T): AxiosResponse<ApiResponse<T>> {
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
  };
}

export const nasArchiveApi = {
  list(
    params: NASArchiveListParams,
  ): Promise<AxiosResponse<ApiResponse<PaginatedData<NASArchiveListItem>>>> {
    return nasArchiveClient.listNASArchives(params).then((d) => ok(d));
  },
  stats(): Promise<AxiosResponse<ApiResponse<NASStats>>> {
    return nasArchiveClient.getNASArchiveStats().then((d) => ok(d));
  },
  retry(id: number): Promise<AxiosResponse<ApiResponse<{ ok: boolean }>>> {
    return nasArchiveClient.retryNASArchive(id).then((d) => ok({ ok: d.ok }));
  },
  /** Phase 3-E：迁移到 sysConfigClient.regenerateNASToken。NASConfigTab 调用方零改动。 */
  regenerateToken(): Promise<AxiosResponse<ApiResponse<NASRegenerateTokenResp>>> {
    return sysConfigClient.regenerateNASToken().then((d) => ok(d));
  },
};
