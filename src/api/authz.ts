// Phase 3-G：authz 全部 32 端点切到 OpenAPI typed client。
//
// `authzApi.*` 保留 AxiosResponse<ApiResponse<T>> 形态——react-query
// `select: (res) => res.data.data` / 老 `.then(res => res.data)` 调用方零改动；
// 内部全部代理到 `authzClient.*`（typed，剥 envelope）。
//
// 新调用方应直接用 `import { authzClient } from '@/api/gen/client'`。

import type { AxiosResponse } from 'axios';
import type { ApiResponse } from '@/types/api';
import {
  authzClient,
  type RoleTemplate,
  type Grant,
  type CreateRoleTemplateRequest,
  type UpdateRoleTemplateRequest,
  type CopyRoleTemplateRequest,
  type CreateGrantRequest,
  type RevokeGrantRequest,
  type ExtendGrantRequest,
  type ListGrantsQuery,
  type UserAuthzView,
  type ResourceAuthzView,
  type ActionListResponse,
  type UserActionSet,
  type ResourceRef,
  type ExplanationResult,
  type IDResult,
  type ExtendGrantResult,
  type AuditLogQueryParams,
  type AuditLogListResponse,
  type ReportCounts,
  type VendorUploadCounts,
  type GrantDistribution,
  type GrantsExpiringReport,
  type TemplateListResp,
  type GrantListResp,
} from './gen/client';

// 历史命名兼容（types/authz.ts 用 *Body）—— 不再单独 re-export，调用方应直接 import 自 client
// 但保留 type alias 让本文件方法签名继续可用。
type CreateRoleTemplateBody = CreateRoleTemplateRequest;
type UpdateRoleTemplateBody = UpdateRoleTemplateRequest;
type CopyRoleTemplateBody = CopyRoleTemplateRequest;
type CreateGrantBody = CreateGrantRequest;
type RevokeGrantBody = RevokeGrantRequest;
type ExtendGrantBody = ExtendGrantRequest;
type ExplainResult = ExplanationResult;

interface ListWrap<T> {
  list: T[];
}

function envelope<T>(data: T): AxiosResponse<ApiResponse<T>> {
  return {
    data: { code: 0, message: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {} as never,
    config: {} as never,
  } as AxiosResponse<ApiResponse<T>>;
}

export const authzApi = {
  /* ---------------- 角色模板 ---------------- */

  listTemplates(): Promise<AxiosResponse<ApiResponse<ListWrap<RoleTemplate>>>> {
    return authzClient
      .listRoleTemplates()
      .then((r: TemplateListResp) => envelope({ list: r.list }));
  },

  getTemplate(id: number): Promise<AxiosResponse<ApiResponse<RoleTemplate>>> {
    return authzClient.getRoleTemplate(id).then(envelope);
  },

  createTemplate(
    body: CreateRoleTemplateBody,
  ): Promise<AxiosResponse<ApiResponse<RoleTemplate>>> {
    return authzClient.createRoleTemplate(body).then(envelope);
  },

  updateTemplate(
    id: number,
    body: UpdateRoleTemplateBody,
  ): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return authzClient.updateRoleTemplate(id, body).then((r: IDResult) => envelope({ id: r.id }));
  },

  deleteTemplate(id: number): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return authzClient.deleteRoleTemplate(id).then((r: IDResult) => envelope({ id: r.id }));
  },

  copyTemplate(
    sourceId: number,
    body: CopyRoleTemplateBody,
  ): Promise<AxiosResponse<ApiResponse<RoleTemplate>>> {
    return authzClient.copyRoleTemplate(sourceId, body).then(envelope);
  },

  /**
   * 影响用户数：后端暂无 affected-users 端点（Phase 8 规划），
   * 前端降级：listGrants({include_inactive:false}) 本地按 role_template_id 计数。
   */
  async getAffectedUserCount(templateId: number): Promise<number> {
    const res = await authzApi.listGrants({ include_inactive: false });
    const list = res.data.data?.list ?? [];
    const users = new Set<number>();
    for (const g of list) {
      if (g.role_template_id === templateId && g.status === 'active') {
        users.add(g.user_id);
      }
    }
    return users.size;
  },

  /* ---------------- 授权 ---------------- */

  listGrants(
    query: ListGrantsQuery = {},
  ): Promise<AxiosResponse<ApiResponse<ListWrap<Grant>>>> {
    return authzClient.listGrants(query).then((r: GrantListResp) => envelope({ list: r.list }));
  },

  createGrant(body: CreateGrantBody): Promise<AxiosResponse<ApiResponse<Grant>>> {
    return authzClient.createGrant(body).then(envelope);
  },

  /**
   * 批量创建：后端暂无 /grants/batch（Phase 8 可选），前端顺序调 createGrant。
   */
  async createGrantBatch(bodies: CreateGrantBody[]): Promise<
    Array<{ body: CreateGrantBody; ok: boolean; grant?: Grant; error?: string }>
  > {
    const results: Array<{ body: CreateGrantBody; ok: boolean; grant?: Grant; error?: string }> = [];
    for (const body of bodies) {
      try {
        const grant = await authzClient.createGrant(body);
        results.push({ body, ok: true, grant });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        results.push({ body, ok: false, error: msg });
      }
    }
    return results;
  },

  revokeGrant(
    id: number,
    body?: RevokeGrantBody,
  ): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return authzClient.revokeGrant(id, body).then((r: IDResult) => envelope({ id: r.id }));
  },

  extendGrant(
    id: number,
    body: ExtendGrantBody,
  ): Promise<AxiosResponse<ApiResponse<{ id: number; new_expires_at: string }>>> {
    return authzClient
      .extendGrant(id, body)
      .then((r: ExtendGrantResult) =>
        envelope({ id: r.id, new_expires_at: r.new_expires_at as unknown as string }),
      );
  },

  /* ---------------- 视图 ---------------- */

  getUserAuthzView(userId: number): Promise<AxiosResponse<ApiResponse<UserAuthzView>>> {
    return authzClient.getUserAuthzView(userId).then(envelope);
  },

  getResourceAuthzView(
    type: string,
    id: string,
  ): Promise<AxiosResponse<ApiResponse<ResourceAuthzView>>> {
    return authzClient.getResourceAuthzView(type, id).then(envelope);
  },

  /* ---------------- 元数据 ---------------- */

  listActions(): Promise<AxiosResponse<ApiResponse<ActionListResponse>>> {
    return authzClient.listActions().then(envelope);
  },

  getMyActionSet(): Promise<AxiosResponse<ApiResponse<UserActionSet>>> {
    return authzClient.getMyActionSet().then(envelope);
  },

  explainPermission(
    userId: number,
    action: string,
    resource?: ResourceRef,
  ): Promise<AxiosResponse<ApiResponse<ExplainResult>>> {
    return authzClient.explainPermission(userId, action, resource).then(envelope);
  },

  /* ---------------- Phase 11.4：审计日志查询 / 导出 ---------------- */

  queryAuditLogs(
    params: AuditLogQueryParams,
  ): Promise<AxiosResponse<ApiResponse<AuditLogListResponse>>> {
    return authzClient.queryAuditLogs(params).then(envelope);
  },

  exportAuditLogsUrl(params: AuditLogQueryParams): string {
    return authzClient.exportAuditLogsUrl(params);
  },

  /* ---------------- Phase 11.7：合规报表 ---------------- */

  reportGrantChanges(
    days = 30,
  ): Promise<AxiosResponse<ApiResponse<ReportCounts>>> {
    return authzClient.reportGrantChanges(days).then(envelope);
  },

  reportRiskyActions(
    days = 30,
  ): Promise<AxiosResponse<ApiResponse<ReportCounts>>> {
    return authzClient.reportRiskyActions(days).then(envelope);
  },

  reportVendorUploads(
    days = 30,
  ): Promise<AxiosResponse<ApiResponse<VendorUploadCounts>>> {
    return authzClient.reportVendorUploads(days).then(envelope);
  },

  reportGrantDistribution(): Promise<AxiosResponse<ApiResponse<GrantDistribution>>> {
    return authzClient.reportGrantDistribution().then(envelope);
  },

  reportGrantsExpiring(
    days = 30,
  ): Promise<AxiosResponse<ApiResponse<GrantsExpiringReport>>> {
    return authzClient.reportGrantsExpiring(days).then(envelope);
  },
};

/* ==================== Phase 11.4 类型（保留兼容） ==================== */
// 老 AuditLogRow / DatePointInt / KeyCount / VendorUploadCounts 等已 re-export 到 client.ts；
// 这里只保留依赖 axios 形态的命名导出。

export type { AuditLogRow, DatePointInt, KeyCount } from './gen/client';

export type { ReportCounts as AuthzReportCounts } from './gen/client';

export interface GrantExpiringSummary {
  id: number;
  user_id: number;
  template_code: string;
  expires_at: string;
  scope_type: string;
  scope_id?: string;
}

export type { AuditLogQueryParams, AuditLogListResponse, GrantsExpiringReport, VendorUploadCounts, GrantDistribution } from './gen/client';
