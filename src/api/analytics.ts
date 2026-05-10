/**
 * Phase 3-D：analyticsApi 重写为 AxiosResponse 兼容壳，代理到 analyticsClient（src/api/gen/client.ts）。
 *
 * 设计：保留 AxiosResponse<ApiResponse<T>> 返回形状，让 react-query 老调用方
 * （`select: (res) => res.data.data`）零改动。新代码请直接用 analyticsClient（unwrap 后返回 .data）。
 */
import type { AxiosResponse } from 'axios';
import {
  analyticsClient,
  type UsageOverviewDTO,
  type UsageOverviewParams,
  type PlaybackDailyStat,
  type DateRangeStatsParams,
  type OperationDailyStat,
  type AiStatsDTO,
  type AiStatsParams,
  type OssBrowserResult,
  type OssBrowserParams,
  type PlatformOSSStatsResult,
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

export const analyticsApi = {
  getUsageOverview(
    params: UsageOverviewParams,
  ): Promise<AxiosResponse<ApiResponse<UsageOverviewDTO>>> {
    return analyticsClient.getAnalyticsUsageOverview(params).then((d) => ok(d));
  },
  getPlaybackStats(
    params: DateRangeStatsParams,
  ): Promise<AxiosResponse<ApiResponse<PlaybackDailyStat[]>>> {
    return analyticsClient.getAnalyticsPlaybackStats(params).then((d) => ok(d));
  },
  getOperationStats(
    params: DateRangeStatsParams,
  ): Promise<AxiosResponse<ApiResponse<OperationDailyStat[]>>> {
    return analyticsClient.getAnalyticsOperationStats(params).then((d) => ok(d));
  },
  getAiStats(params: AiStatsParams): Promise<AxiosResponse<ApiResponse<AiStatsDTO>>> {
    return analyticsClient.getAnalyticsAiStats(params).then((d) => ok(d));
  },
  browseOSS(params: OssBrowserParams): Promise<AxiosResponse<ApiResponse<OssBrowserResult>>> {
    return analyticsClient.getAnalyticsOssBrowser(params).then((d) => ok(d));
  },
  // ADR-0001 + ADR-0027：平台公共桶聚合
  getPlatformOssStats(): Promise<AxiosResponse<ApiResponse<PlatformOSSStatsResult>>> {
    return analyticsClient.getAnalyticsOssStatsPlatform().then((d) => ok(d));
  },
};
