import { create } from 'zustand';
import { authApi } from '@/api/auth';
import { redirectToSSO } from '@/api/request';
import type { ApiResponse } from '@/types/api';
import type { LoginUser, LoginResponse } from '@/types/auth';

/* ==================== Types ==================== */

interface AuthState {
  accessToken: string;
  refreshToken: string;
  user: LoginUser | null;
}

interface AuthActions {
  /* Derived */
  isLoggedIn: () => boolean;
  isAdmin: () => boolean;
  userName: () => string;
  userAvatar: () => string;
  hasHallPermission: (hallId: number, permission: string) => boolean;

  /* Actions */
  handleLoginCallback: (code: string) => Promise<void>;
  refreshAccessToken: () => Promise<string>;
  logout: () => void;
  clearAuth: () => void;
}

type AuthStore = AuthState & AuthActions;

/* ==================== Helpers ==================== */

function unwrap<T>(axiosRes: { data: ApiResponse<T> }): ApiResponse<T> {
  return axiosRes?.data ?? (axiosRes as unknown as ApiResponse<T>);
}

/* ==================== Store ==================== */

export const useAuthStore = create<AuthStore>()((set, get) => ({
  /* ==================== State (initialised from localStorage) ==================== */
  accessToken: localStorage.getItem('excs-access-token') || '',
  refreshToken: localStorage.getItem('excs-refresh-token') || '',
  user: JSON.parse(localStorage.getItem('excs-user') || 'null') as LoginUser | null,

  /* ==================== Derived ==================== */
  isLoggedIn: () => !!get().accessToken,
  isAdmin: () => get().user?.role === 'admin',
  userName: () => get().user?.name || '用户',
  userAvatar: () => get().user?.avatar || '',

  hasHallPermission: (hallId: number, permission: string) => {
    const { user } = get();
    if (!user) return false;
    if (user.role === 'admin') return true;
    const hp = user.hall_permissions?.find((p) => p.hall_id === hallId);
    return hp?.permissions.includes(permission) ?? false;
  },

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
      return res.data.access_token;
    }
    throw new Error('Refresh failed');
  },

  logout: () => {
    get().clearAuth();
    redirectToSSO();
  },

  clearAuth: () => {
    set({ accessToken: '', refreshToken: '', user: null });
    localStorage.removeItem('excs-access-token');
    localStorage.removeItem('excs-refresh-token');
    localStorage.removeItem('excs-user');
    localStorage.removeItem('excs-mqtt');
  },
}));
