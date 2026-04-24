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

/** Permission decision（嵌在 ExplainResult.decision 里） */
export interface PermissionDecision {
  allow: boolean;
  reason: string;
  source?: GrantRef;
}

/** Explain 响应（GET /authz/explain，后端 ExplanationResult） */
export interface ExplainResult {
  decision: PermissionDecision;
  /** Allow=true 时生效的授权记录（部分字段） */
  matched_grant?: {
    id: number;
    user_id: number;
    role_template_id: number;
    scope_type: ScopeType;
    scope_id: string;
    status: string;
    expires_at?: string;
    reason?: string;
  };
  /** Deny 时：友好原因文案 */
  suggestion?: string;
  /** Deny 时：建议申请途径 */
  apply_path?: string;
}

/* ==================== Phase 6：权限管理后台 ==================== */

/** 风险等级 */
export type RiskLevel = 'info' | 'low' | 'medium' | 'high' | 'critical';

/** 账号类型（DDD §6.4 过期策略用） */
export type AccountType = 'internal' | 'vendor' | 'customer';

/** 授权状态 */
export type GrantStatusType = 'active' | 'expired' | 'revoked';

/** 角色模板状态 */
export type TemplateStatus = 'active' | 'deprecated';

/** Action 注册表条目（GET /authz/actions 的 list 项） */
export interface ActionDef {
  code: string;
  domain: string;
  name_zh: string;
  scope_types: ScopeType[];
  risk: RiskLevel;
  covered_apis: string[];
  require_reason?: boolean;
  require_confirm?: boolean;
}

/** Action 列表响应 */
export interface ActionListResponse {
  total: number;
  list: ActionDef[];
}

/** 角色模板（后端 RoleTemplate entity，action_codes JSON 自动还原为 string[]） */
export interface RoleTemplate {
  id: number;
  code: string;
  name_zh: string;
  description?: string;
  is_builtin: boolean;
  has_critical: boolean;
  action_codes: string[];
  parent_template_id?: number;
  version: number;
  status: TemplateStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** 授权记录（后端 Grant entity） */
export interface Grant {
  id: number;
  user_id: number;
  role_template_id: number;
  role_template_version: number;
  scope_type: ScopeType;
  scope_id: string;
  excludes?: ResourceRef[] | null;
  status: GrantStatusType;
  granted_by: number;
  granted_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  revoked_by?: number | null;
  reason?: string;
  created_at: string;
  updated_at: string;
}

/** 用户视角授权视图 */
export interface UserAuthzView {
  user_id: number;
  grants: Grant[];
  action_set?: UserActionSet;
}

/** 资源视角授权视图 */
export interface ResourceAuthzView {
  resource_type: string;
  resource_id: string;
  direct_grants: Grant[];
}

/** 创建模板请求体 */
export interface CreateRoleTemplateBody {
  code: string;
  name_zh: string;
  description?: string;
  action_codes: string[];
}

/** 更新模板请求体（code 不可变） */
export interface UpdateRoleTemplateBody {
  name_zh: string;
  description?: string;
  action_codes: string[];
}

/** 复制模板请求体 */
export interface CopyRoleTemplateBody {
  new_code: string;
  new_name: string;
}

/** 创建授权请求体 */
export interface CreateGrantBody {
  user_id: number;
  template_id: number;
  scope_type: ScopeType;
  scope_id: string;
  excludes?: ResourceRef[];
  expires_at?: string | null;
  reason?: string;
}

/** 撤销授权请求体（body 可选） */
export interface RevokeGrantBody {
  reason?: string;
}

/** 续期授权请求体 */
export interface ExtendGrantBody {
  new_expires_at: string;
}

/** 授权列表 query */
export interface ListGrantsQuery {
  user_id?: number;
  scope_type?: ScopeType;
  scope_id?: string;
  include_inactive?: boolean;
}

/* ==================== Phase 8：供应商管理 ==================== */

/** 供应商状态 */
export type VendorStatus = 'active' | 'suspended' | 'archived';

/** 供应商（与 02-server/internal/domain/authz.Vendor 对齐；default_hall_scope 后端是 JSON，前端当 number[]） */
export interface Vendor {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  primary_user_id: number;
  status: VendorStatus;
  default_hall_scope?: number[] | null;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  grant_expires_at: string;
  notes?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** 供应商下一条账号（members 接口返回项） */
export interface VendorMember {
  user_id: number;
  name: string;
  email?: string;
  phone?: string;
  is_primary: boolean;
  suspended: boolean;
}

/** GET /authz/vendors/:id 响应（vendor + members 合并视图） */
export interface VendorDetailResponse {
  vendor: Vendor;
  members: VendorMember[];
}

/** 创建供应商请求体 */
export interface CreateVendorBody {
  code: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  default_hall_scope?: number[];
  grant_expires_at?: string;
  notes?: string;
}

/** 更新供应商请求体（partial） */
export interface UpdateVendorBody {
  name?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  default_hall_scope?: number[];
  notes?: string;
}

/** 邀请子账号请求体 */
export interface InviteMemberBody {
  name: string;
  phone: string;
  email?: string;
}

/** 邀请 token 返回（AcceptInvitePage 用；字段做了脱敏） */
export interface InviteInfo {
  sso_user_id: number;
  excs_user_id: number;
  vendor_id: number;
  nickname: string;
  phone: string; // 脱敏
  email: string; // 脱敏
  is_primary: boolean;
  has_initial_password: boolean;
  created_at: number; // unix seconds
}
