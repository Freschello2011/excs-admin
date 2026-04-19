import axios, {
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { messageBus } from '@/utils/messageBus';

const emitError = (content: string) => messageBus.emit({ level: 'error', content });

/* ==================== Custom Config Extension ==================== */
declare module 'axios' {
  interface AxiosRequestConfig {
    /** 设为 true 时，响应拦截器不弹 message.error */
    skipErrorMessage?: boolean;
  }
}

/* ==================== Error Code Messages ==================== */
const ERROR_MESSAGES: Record<number, string> = {
  1001: '参数无效',
  1002: '登录已过期，请重新登录',
  1003: '您没有权限执行此操作',
  1004: '请求的资源不存在',
  1005: '请求过于频繁，请稍后重试',
  2001: 'SSO 授权码无效或已过期',
  2002: '账户已禁用，请联系管理员',
};

/* ==================== Create Axios Instance ==================== */
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* ==================== Token Refresh Logic ==================== */
let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

function onTokenRefreshed(newToken: string): void {
  pendingRequests.forEach((cb) => cb(newToken));
  pendingRequests = [];
}

function addPendingRequest(cb: (token: string) => void): void {
  pendingRequests.push(cb);
}

/* ==================== Request Interceptor ==================== */
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('excs-access-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/* ==================== Response Interceptor ==================== */
request.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data;

    // Successful response
    if (res.code === 0) {
      return response;
    }

    // Handle token expired — attempt refresh
    if (res.code === 1002) {
      const originalConfig = response.config;

      // Prevent infinite loop on refresh endpoint
      if (originalConfig.url?.includes('/auth/refresh')) {
        handleLogout();
        return Promise.reject(res);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        const refreshToken = localStorage.getItem('excs-refresh-token');

        if (!refreshToken) {
          handleLogout();
          return Promise.reject(res);
        }

        return request
          .post('/api/v1/auth/refresh', { refresh_token: refreshToken })
          .then((refreshRes) => {
            const refreshData = refreshRes.data;
            if (refreshData.code === 0) {
              const { access_token, refresh_token } = refreshData.data;
              localStorage.setItem('excs-access-token', access_token);
              localStorage.setItem('excs-refresh-token', refresh_token);
              onTokenRefreshed(access_token);

              // Retry original request
              originalConfig.headers.Authorization = `Bearer ${access_token}`;
              return request(originalConfig);
            } else {
              handleLogout();
              return Promise.reject(refreshData);
            }
          })
          .catch((err) => {
            handleLogout();
            return Promise.reject(err);
          })
          .finally(() => {
            isRefreshing = false;
          });
      } else {
        // Queue the request until token is refreshed
        return new Promise<AxiosResponse>((resolve) => {
          addPendingRequest((newToken: string) => {
            originalConfig.headers.Authorization = `Bearer ${newToken}`;
            resolve(request(originalConfig));
          });
        });
      }
    }

    // General error: show message and still return full response
    if (!response.config.skipErrorMessage) {
      const msg = res.message || ERROR_MESSAGES[res.code as number] || '请求出错';
      emitError(msg);
    }
    return response;
  },
  (error) => {
    // Network or server errors
    if (error.response) {
      const status = error.response.status as number;
      const resData = error.response.data;

      const silent = error.config?.skipErrorMessage;

      // If the backend returned a structured JSON error, prefer its message
      if (resData && typeof resData === 'object' && resData.code && resData.message) {
        if (status === 401 && resData.code === 1002) {
          handleLogout();
        } else if (!silent) {
          const msg = resData.message || ERROR_MESSAGES[resData.code as number] || '请求出错';
          emitError(msg);
        }
        return Promise.reject(error);
      }

      // Fallback to generic HTTP status messages
      if (status === 401) {
        handleLogout();
      } else if (!silent) {
        if (status === 403) {
          emitError('没有权限访问');
        } else if (status === 404) {
          emitError('接口不存在');
        } else if (status === 500) {
          emitError('服务器内部错误');
        } else {
          emitError(`请求失败 (${status})`);
        }
      }
    } else if (error.code === 'ECONNABORTED') {
      emitError('请求超时，请检查网络');
    } else {
      emitError('网络异常，请检查连接');
    }
    return Promise.reject(error);
  },
);

function handleLogout(): void {
  localStorage.removeItem('excs-access-token');
  localStorage.removeItem('excs-refresh-token');
  localStorage.removeItem('excs-user');

  // Only redirect if not already on login callback
  if (!window.location.pathname.startsWith('/login')) {
    // Redirect to SSO login
    redirectToSSO();
  }
}

/** 根据当前访问域名选择对应的 SSO 域名 */
function getSSOHost(): string {
  const host = window.location.hostname;
  if (host.endsWith('.cocg.cn')) return 'sso.cocg.cn';
  return 'sso.crossovercg.com.cn';
}

/** Build SSO authorize URL and redirect. prompt='login' forces SSO to show the login form. */
export function redirectToSSO(options?: { prompt?: string }): void {
  const clientId = 'bc559a156ef9b606018f9f350e711712';
  const redirectUri = encodeURIComponent(`${window.location.origin}/login/callback`);
  const state = Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem('excs-oauth-state', state);

  let url = `https://${getSSOHost()}/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20profile&state=${state}`;
  if (options?.prompt) {
    url += `&prompt=${encodeURIComponent(options.prompt)}`;
  }
  window.location.href = url;
}

export default request;
