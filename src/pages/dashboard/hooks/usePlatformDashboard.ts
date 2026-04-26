import { useQuery } from '@tanstack/react-query';
import { platformApi } from '@/api/platform';
import { queryKeys } from '@/api/queryKeys';
import type { PlatformDashboardResp } from '@/api/gen/client';

/**
 * 平台监控 Tab —— 单聚合接口 60s 轮询。
 * PRD §5.1：平台监控页 60s 主动刷新。
 */
export function usePlatformDashboard(enabled = true) {
  return useQuery<PlatformDashboardResp>({
    queryKey: queryKeys.platformDashboard,
    queryFn: async () => {
      const res = await platformApi.getDashboard();
      return res.data.data;
    },
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}
