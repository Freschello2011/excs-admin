/** Hall-level permission assignment */
export interface HallPermission {
  hall_id: number;
  hall_name: string;
  permissions: string[];
}

/** MQTT connection info returned on login */
export interface MqttInfo {
  broker_url: string;
  username: string;
  password: string;
}

/** User info returned inside login response
 *
 * Phase 8 命名并存策略（见 steps §8.6）：
 *   - user_type 是 Phase 5b/6/7 的历史字段（employee | supplier），保留向后兼容；
 *   - account_type 是 SSO 落地后的权威字段（internal | vendor | customer），新代码优先读；
 *   - tenant_id 伴随 account_type 引入，customer 账号必填，其余可空。
 * Phase 9 vendor 模块稳定 2 周后再统一移除 user_type。
 *
 * Phase 9 补丁：
 *   - vendor_id / is_primary 在 excs_users 已落库（Phase 8 迁移）；LoginUser 同步回传，
 *     供顶栏显示公司名 + 团队成员页 gate 使用；
 *   - vendor_name 由后端 JOIN authz_vendors 得到（不入库、空字符串=vendor 已归档或 resolver 失败）。
 */
export interface LoginUser {
  id: number;
  sso_user_id: number;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: 'admin' | 'technician' | 'narrator' | 'producer';
  user_type: 'employee' | 'supplier';
  account_type?: 'internal' | 'vendor' | 'customer';
  tenant_id?: number | null;
  vendor_id?: number | null;
  vendor_name?: string;
  is_primary?: boolean;
  /** Phase 11.9：首登强制改密；/auth/me 后若为 true 前端弹 ForceChangePasswordModal */
  must_change_pwd?: boolean;
  hall_permissions: HallPermission[];
}

/**
 * resolveAccountType —— Phase 8 兼容读取：优先用 account_type，缺省时从 user_type 兜底推断。
 *   - account_type 存在且有值：直接返回
 *   - user_type === 'supplier' → 'vendor'
 *   - 其他或未登录 → 'internal'
 */
export function resolveAccountType(user: Partial<LoginUser> | null | undefined): 'internal' | 'vendor' | 'customer' {
  if (!user) return 'internal';
  if (user.account_type) return user.account_type;
  if (user.user_type === 'supplier') return 'vendor';
  return 'internal';
}

/** POST /api/v1/auth/login response data */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: LoginUser;
  mqtt: MqttInfo;
}

/** POST /api/v1/auth/refresh response data */
export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** GET /api/v1/auth/me response data — same as LoginUser */
export type MeResponse = LoginUser;

/** User list item (admin view) */
export interface UserListItem {
  id: number;
  sso_user_id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  user_type: string;
  status: string;
  hall_count: number;
  created_at: string;
  last_login_at: string;
}

/** User detail (admin view)
 *
 * v1.1（PRD §8.8）新增字段：
 *   - account_type：与 LoginUser 对齐；基本信息 Tab 画像卡 tag 渲染；
 *   - status：扩展 enum，`archived` = 软删（DDD §9.12）；
 *   - vendor_id / vendor_name / is_primary：vendor 卡片条件渲染 + 主账号星标；
 *   - must_change_pwd：首登改密 Alert；
 *   - created_by：画像卡"由谁创建"行（暂留 null，后续从 authz_audit_log 反查填充）。
 */
export interface UserDetail {
  id: number;
  sso_user_id: number;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: string;
  user_type: string;
  account_type?: 'internal' | 'vendor' | 'customer';
  status: 'active' | 'suspended' | 'archived' | 'inactive' | 'disabled' | string;
  vendor_id?: number | null;
  vendor_name?: string;
  is_primary?: boolean;
  must_change_pwd?: boolean;
  created_by?: number | null;
  hall_permissions: HallPermission[];
  created_at: string;
  last_login_at: string;
}

/** MDM 员工同步结果 */
export interface SyncMDMResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
}

/** SSO 用户搜索结果项 */
export interface SSOSearchUser {
  sso_user_id: string;
  nickname: string;
  phone: string;
  email: string;
  avatar: string;
  is_imported: boolean;
}

/** SSO 用户搜索结果 */
export interface SSOSearchResult {
  list: SSOSearchUser[];
  total: number;
  page: number;
  page_size: number;
}
