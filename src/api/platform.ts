// Phase 3-G：platform 9 端点全部走 OpenAPI typed client。
//
// `platformApi.*` 保留 AxiosResponse<ApiResponse<T>> 形态——react-query 调用方零改动。
// 新调用方应直接用 `import { platformClient } from '@/api/gen/client'`。

import type { AxiosResponse } from 'axios';
import type { ApiResponse } from '@/types/api';
import {
  platformClient,
  type AiInteractionDTO,
  type AuditAppOpsResp,
  type AuditAuthzResp,
  type AuditSummaryDTO,
  type BusinessPeriod,
  type BusinessTodosResp,
  type CostTrendDTO,
  type PlatformDashboardResp,
  type RunningStatsDTO,
  type StorageCapacityDTO,
} from './gen/client';

function envelope<T>(data: T): AxiosResponse<ApiResponse<T>> {
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {} as never,
    config: {} as never,
  } as AxiosResponse<ApiResponse<T>>;
}

export const platformApi = {
  getDashboard(): Promise<AxiosResponse<ApiResponse<PlatformDashboardResp>>> {
    return platformClient.getDashboard().then(envelope);
  },
  getBusinessTodos(): Promise<AxiosResponse<ApiResponse<BusinessTodosResp>>> {
    return platformClient.getBusinessTodos().then(envelope);
  },
  getBusinessRunning(
    period: BusinessPeriod,
  ): Promise<AxiosResponse<ApiResponse<RunningStatsDTO>>> {
    return platformClient.getBusinessRunning(period).then(envelope);
  },
  getBusinessStorage(): Promise<AxiosResponse<ApiResponse<StorageCapacityDTO>>> {
    return platformClient.getBusinessStorage().then(envelope);
  },
  getBusinessCost(period: BusinessPeriod): Promise<AxiosResponse<ApiResponse<CostTrendDTO>>> {
    return platformClient.getBusinessCost(period).then(envelope);
  },
  getBusinessAiInteraction(
    period: BusinessPeriod,
  ): Promise<AxiosResponse<ApiResponse<AiInteractionDTO>>> {
    return platformClient.getBusinessAiInteraction(period).then(envelope);
  },
  getAuditSummary(date?: string): Promise<AxiosResponse<ApiResponse<AuditSummaryDTO>>> {
    return platformClient.getAuditSummary(date).then(envelope);
  },
  getAuditAuthz(limit = 10): Promise<AxiosResponse<ApiResponse<AuditAuthzResp>>> {
    return platformClient.getAuditAuthz(limit).then(envelope);
  },
  getAuditAppOps(limit = 10): Promise<AxiosResponse<ApiResponse<AuditAppOpsResp>>> {
    return platformClient.getAuditAppOps(limit).then(envelope);
  },
};
