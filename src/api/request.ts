import axios, {
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { messageBus } from '@/utils/messageBus';
import { useDirectConnect } from '@/stores/directConnectStore';
import {
  describeRequest,
  listPending,
  removePending,
  type PendingOp,
} from '@/utils/pendingWriteDB';

const emitError = (content: string) => messageBus.emit({ level: 'error', content });

/* ==================== Custom Config Extension ==================== */
declare module 'axios' {
  interface AxiosRequestConfig {
    /** 设为 true 时，响应拦截器不弹 message.error */
    skipErrorMessage?: boolean;
    /** P9-E.2 内部标记：避免 LAN path mapping 后再次进入拦截/暂存路径 */
    _directConnectMapped?: boolean;
    /** P9-E.2 内部标记：本请求由 flushPendingWrites 重放，跳过 enqueue 逻辑 */
    _isFlushingPending?: boolean;
    /** P9-E.2 内部：单次请求开始时间戳，用于 latency 采样 */
    _startTs?: number;
  }
}

const CLOUD_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/';

/* ==================== Direct-Connect path mapping (ADR-0016) ==================== */

interface PathMapResult {
  url: string;
  /** 该 url 在 LAN 模式下能否本地执行（false = 必须走云端，写操作要 enqueue） */
  lanCapable: boolean;
}

/**
 * 把云端路径翻译成 9900 /diag/* 路径。返回 null = 该路径无 LAN 等价端点。
 *
 * 覆盖端点：
 *   GET  /api/v1/v2/exhibits/:id/diag/*    →  /diag/*
 *   GET  /api/v1/v2/devices/:id/state      →  /diag/state/:id
 *   POST /api/v1/v2/scenes/:id/fire        →  /diag/scene/:id/fire
 *   POST /api/v1/v2/halls/:id/discovery/scan      →  /diag/discover
 *   GET  /api/v1/v2/halls/:id/discovery/results   →  /diag/discover/results
 */
function mapToLanPath(url: string): PathMapResult {
  // 展项 diag 全套
  let m = url.match(/^\/api\/v1\/v2\/exhibits\/\d+\/diag\/(.+)$/);
  if (m) return { url: `/diag/${m[1]}`, lanCapable: true };

  // 设备 retained state（直连读 hall_master 内存）
  m = url.match(/^\/api\/v1\/v2\/devices\/(\d+)\/state(\?.*)?$/);
  if (m) return { url: `/diag/state/${m[1]}${m[2] ?? ''}`, lanCapable: true };

  // 场景直触
  m = url.match(/^\/api\/v1\/v2\/scenes\/(\d+)\/fire$/);
  if (m) return { url: `/diag/scene/${m[1]}/fire`, lanCapable: true };

  // 扫描发现 scan
  if (/^\/api\/v1\/v2\/halls\/\d+\/discovery\/scan$/.test(url)) {
    return { url: '/diag/discover', lanCapable: true };
  }

  // 扫描发现 results（保留 query string）
  m = url.match(/^\/api\/v1\/v2\/halls\/\d+\/discovery\/results(\?.*)?$/);
  if (m) return { url: `/diag/discover/results${m[1] ?? ''}`, lanCapable: true };

  return { url, lanCapable: false };
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
function isWriteMethod(method?: string): boolean {
  return !READ_METHODS.has((method ?? 'GET').toUpperCase());
}

/* ==================== Cloud failure / latency tracker ==================== */

let cloudFailCounter = 0;
const FAIL_THRESHOLD = 3;

/** 自动回落控制：仅 cloud 模式下计数；切到 lan 后不再统计 */
function noteCloudFailure(): void {
  if (useDirectConnect.getState().mode !== 'cloud') return;
  cloudFailCounter++;
  if (cloudFailCounter >= FAIL_THRESHOLD) {
    const { lanAddress, switchToLan, setDisconnected } = useDirectConnect.getState();
    if (lanAddress) {
      cloudFailCounter = 0;
      messageBus.emit({
        level: 'warning',
        content: `云端连续 ${FAIL_THRESHOLD} 次失败，已自动切到本地直连`,
      });
      switchToLan();
    } else {
      setDisconnected('云端连续失败且未配置本地直连地址');
    }
  }
}

function noteCloudSuccess(latencyMs: number): void {
  cloudFailCounter = 0;
  if (useDirectConnect.getState().mode !== 'lan') {
    useDirectConnect.getState().setCloudLatency(latencyMs);
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

/* ==================== DRC-Phase 5：反向通道错误 kind 跳过全局 toast ==================== *
 * 这些错误由 DiagChannelBanner / 局部 notification 接管渲染（避免重复弹窗）。
 * 命中后仍 reject，并把 kind / details 挂到 error 对象上，调用方可 switch 处理。
 */
const DIAG_REVERSE_CHANNEL_KINDS = new Set([
  'app_offline',
  'cloud_unavailable',
  'invocation_timeout',
  'app_error',
]);

/* ==================== /diag/* 透传 URL 前缀豁免 ==================== *
 * 命中此前缀的 URL 是 cloud `ProxyExhibitDiag` 字节级透传展厅 App 9900 /diag/* 的响应；
 * 9900 返回裸 JSON（如 `{ok, recording}` / `{kind, details}`）不带 envelope，与 admin 全局
 * envelope 契约割裂。命中后：
 *   - 成功路径：response.data.code === undefined → 视为成功，直接 return（不进 fallback）
 *   - 错误路径：HTTP 4xx/5xx → 静默 reject（DRC kind 静默集仍优先生效；legacy masterAddrResolve
 *     `hall=N 当前无在线 master` 也走静默——错误 banner / 调用方 mutation onError 接管）
 * 不覆盖：
 *   - `/v2/halls/:id/discovery/*`（DiscoveryHandler.wrapEnvelope 已包 envelope，业务 412/503 由调
 *     用方自行 toast）
 *   - reverse channel ErrorEnvelope 上的 error.kind 静默矩阵（沿用 DIAG_REVERSE_CHANNEL_KINDS）
 */
const DIAG_PROXY_PATH_RE = /\/api\/v\d+\/v2\/exhibits\/\d+\/diag\//;
function isDiagProxyUrl(url?: string): boolean {
  return !!url && DIAG_PROXY_PATH_RE.test(url);
}

/* ==================== 403 permission_denied 文案 ==================== */
const PERMISSION_DENIED_FALLBACK: Record<string, string> = {
  no_grants: '您尚未获得任何授权，请联系管理员',
  action_not_granted: '您没有执行此操作的权限',
  resource_out_of_scope: '您对该资源没有访问权限',
  grant_expired: '授权已过期，请联系管理员续期',
  user_suspended: '您的账号已被停用，请联系管理员',
  // Phase 11.0.1：action 标了 InternalOnly，vendor account_type 被拦
  internal_only: '此操作仅限内部员工',
  // Phase 11.6：critical action 未填 reason
  reason_required: '该操作为高风险操作，必须填写操作原因',
};

/* ==================== Create Axios Instance ==================== */
const request = axios.create({
  baseURL: CLOUD_BASE_URL,
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

/** 标记同步抛出 — 用于直连模式下被暂存的写请求（response 拦截器据此跳过 emitError） */
const ENQUEUED_FLAG = Symbol('directConnectEnqueued');

request.interceptors.request.use(
  (config: InternalAxiosRequestConfig & { _startTs?: number }) => {
    const token = localStorage.getItem('excs-access-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config._startTs = Date.now();

    const dc = useDirectConnect.getState();

    // P9-E.2：LAN 模式 — baseURL 切换 + path mapping + 写操作暂存
    if (dc.mode === 'lan' && !config._directConnectMapped) {
      const url = config.url ?? '';
      const isApiCall = url.startsWith('/api/');
      // 仅对原本走云端 /api/* 的请求做 mapping；/diag/* 直接放行
      if (isApiCall) {
        const mapped = mapToLanPath(url);
        if (mapped.lanCapable) {
          // 切到 9900 baseURL + 注入 LAN token
          config.baseURL = dc.lanAddress;
          config.url = mapped.url;
          config._directConnectMapped = true;
          if (dc.lanToken) {
            config.headers['X-Diag-Token'] = dc.lanToken;
          }
        } else if (isWriteMethod(config.method) && !config._isFlushingPending) {
          // 无 LAN 等价 + 写操作：暂存到 IndexedDB，UI 立即得知"已暂存"
          const description = describeRequest(config.method ?? 'POST', url);
          void dc
            .enqueuePending({
              method: (config.method ?? 'POST').toUpperCase(),
              url,
              data: config.data,
              params: config.params,
              description,
            })
            .then(({ trimmed }) => {
              messageBus.emit({
                level: 'warning',
                content: `云端不可达，已暂存「${description}」到本地，恢复后自动同步`,
              });
              if (trimmed > 0) {
                messageBus.emit({
                  level: 'warning',
                  content: `本地暂存超过上限，已丢弃 ${trimmed} 条最老的记录`,
                });
              }
            });
          // 同步抛出 — 不发起真实请求；上层 .catch 会感知到
          const err: Error & { [ENQUEUED_FLAG]?: boolean } = new Error(
            'request enqueued: cloud unreachable in direct-connect mode',
          );
          err[ENQUEUED_FLAG] = true;
          throw err;
        } else if (isWriteMethod(config.method)) {
          // 写操作但是 flush 流程：放行（云端模式回到云端 baseURL 自然走）
        } else {
          // 无 LAN 等价的读操作（如 list devices）→ 暂时仍走云端 baseURL；
          // 实际效果：在 LAN-only 网络下会 timeout，由响应拦截器 fallback 提示
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/* ==================== Response Interceptor ==================== */
request.interceptors.response.use(
  (response: AxiosResponse) => {
    // P9-E.2：成功响应 = 网络正常，记录 latency；只在云端模式下采样
    if (
      useDirectConnect.getState().mode === 'cloud' &&
      response.config.url?.startsWith('/api/')
    ) {
      const start = (response.config as InternalAxiosRequestConfig & { _startTs?: number })
        ._startTs;
      if (start) noteCloudSuccess(Date.now() - start);
      else noteCloudSuccess(0);
    }

    const res = response.data;

    // Successful response
    if (res.code === 0) {
      return response;
    }

    // /diag/* 透传：cloud ProxyExhibitDiag 字节级透传展厅 App 9900 裸 JSON（无 envelope）。
    // 命中 URL 前缀且无 code 字段 → 视为成功，直接 return（不再走 line 318 fallback toast）。
    if (isDiagProxyUrl(response.config.url) && (res === null || typeof res !== 'object' || res.code === undefined)) {
      return response;
    }

    // Handle token expired — attempt refresh
    if (res.code === 1002) {
      const originalConfig = response.config;

      // Prevent infinite loop on refresh endpoint
      // refresh 端点自身 1002 = refresh token 已失效（>168h）— 这种是确定性失败，强踢
      if (originalConfig.url?.includes('/auth/refresh')) {
        forceLogout();
        return Promise.reject(res);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        const refreshToken = localStorage.getItem('excs-refresh-token');

        // 没有 refresh token = 已 logout 状态，强踢（无救）
        if (!refreshToken) {
          forceLogout();
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
              // Bug 5b：refresh 成功 → 清零失败计数
              noteRefreshSuccess();
              onTokenRefreshed(access_token);

              // Retry original request
              originalConfig.headers.Authorization = `Bearer ${access_token}`;
              return request(originalConfig);
            } else {
              // Bug 5b：refresh 业务失败 — 走容忍 logout（连续 2 次才硬踢）
              handleLogout();
              return Promise.reject(refreshData);
            }
          })
          .catch((err) => {
            // Bug 5b：refresh 网络/超时失败 — 走容忍 logout
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
    // P9-E.2：被 request 拦截器同步抛出的"已暂存"标记 — 不弹错（已弹 warn）
    if (error && (error as { [k: symbol]: boolean })[ENQUEUED_FLAG]) {
      return Promise.reject(error);
    }

    // P9-E.2：网络层错误（无 response）= 云端可能挂了，统计 + 自动回落
    if (!error.response && useDirectConnect.getState().mode === 'cloud') {
      noteCloudFailure();
    }

    // Network or server errors
    if (error.response) {
      const status = error.response.status as number;
      const resData = error.response.data;

      // /diag/* 透传 URL 走静默：错误由 DiagChannelBanner / 调用方 mutation onError 接管，
      // 不进全局 toast。reject 仍然抛出，DRC kind 静默集分支优先（在下方处理）。
      const silent = error.config?.skipErrorMessage || isDiagProxyUrl(error.config?.url);

      // Phase 5b：后端 authz 403 结构化响应 {error:'permission_denied', action, reason, resource?, hint?}
      if (status === 403 && resData && typeof resData === 'object' && resData.error === 'permission_denied') {
        if (!silent) {
          const reason = resData.reason as string | undefined;
          const hint = (resData.hint as string | undefined) || PERMISSION_DENIED_FALLBACK[reason || ''] || '没有权限访问';
          if (reason === 'user_suspended' || reason === 'no_grants') {
            // 大弹窗性质的硬停——这里按 emitError 展示；后续若接入 Modal 再升级
            emitError(hint);
          } else {
            emitError(hint);
          }
        }
        return Promise.reject(error);
      }

      // If the backend returned a structured JSON error, prefer its message
      if (resData && typeof resData === 'object' && resData.code && resData.message) {
        // DRC-Phase 5：反向通道 ErrorEnvelope（带 error.kind）→ 跳过全局 toast，
        // 由 DiagChannelBanner / 局部 notification 接管；同时把 kind / details 挂到
        // rejected error，调用方可 (err as any).__diagKind 分流。
        const diagKind = resData.error?.kind as string | undefined;
        if (diagKind && DIAG_REVERSE_CHANNEL_KINDS.has(diagKind)) {
          (error as Error & { __diagKind?: string; __diagDetails?: unknown }).__diagKind =
            diagKind;
          (error as Error & { __diagKind?: string; __diagDetails?: unknown }).__diagDetails =
            resData.error?.details;
          return Promise.reject(error);
        }
        // PRD-inline-command-code-autogen P3.3：409 + code=3020 = inline_commands 净减命中引用方。
        // 跳过全局 toast；调用方在 onError 里检测 __inlineCommandReferenced 弹结构化 modal。
        if (status === 409 && resData.code === 3020 && resData.data?.error_code === 'INLINE_COMMAND_REFERENCED') {
          (error as Error & { __inlineCommandReferenced?: unknown }).__inlineCommandReferenced =
            resData.data.items;
          return Promise.reject(error);
        }
        if (status === 401 && resData.code === 1002) {
          handleLogout();
        } else if (!silent) {
          const msg = resData.message || ERROR_MESSAGES[resData.code as number] || '请求出错';
          emitError(msg);
        }
        return Promise.reject(error);
      }

      // Phase 11.6：reason_required / 其它 authz 非标准错误体（{error, hint, action, ...}）
      if (resData && typeof resData === 'object' && (resData.error === 'reason_required' || resData.hint)) {
        if (!silent) {
          const hint = (resData.hint as string | undefined) || '该操作需补充原因';
          emitError(hint);
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

/* ==================== Bug 5b：refresh 失败容忍 + dirty 阻断 ==================== *
 * 单次 refresh 失败不立即踢回 SSO（典型场景：用户在编辑器停留 25-120 min 期间
 * 网络抖动 / token 因 perm_ver bump 触发 1002）。连续 RAW_LOGOUT_THRESHOLD 次失败
 * 才硬踢。
 *
 * 同时阻断含 timeline 草稿残留 / 编辑器 dirty 的硬踢（Bug 5a autosave 已落盘，
 * 但极端时序 — 用户改完立即 1002 + dirty + autosave 30s 还没到 — 仍可能丢稿）。
 *
 * authStore 主动续期成功时调 `noteRefreshSuccess` 清零计数。
 */
const RAW_LOGOUT_THRESHOLD = 2;
let refreshFailureCount = 0;
let lastLogoutAttemptAt = 0;

/** authStore 主动续期成功 / response 1002 走 refresh 成功后调用 — 清零失败计数 */
export function noteRefreshSuccess(): void {
  refreshFailureCount = 0;
}

/** authStore 主动续期失败 / response 1002 走 refresh 失败后调用 — 累加计数 */
export function noteRefreshFailure(): void {
  refreshFailureCount += 1;
}

/** 当前距上次"被阻断的 logout 尝试"是否在冷却期内（<5min）— 用于 dirty 阻断回弹 */
export function isLogoutCoolingDown(): boolean {
  return lastLogoutAttemptAt > 0 && Date.now() - lastLogoutAttemptAt < 5 * 60_000;
}

/**
 * 触发硬踢（Bug 5b 守门）。容忍单次失败 + dirty 阻断。
 * 调用方仍可主动 force=true 绕过（如 /logout 按钮）。
 */
function handleLogout(opts?: { force?: boolean }): void {
  const force = !!opts?.force;
  refreshFailureCount += 1;

  // 守门 1：连续 < THRESHOLD 次失败仅警告，不立即踢（典型网络抖动）
  if (!force && refreshFailureCount < RAW_LOGOUT_THRESHOLD) {
    lastLogoutAttemptAt = Date.now();
    messageBus.emit({
      level: 'warning',
      content: '会话刷新失败，正在重试…',
    });
    return;
  }

  // 守门 2：编辑器 dirty / 草稿残留时弹 Modal 阻断硬踢
  if (!force && shouldBlockLogoutForDraft()) {
    lastLogoutAttemptAt = Date.now();
    showDraftRetentionModal();
    return;
  }

  refreshFailureCount = 0;
  localStorage.removeItem('excs-access-token');
  localStorage.removeItem('excs-refresh-token');
  localStorage.removeItem('excs-user');

  if (!window.location.pathname.startsWith('/login')) {
    redirectToSSO();
  }
}

/**
 * 强制登出（用户主动点退出 / 真正必须重新登录）— 跳过容忍 + dirty 阻断。
 */
export function forceLogout(): void {
  handleLogout({ force: true });
}

/** 检测是否需要阻断 logout — timeline 编辑器有 dirty 草稿 / 当前 URL 是编辑器 */
function shouldBlockLogoutForDraft(): boolean {
  try {
    // 1. localStorage 残留草稿（Bug 5a 30s autosave 落盘）
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('excs.timeline.draft.')) {
        return true;
      }
    }
    // 2. 当前 URL 在 timeline 编辑器
    if (/\/shows\/\d+\/timeline/.test(window.location.pathname)) {
      return true;
    }
  } catch {
    // localStorage 异常时不阻断
  }
  return false;
}

/** 弹 Modal 让用户先导出/保存草稿，再点确认才真踢 */
function showDraftRetentionModal(): void {
  // 用 messageBus 转发给 App 顶层 Modal 渲染（避免在 request.ts 直接引入 antd Modal —
  // 那会让 request.ts 和 React 强耦合）。AppShell 监听 'logout-block' 事件后弹 Modal。
  messageBus.emit({
    level: 'warning',
    content: '会话已过期但检测到未保存的演出草稿，请先导出或保存，再手动重登。',
  });
  // 派发自定义事件，由 AppShell 顶层 Modal 接管（detail.confirm 回调真正触发硬踢）
  window.dispatchEvent(
    new CustomEvent('excs:logout-blocked', {
      detail: {
        reason: 'timeline_draft',
        confirm: () => forceLogout(),
      },
    }),
  );
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

/* ==================== Direct-Connect helpers (P9-E.2) ==================== */

export interface FlushConflict {
  op: PendingOp;
  serverError: { code?: number; message?: string; status?: number };
}

export interface FlushReport {
  succeeded: PendingOp[];
  conflicts: FlushConflict[];
  failed: { op: PendingOp; error: unknown }[];
}

/**
 * 顺序回放 pending writes 到云端。冲突（HTTP 409 / code 1006）回到 conflicts；
 * 其它错误回到 failed（保留原 op，admin 可再次重试）。succeeded 的 op 立即从 IndexedDB
 * 删除。
 */
export async function flushPendingWrites(): Promise<FlushReport> {
  const all = await listPending();
  const report: FlushReport = { succeeded: [], conflicts: [], failed: [] };
  for (const op of all) {
    try {
      const res = await request.request({
        method: op.method,
        url: op.url,
        data: op.data,
        params: op.params,
        skipErrorMessage: true,
        _isFlushingPending: true,
      });
      const body = res.data as { code?: number; message?: string };
      if (body && body.code === 0) {
        await removePending(op.id);
        report.succeeded.push(op);
      } else if (body && body.code === 1006) {
        report.conflicts.push({ op, serverError: body });
      } else {
        report.failed.push({ op, error: body });
      }
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { code?: number; message?: string } } };
      const status = e.response?.status;
      if (status === 409) {
        report.conflicts.push({ op, serverError: { ...(e.response?.data ?? {}), status } });
      } else {
        report.failed.push({ op, error: err });
      }
    }
  }
  return report;
}

/** [测试连接] 按钮 — 不走 axios 实例（避免 baseURL 抖动），直接 fetch /diag/version。 */
export async function testLanConnection(
  addr: string,
  token: string,
): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  try {
    const url = `${addr.replace(/\/+$/, '')}/diag/version`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(url, {
      headers: { 'X-Diag-Token': token, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = (await r.json().catch(() => null)) as { version?: string; data?: { version?: string } } | null;
    const version = j?.version ?? j?.data?.version ?? 'unknown';
    return { ok: true, version };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e.name === 'AbortError') return { ok: false, error: '连接超时（4s）' };
    return { ok: false, error: e.message || '网络错误' };
  }
}

export default request;
