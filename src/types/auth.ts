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

/** User detail (admin view) */
export interface UserDetail {
  id: number;
  sso_user_id: number;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: string;
  user_type: string;
  status: string;
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
