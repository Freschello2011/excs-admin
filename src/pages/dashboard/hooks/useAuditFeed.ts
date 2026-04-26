import { useQueries } from '@tanstack/react-query';
import { platformApi } from '@/api/platform';
import { dashboardApi } from '@/api/dashboard';
import { queryKeys } from '@/api/queryKeys';
import type {
  AuditAppOpsResp,
  AuditAuthzResp,
  AuditSummaryDTO,
} from '@/api/gen/client';
import type { DashboardData } from '@/api/gen/client';

const AUDIT_REFRESH_MS = 3 * 60_000;

/**
 * 操作审计 Tab —— 3 min 刷新。
 * PRD §5.1。
 *
 * 返回四路独立查询：
 *  - summary：4 卡摘要
 *  - authz：授权审计面板
 *  - appOps：最近应用操作
 *  - legacy：/dashboard/stats（仅取 recent_contents，因为 PRD §4.4.4 保留）
 */
export function useAuditFeed(enabled = true, limit = 10) {
  const [summary, authz, appOps, legacy] = useQueries({
    queries: [
      {
        queryKey: queryKeys.platformAuditSummary,
        queryFn: async (): Promise<AuditSummaryDTO> => {
          const res = await platformApi.getAuditSummary();
          return res.data.data;
        },
        enabled,
        refetchInterval: AUDIT_REFRESH_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: queryKeys.platformAuditAuthz(limit),
        queryFn: async (): Promise<AuditAuthzResp> => {
          const res = await platformApi.getAuditAuthz(limit);
          return res.data.data;
        },
        enabled,
        refetchInterval: AUDIT_REFRESH_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: queryKeys.platformAuditAppOps(limit),
        queryFn: async (): Promise<AuditAppOpsResp> => {
          const res = await platformApi.getAuditAppOps(limit);
          return res.data.data;
        },
        enabled,
        refetchInterval: AUDIT_REFRESH_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: queryKeys.dashboardData,
        queryFn: async (): Promise<DashboardData> => {
          const res = await dashboardApi.getStats();
          return res.data.data;
        },
        enabled,
        refetchInterval: AUDIT_REFRESH_MS,
        refetchOnWindowFocus: false,
      },
    ],
  });

  return { summary, authz, appOps, legacy };
}
