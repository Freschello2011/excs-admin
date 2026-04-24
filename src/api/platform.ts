import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  AuditAppOpsResp,
  AuditAuthzResp,
  AuditSummaryDTO,
  AiInteractionDTO,
  BusinessPeriod,
  BusinessTodosResp,
  CostTrendDTO,
  PlatformDashboardResp,
  RunningStatsDTO,
  StorageCapacityDTO,
} from '@/types/platform';

/**
 * 平台监控 / 业务看板 / 操作审计 三 Tab 的 9 个 HTTP 接口。
 *
 * 路由前缀：/api/v1/platform/*
 * 权限门禁（router.go）：
 *   - /platform/dashboard → platform.monitor.view
 *   - /platform/business/* → dashboard.view
 *   - /platform/audit/*    → audit.view
 */
export const platformApi = {
  /** Tab A · 聚合接口（一次返回资源 + 依赖 + 备份 + 证书） */
  getDashboard(): Promise<AxiosResponse<ApiResponse<PlatformDashboardResp>>> {
    return request.get('/api/v1/platform/dashboard');
  },

  /** Tab B · 今日待办（无 period 参数） */
  getBusinessTodos(): Promise<AxiosResponse<ApiResponse<BusinessTodosResp>>> {
    return request.get('/api/v1/platform/business/todos');
  },

  /** Tab B · 运行状态 4 卡 */
  getBusinessRunning(
    period: BusinessPeriod,
  ): Promise<AxiosResponse<ApiResponse<RunningStatsDTO>>> {
    return request.get('/api/v1/platform/business/running', { params: { period } });
  },

  /** Tab B · 存储容量 4 卡（无 period） */
  getBusinessStorage(): Promise<AxiosResponse<ApiResponse<StorageCapacityDTO>>> {
    return request.get('/api/v1/platform/business/storage');
  },

  /** Tab B · 费用 3 卡 */
  getBusinessCost(
    period: BusinessPeriod,
  ): Promise<AxiosResponse<ApiResponse<CostTrendDTO>>> {
    return request.get('/api/v1/platform/business/cost', { params: { period } });
  },

  /** Tab B · AI 互动 4 卡 */
  getBusinessAiInteraction(
    period: BusinessPeriod,
  ): Promise<AxiosResponse<ApiResponse<AiInteractionDTO>>> {
    return request.get('/api/v1/platform/business/ai-interaction', { params: { period } });
  },

  /** Tab C · 审计摘要 4 卡 */
  getAuditSummary(date?: string): Promise<AxiosResponse<ApiResponse<AuditSummaryDTO>>> {
    return request.get('/api/v1/platform/audit/summary', {
      params: date ? { date } : undefined,
    });
  },

  /** Tab C · 授权审计最近 N 条 */
  getAuditAuthz(limit = 10): Promise<AxiosResponse<ApiResponse<AuditAuthzResp>>> {
    return request.get('/api/v1/platform/audit/authz', { params: { limit } });
  },

  /** Tab C · 应用操作最近 N 条 */
  getAuditAppOps(limit = 10): Promise<AxiosResponse<ApiResponse<AuditAppOpsResp>>> {
    return request.get('/api/v1/platform/audit/app-ops', { params: { limit } });
  },
};
