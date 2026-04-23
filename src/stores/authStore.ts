import { create } from 'zustand';
import { authApi } from '@/api/auth';
import { redirectToSSO } from '@/api/request';
import type { ApiResponse } from '@/types/api';
import type { LoginUser, LoginResponse } from '@/types/auth';
import type { UserActionSet } from '@/types/authz';

/* ==================== Types ==================== */

interface AuthState {
  accessToken: string;
  refreshToken: string;
  user: LoginUser | null;
  /** 当前用户 action set（Phase 5b 起前端 gate 入口） */
  actionSet: UserActionSet | null;
}

interface AuthActions {
  /* Derived */
  isLoggedIn: () => boolean;
  /** 当前用户持有超管模板（wildcard @ G）→ true */
  isAdmin: () => boolean;
  userName: () => string;
  userAvatar: () => string;

  /* Actions */
  handleLoginCallback: (code: string) => Promise<void>;
  refreshAccessToken: () => Promise<string>;
  /** 拉取 /authz/me/action-set 并写入 store；登录 / 刷新 token / 切换用户后调用 */
  refreshActionSet: () => Promise<void>;
  logout: () => void;
  clearAuth: () => void;
}

type AuthStore = AuthState & AuthActions;

/* ==================== Helpers ==================== */

function unwrap<T>(axiosRes: { data: ApiResponse<T> }): ApiResponse<T> {
  return axiosRes?.data ?? (axiosRes as unknown as ApiResponse<T>);
}

function loadActionSet(): UserActionSet | null {
  try {
    const raw = localStorage.getItem('excs-action-set');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return parsed as UserActionSet;
  } catch {
    return null;
  }
}

/* ==================== Store ==================== */

export const useAuthStore = create<AuthStore>()((set, get) => ({
  /* ==================== State (initialised from localStorage) ==================== */
  accessToken: localStorage.getItem('excs-access-token') || '',
  refreshToken: localStorage.getItem('excs-refresh-token') || '',
  user: JSON.parse(localStorage.getItem('excs-user') || 'null') as LoginUser | null,
  actionSet: loadActionSet(),

  /* ==================== Derived ==================== */
  isLoggedIn: () => !!get().accessToken,
  /** 超管 = 持有通配符全局授权（super_admin 模板）。
   *  actionSet 未加载时返回 false（fail-safe，由后端 403 兜底）。 */
  isAdmin: () => {
    const set = get().actionSet;
    if (!set) return false;
    return set.entries.some((e) => e.action_code === '*' && e.scope.type === 'G');
  },
  userName: () => get().user?.name || '用户',
  userAvatar: () => get().user?.avatar || '',

  /* ==================== Actions ==================== */

  handleLoginCallback: async (code: string) => {
    const redirectUri = `${window.location.origin}/login/callback`;
    const axiosRes = await authApi.loginByCode(code, redirectUri);
    const res = unwrap<LoginResponse>(axiosRes);

    if (res.code === 0) {
      const { access_token, refresh_token, user } = res.data;
      set({ accessToken: access_token, refreshToken: refresh_token, user });
      localStorage.setItem('excs-access-token', access_token);
      localStorage.setItem('excs-refresh-token', refresh_token);
      localStorage.setItem('excs-user', JSON.stringify(user));

      // Store MQTT info for future use
      if (res.data.mqtt) {
        localStorage.setItem('excs-mqtt', JSON.stringify(res.data.mqtt));
      }

      // 登录后立即拉 action set；失败不阻塞登录流程（后续页面按需 fail-safe）
      try {
        await get().refreshActionSet();
      } catch {
        // swallow — axios 层已有 message 提示
      }
    } else {
      throw new Error(res.message || '登录失败');
    }
  },

  refreshAccessToken: async () => {
    const { refreshToken } = get();
    if (!refreshToken) {
      throw new Error('No refresh token');
    }
    const axiosRes = await authApi.refresh(refreshToken);
    const res = unwrap(axiosRes);
    if (res.code === 0) {
      set({
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
      });
      localStorage.setItem('excs-access-token', res.data.access_token);
      localStorage.setItem('excs-refresh-token', res.data.refresh_token);
      // 刷新 token 后异步重拉 action set（JWT 可能携带的权限信息已变）
      get().refreshActionSet().catch(() => {});
      return res.data.access_token;
    }
    throw new Error('Refresh failed');
  },

  refreshActionSet: async () => {
    const axiosRes = await authApi.getMyActionSet();
    const res = unwrap<UserActionSet>(axiosRes);
    if (res.code === 0 && res.data) {
      set({ actionSet: res.data });
      localStorage.setItem('excs-action-set', JSON.stringify(res.data));
    }
  },

  logout: () => {
    get().clearAuth();
    redirectToSSO();
  },

  clearAuth: () => {
    set({ accessToken: '', refreshToken: '', user: null, actionSet: null });
    localStorage.removeItem('excs-access-token');
    localStorage.removeItem('excs-refresh-token');
    localStorage.removeItem('excs-user');
    localStorage.removeItem('excs-mqtt');
    localStorage.removeItem('excs-action-set');
  },
}));
