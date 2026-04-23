/**
 * Authz 类型定义
 *
 * 与后端 02-server/internal/domain/authz/value_object.go、service.go 对齐。
 * 前端 can() helper / <Can> 组件 / axios 403 拦截均消费这些类型。
 */

/** 资源 scope 类型（DDD §3.2）
 *  G: Global 全局
 *  T: Tenant 租户
 *  H: Hall 展厅
 *  E: Exhibit 展项
 *  O: Ownership 归属（按 vendor_id 匹配）
 */
export type ScopeType = 'G' | 'T' | 'H' | 'E' | 'O';

/** 资源引用（传给 can() / <Can> 的第二参） */
export interface ResourceRef {
  type: string; // 'hall' | 'exhibit' | 'device' | 'content' | 'show' | 'scene' | 'panel' | ...
  id: string;
  /** 可选：部分前端资源对象已带 hall_id / exhibit_id / vendor_id / tenant_id，
   *  供 can() 在 H/E/T/O scope 下做 fail-safe 匹配使用。 */
  hall_id?: string | number;
  exhibit_id?: string | number;
  vendor_id?: string | number;
  tenant_id?: string | number;
}

/** Scope 选择器（嵌在 UserActionEntry 里，来自 /authz/me/action-set） */
export interface ScopeSelector {
  type: ScopeType;
  id: string; // G 时为空串
  excludes?: ResourceRef[];
}

/** 授权来源（用于 "为什么能/不能" 解释器） */
export interface GrantRef {
  grant_id: number;
  template_code: string;
}

/** 用户单条 action 授权条目 */
export interface UserActionEntry {
  action_code: string; // 具体 action 或 '*'（超管）
  scope: ScopeSelector;
  source: GrantRef;
}

/** 用户 action set（GET /api/v1/authz/me/action-set 响应） */
export interface UserActionSet {
  user_id: number;
  version: string;
  entries: UserActionEntry[];
}

/** 后端 403 结构化响应体（axios interceptor 对齐） */
export type PermissionDeniedReason =
  | 'no_grants'
  | 'action_not_granted'
  | 'resource_out_of_scope'
  | 'grant_expired'
  | 'user_suspended';

export interface PermissionDeniedBody {
  error: 'permission_denied';
  action: string;
  reason: PermissionDeniedReason;
  resource?: { type: string; id: string };
  hint?: string;
}

/** Explain 响应（GET /authz/explain） */
export interface ExplainResult {
  allow: boolean;
  reason: string;
  source?: GrantRef;
  hint?: string;
}
