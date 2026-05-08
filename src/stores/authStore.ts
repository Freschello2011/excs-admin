import { create } from 'zustand';
import { authClient, type LoginUser } from '@/api/gen/client';
import { authzApi } from '@/api/authz';
import { noteRefreshSuccess, noteRefreshFailure, forceLogout } from '@/api/request';
import type { UserActionSet } from '@/api/gen/client';

export type { LoginUser };

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
  /** Phase 11.9：部分字段更新 user（用于 ForceChangePasswordModal 改密成功后清 must_change_pwd） */
  setUser: (u: LoginUser) => void;
  logout: () => void;
  clearAuth: () => void;
}

type AuthStore = AuthState & AuthActions;

/* ==================== Helpers ==================== */

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
    const data = await authClient.login({ sso_code: code, redirect_uri: redirectUri });

    const { access_token, refresh_token, user } = data;
    set({ accessToken: access_token, refreshToken: refresh_token, user });
    localStorage.setItem('excs-access-token', access_token);
    localStorage.setItem('excs-refresh-token', refresh_token);
    localStorage.setItem('excs-user', JSON.stringify(user));
    // ADR-0022：login 不再下发 mqtt（MQTT 凭据由 /control-app/pair 唯一下发）；前端不再缓存 excs-mqtt

    // 登录后立即拉 action set；失败不阻塞登录流程（后续页面按需 fail-safe）
    try {
      await get().refreshActionSet();
    } catch {
      // swallow — axios 层已有 message 提示
    }
  },

  refreshAccessToken: async () => {
    const { refreshToken } = get();
    if (!refreshToken) {
      throw new Error('No refresh token');
    }
    try {
      const data = await authClient.refreshToken({ refresh_token: refreshToken });
      set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      localStorage.setItem('excs-access-token', data.access_token);
      localStorage.setItem('excs-refresh-token', data.refresh_token);
      // Bug 5b：主动续期成功 → 通知 request.ts 清零失败计数
      noteRefreshSuccess();
      // 刷新 token 后异步重拉 action set（JWT 可能携带的权限信息已变）
      get().refreshActionSet().catch(() => {});
      return data.access_token;
    } catch (err) {
      // Bug 5b：主动续期失败 — 累加 request.ts 失败计数（与 axios 1002 路径共享阈值）
      noteRefreshFailure();
      throw err;
    }
  },

  refreshActionSet: async () => {
    const axiosRes = await authzApi.getMyActionSet();
    const res = axiosRes.data;
    if (res.code === 0 && res.data) {
      set({ actionSet: res.data });
      localStorage.setItem('excs-action-set', JSON.stringify(res.data));
    }
  },

  setUser: (u: LoginUser) => {
    set({ user: u });
    localStorage.setItem('excs-user', JSON.stringify(u));
  },

  logout: () => {
    get().clearAuth();
    // Bug 5b：用户主动 logout 走 forceLogout（绕过容忍 / dirty 阻断；它内部会清 token + redirectToSSO）
    forceLogout();
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

/* ==================== 跨 Tab 同步（Phase 6.7） ====================
 * 另一个 Tab 给当前用户授权后，会更新 localStorage 的 excs-action-set；
 * 浏览器向其他 Tab 派发 storage 事件，这里监听后把新值灌回 store，
 * 让侧栏 / <Can> 即时反应。同 Tab 的变更不会触发 storage 事件，
 * 所以这段逻辑只覆盖"跨 Tab"场景。
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'excs-action-set' || e.storageArea !== localStorage) return;
    try {
      if (!e.newValue || e.newValue === 'null') {
        useAuthStore.setState({ actionSet: null });
        return;
      }
      const parsed = JSON.parse(e.newValue);
      if (parsed && Array.isArray(parsed.entries)) {
        useAuthStore.setState({ actionSet: parsed });
      }
    } catch {
      // swallow：解析失败不干扰当前 Tab
    }
  });
}

/* ==================== Bug 5b：主动 token 续期调度器 ==================== *
 * prod access_token_ttl=2h；admin 此前完全依赖 axios interceptor 命中 1002 被动刷新，
 * 用户长时间停留编辑器（无请求）时，token 自然过期 / perm_ver bump 后下次后台请求
 * 命中 1002 + 网络抖动单次失败 → 直接被踢回 SSO（Bug 5b 现场症状）。
 *
 * 修法：
 *   1. 启动后每 25 min（access_ttl 的 ~20%）调一次 refreshAccessToken
 *   2. 浏览器 tab 重新可见时，若距上次刷新 > 25min 立即补刷
 *   3. refreshAccessToken 失败不立即 logout，由 request.ts 的 noteRefreshFailure
 *      累加计数；连续 RAW_LOGOUT_THRESHOLD=2 次失败才硬踢
 *   4. 仅在已登录（accessToken 存在）时启动定时器；登录回调 / 跨 tab token 写入
 *      时重启定时器以恢复时序
 */
const PROACTIVE_REFRESH_INTERVAL_MS = 25 * 60 * 1000;
let proactiveTimer: ReturnType<typeof setInterval> | null = null;
let lastProactiveRefreshAt = 0;

function stopProactiveRefresh(): void {
  if (proactiveTimer !== null) {
    clearInterval(proactiveTimer);
    proactiveTimer = null;
  }
}

function startProactiveRefresh(): void {
  stopProactiveRefresh();
  proactiveTimer = setInterval(() => {
    runProactiveRefresh();
  }, PROACTIVE_REFRESH_INTERVAL_MS);
}

async function runProactiveRefresh(): Promise<void> {
  const { accessToken, refreshToken, refreshAccessToken } = useAuthStore.getState();
  if (!accessToken || !refreshToken) return;
  // 防抖：visibilitychange 路径下 1 分钟内不重复刷
  if (Date.now() - lastProactiveRefreshAt < 60_000) return;
  try {
    await refreshAccessToken();
    lastProactiveRefreshAt = Date.now();
  } catch {
    // 失败已 noteRefreshFailure；不在此处 logout（容忍单次失败由 request.ts 守门）
  }
}

if (typeof window !== 'undefined') {
  // 登录态变化（从无 token → 有 token）时启动；登出时停止
  let prevLoggedIn = !!useAuthStore.getState().accessToken;
  if (prevLoggedIn) {
    startProactiveRefresh();
    lastProactiveRefreshAt = Date.now();
  }
  useAuthStore.subscribe((state) => {
    const nowLoggedIn = !!state.accessToken;
    if (nowLoggedIn && !prevLoggedIn) {
      lastProactiveRefreshAt = Date.now();
      startProactiveRefresh();
    } else if (!nowLoggedIn && prevLoggedIn) {
      stopProactiveRefresh();
    }
    prevLoggedIn = nowLoggedIn;
  });

  // 切回前台时若距上次刷新 > 25min 补刷一次
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!useAuthStore.getState().accessToken) return;
    if (Date.now() - lastProactiveRefreshAt > PROACTIVE_REFRESH_INTERVAL_MS) {
      void runProactiveRefresh();
    }
  });
}
