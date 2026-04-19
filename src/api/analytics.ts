import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  UsageOverviewDTO,
  UsageOverviewParams,
  PlaybackDailyStat,
  DateRangeStatsParams,
  OperationDailyStat,
  AiStatsDTO,
  AiStatsParams,
  OssBrowserResult,
  OssBrowserParams,
} from '@/types/analytics';

export const analyticsApi = {
  /** 1. 用量概览（AI Token + OSS 存储 + 合计费用） */
  getUsageOverview(params: UsageOverviewParams): Promise<AxiosResponse<ApiResponse<UsageOverviewDTO>>> {
    return request.get('/api/v1/analytics/usage-overview', { params });
  },

  /** 2. 播放统计（按天） */
  getPlaybackStats(params: DateRangeStatsParams): Promise<AxiosResponse<ApiResponse<PlaybackDailyStat[]>>> {
    return request.get('/api/v1/analytics/playback-stats', { params });
  },

  /** 3. 操作统计（按天/类型） */
  getOperationStats(params: DateRangeStatsParams): Promise<AxiosResponse<ApiResponse<OperationDailyStat[]>>> {
    return request.get('/api/v1/analytics/operation-stats', { params });
  },

  /** 4. AI 互动统计（互动曲线 + 关键词 Top N） */
  getAiStats(params: AiStatsParams): Promise<AxiosResponse<ApiResponse<AiStatsDTO>>> {
    return request.get('/api/v1/analytics/ai-stats', { params });
  },

  /** 5. OSS 存储浏览 */
  browseOSS(params: OssBrowserParams): Promise<AxiosResponse<ApiResponse<OssBrowserResult>>> {
    return request.get('/api/v1/analytics/oss-browser', { params });
  },
};
