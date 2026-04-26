/**
 * Phase 3-E：sysConfigApi 重写为 AxiosResponse 兼容壳，代理到 sysConfigClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。
 */
import type { AxiosResponse } from 'axios';
import {
  sysConfigClient,
  type BrandingInfo,
  type ConfigGroupData,
  type GroupInfo,
  type UploadLogoResponse,
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

export const sysConfigApi = {
  /** 公开接口：品牌信息 */
  getBranding(): Promise<AxiosResponse<ApiResponse<BrandingInfo>>> {
    return sysConfigClient.getBranding().then((d) => ok(d));
  },
  /** 获取所有配置分组 */
  getGroups(): Promise<AxiosResponse<ApiResponse<GroupInfo[]>>> {
    return sysConfigClient.listSysConfigGroups().then((d) => ok(d));
  },
  /** 获取指定分组的配置 */
  getGroupConfigs(group: string): Promise<AxiosResponse<ApiResponse<ConfigGroupData>>> {
    return sysConfigClient.getSysConfigGroup(group).then((d) => ok(d));
  },
  /** 更新指定分组的配置 */
  updateGroupConfigs(
    group: string,
    items: { key: string; value: string }[],
  ): Promise<AxiosResponse<ApiResponse<null>>> {
    return sysConfigClient.updateSysConfigGroup(group, items).then(() => ok(null));
  },
  /** 上传 Logo */
  uploadLogo(file: File): Promise<AxiosResponse<ApiResponse<UploadLogoResponse>>> {
    return sysConfigClient.uploadBrandingLogo(file).then((d) => ok(d));
  },
};
