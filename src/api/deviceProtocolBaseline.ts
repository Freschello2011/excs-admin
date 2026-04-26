/**
 * Phase 3-E：deviceProtocolBaselineApi 重写为 AxiosResponse 兼容壳，代理到 deviceCatalogClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。
 */
import type { AxiosResponse } from 'axios';
import {
  deviceCatalogClient,
  type ProtocolBaselineDetailDTO,
  type ProtocolBaselineListItemDTO,
  type UpdateProtocolBaselineBody,
} from './gen/client';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
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

export const deviceProtocolBaselineApi = {
  /** 列出设备协议基线 */
  list(): Promise<AxiosResponse<ApiResponse<ProtocolBaselineListItemDTO[]>>> {
    return deviceCatalogClient.listProtocolBaselines().then((d) => ok(d));
  },

  /** 协议基线详情 */
  get(protocol: string): Promise<AxiosResponse<ApiResponse<ProtocolBaselineDetailDTO>>> {
    return deviceCatalogClient.getProtocolBaseline(protocol).then((d) => ok(d));
  },

  /** 更新协议基线（admin only，极少使用） */
  update(
    protocol: string,
    data: UpdateProtocolBaselineBody,
  ): Promise<AxiosResponse<ApiResponse<ProtocolBaselineDetailDTO>>> {
    return deviceCatalogClient.updateProtocolBaseline(protocol, data).then((d) => ok(d));
  },
};
