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

/** User info returned inside login response */
export interface LoginUser {
  id: number;
  sso_user_id: number;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: 'admin' | 'technician' | 'narrator' | 'producer';
  user_type: 'employee' | 'supplier';
  hall_permissions: HallPermission[];
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
