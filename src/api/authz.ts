/**
 * Authz API 封装 —— Phase 6 权限管理后台使用。
 *
 * 与后端 02-server/internal/interfaces/api/authz_handler.go 对齐。
 * 不存在的后端端点（batch / affected-users / import-from-sso）在下方做了说明并留存前端
 * 降级策略；Phase 8 后端补齐后再回来切换实现。
 */
import type { AxiosResponse } from 'axios';
import request from './request';
import type { ApiResponse } from '@/types/api';
import type {
  RoleTemplate,
  Grant,
  CreateRoleTemplateBody,
  UpdateRoleTemplateBody,
  CopyRoleTemplateBody,
  CreateGrantBody,
  RevokeGrantBody,
  ExtendGrantBody,
  ListGrantsQuery,
  UserAuthzView,
  ResourceAuthzView,
  ActionListResponse,
  UserActionSet,
  ExplainResult,
  ResourceRef,
} from '@/types/authz';

/** 列表响应包裹（后端 gin.H{"list": ...} 规约） */
interface ListWrap<T> {
  list: T[];
}

export const authzApi = {
  /* ---------------- 角色模板 ---------------- */

  listTemplates(): Promise<AxiosResponse<ApiResponse<ListWrap<RoleTemplate>>>> {
    return request.get('/api/v1/authz/role-templates');
  },

  getTemplate(id: number): Promise<AxiosResponse<ApiResponse<RoleTemplate>>> {
    return request.get(`/api/v1/authz/role-templates/${id}`);
  },

  createTemplate(
    body: CreateRoleTemplateBody,
  ): Promise<AxiosResponse<ApiResponse<RoleTemplate>>> {
    return request.post('/api/v1/authz/role-templates', body);
  },

  updateTemplate(
    id: number,
    body: UpdateRoleTemplateBody,
  ): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return request.put(`/api/v1/authz/role-templates/${id}`, body);
  },

  deleteTemplate(id: number): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return request.delete(`/api/v1/authz/role-templates/${id}`);
  },

  copyTemplate(
    sourceId: number,
    body: CopyRoleTemplateBody,
  ): Promise<AxiosResponse<ApiResponse<RoleTemplate>>> {
    return request.post(`/api/v1/authz/role-templates/${sourceId}/copy`, body);
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
    return request.get('/api/v1/authz/grants', { params: query });
  },

  createGrant(body: CreateGrantBody): Promise<AxiosResponse<ApiResponse<Grant>>> {
    return request.post('/api/v1/authz/grants', body);
  },

  /**
   * 批量创建：后端暂无 /grants/batch（Phase 8 可选），前端顺序调 createGrant。
   * 返回每条的成功/失败明细，供向导预览页显示进度条。
   */
  async createGrantBatch(bodies: CreateGrantBody[]): Promise<
    Array<{ body: CreateGrantBody; ok: boolean; grant?: Grant; error?: string }>
  > {
    const results: Array<{ body: CreateGrantBody; ok: boolean; grant?: Grant; error?: string }> = [];
    for (const body of bodies) {
      try {
        const res = await authzApi.createGrant(body);
        results.push({ body, ok: true, grant: res.data.data });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        results.push({ body, ok: false, error: msg });
      }
    }
    return results;
  },

  /** 撤销：后端 DELETE /grants/:id（可带 body.reason，允许空） */
  revokeGrant(
    id: number,
    body?: RevokeGrantBody,
  ): Promise<AxiosResponse<ApiResponse<{ id: number }>>> {
    return request.delete(`/api/v1/authz/grants/${id}`, { data: body ?? {} });
  },

  extendGrant(
    id: number,
    body: ExtendGrantBody,
  ): Promise<AxiosResponse<ApiResponse<{ id: number; new_expires_at: string }>>> {
    return request.post(`/api/v1/authz/grants/${id}/extend`, body);
  },

  /* ---------------- 视图 ---------------- */

  getUserAuthzView(
    userId: number,
  ): Promise<AxiosResponse<ApiResponse<UserAuthzView>>> {
    return request.get(`/api/v1/authz/users/${userId}/authz-view`);
  },

  getResourceAuthzView(
    type: string,
    id: string,
  ): Promise<AxiosResponse<ApiResponse<ResourceAuthzView>>> {
    return request.get(`/api/v1/authz/resources/${type}/${encodeURIComponent(id)}/authz-view`);
  },

  /* ---------------- 元数据 ---------------- */

  listActions(): Promise<AxiosResponse<ApiResponse<ActionListResponse>>> {
    return request.get('/api/v1/authz/actions');
  },

  /* ---------------- re-export (Phase 5b 已在 authApi) ---------------- */

  getMyActionSet(): Promise<AxiosResponse<ApiResponse<UserActionSet>>> {
    return request.get('/api/v1/authz/me/action-set');
  },

  explainPermission(
    userId: number,
    action: string,
    resource?: ResourceRef,
  ): Promise<AxiosResponse<ApiResponse<ExplainResult>>> {
    const params: Record<string, string | number> = { user_id: userId, action };
    if (resource) {
      params.resource_type = resource.type;
      params.resource_id = resource.id;
    }
    return request.get('/api/v1/authz/explain', { params });
  },
};
