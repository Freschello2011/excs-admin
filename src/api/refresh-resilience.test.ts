// @vitest-environment jsdom
/**
 * Bug 5b — refresh 失败容忍三件套覆盖
 *
 * 1) classifyRefreshError 错误分流（致命 vs 可重试）
 * 2) 退避重试 [5s,15s,45s] 调度（fake timers）
 * 3) 重试用尽后走 handleLogout（默认 dirty 阻断 / 否则真踢）
 *
 * 不打真实网络：替换 axios adapter。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AxiosAdapter } from 'axios';
import request, {
  classifyRefreshError,
  noteRefreshFailure,
  noteRefreshSuccess,
} from './request';
import { messageBus } from '@/utils/messageBus';

interface CapturedToast {
  level: string;
  content: string;
}

let toasts: CapturedToast[] = [];
let unsubscribe: (() => void) | null = null;

beforeEach(() => {
  toasts = [];
  unsubscribe = messageBus.on((p) => toasts.push({ level: p.level, content: p.content }));
  // 清零计数 + 取消挂起重试
  noteRefreshSuccess();
  // 默认有 refresh_token，后台重试可触发
  localStorage.setItem('excs-refresh-token', 'mock-refresh-token');
  localStorage.setItem('excs-access-token', 'mock-access-token');
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
  // 防止挂起 timer 跨用例影响
  noteRefreshSuccess();
  localStorage.clear();
});

function stubAdapter(impl: AxiosAdapter) {
  request.defaults.adapter = impl as unknown as typeof request.defaults.adapter;
}

describe('classifyRefreshError 错误分流', () => {
  it('401 → fatal', () => {
    expect(classifyRefreshError({ response: { status: 401 } })).toBe('fatal');
  });

  it('403 → fatal', () => {
    expect(classifyRefreshError({ response: { status: 403 } })).toBe('fatal');
  });

  it('408 timeout → retryable', () => {
    expect(classifyRefreshError({ response: { status: 408 } })).toBe('retryable');
  });

  it('500 / 502 / 503 / 504 → retryable', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyRefreshError({ response: { status } })).toBe('retryable');
    }
  });

  it('429 限流 → retryable', () => {
    expect(classifyRefreshError({ response: { status: 429 } })).toBe('retryable');
  });

  it('网络错误 ECONNABORTED → retryable', () => {
    expect(classifyRefreshError({ code: 'ECONNABORTED' })).toBe('retryable');
  });

  it('ERR_NETWORK → retryable', () => {
    expect(classifyRefreshError({ code: 'ERR_NETWORK' })).toBe('retryable');
  });

  it('业务 envelope code=1002 invalid_token → fatal', () => {
    expect(classifyRefreshError({ code: 1002 })).toBe('fatal');
  });

  it('业务 envelope code=2002 account_disabled → fatal', () => {
    expect(classifyRefreshError({ code: 2002 })).toBe('fatal');
  });

  it('未知错误（无 response / 无 code）→ retryable（保守）', () => {
    expect(classifyRefreshError({})).toBe('retryable');
    expect(classifyRefreshError(null)).toBe('retryable');
    expect(classifyRefreshError(undefined)).toBe('retryable');
  });

  it('其它 4xx（如 400 / 422）→ fatal（避免无限退避）', () => {
    expect(classifyRefreshError({ response: { status: 400 } })).toBe('fatal');
    expect(classifyRefreshError({ response: { status: 422 } })).toBe('fatal');
  });
});

describe('退避重试调度 [5s,15s,45s]', () => {
  it('1 次可重试失败 — 5s 后自动重试（成功清零）', async () => {
    vi.useFakeTimers();

    let refreshCallCount = 0;
    stubAdapter(async (config) => {
      if (config.url?.endsWith('/auth/refresh')) {
        refreshCallCount++;
        // 第 1 次退避重试成功
        return {
          data: { code: 0, data: { access_token: 'new-A', refresh_token: 'new-R' } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {},
        };
      }
      throw new Error('unexpected url');
    });

    // 模拟 1 次网络失败
    noteRefreshFailure({ code: 'ECONNABORTED' });

    // 首次失败弹一次 warning
    expect(toasts.filter((t) => t.level === 'warning')).toHaveLength(1);

    // 5s 内不应触发
    await vi.advanceTimersByTimeAsync(4_999);
    expect(refreshCallCount).toBe(0);

    // 5s 触发退避重试
    await vi.advanceTimersByTimeAsync(2);
    expect(refreshCallCount).toBe(1);

    // 等微任务排空，确认 localStorage 已更新
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem('excs-access-token')).toBe('new-A');
    expect(localStorage.getItem('excs-refresh-token')).toBe('new-R');
  });

  it('连续 3 次可重试失败 — 用尽后走真踢（access_token 被清除）', async () => {
    vi.useFakeTimers();

    let refreshCallCount = 0;
    stubAdapter(async (config) => {
      if (config.url?.endsWith('/auth/refresh')) {
        refreshCallCount++;
        // 所有退避重试都 503
        const err = Object.assign(new Error('503'), {
          isAxiosError: true,
          config,
          response: {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {},
            config,
            data: { code: 500, message: 'upstream' },
          },
        });
        throw err;
      }
      throw new Error('unexpected url');
    });

    // mock redirect (jsdom 不支持 navigation)
    const originalLocation = window.location;
    delete (window as unknown as { location?: Location }).location;
    (window as unknown as { location: Partial<Location> }).location = {
      ...originalLocation,
      href: '',
      pathname: '/devices', // 非 /shows/:id/timeline，避免 dirty 阻断
      hostname: 'excs.crossovercg.com.cn',
      origin: 'https://excs.crossovercg.com.cn',
    } as Location;

    // 第 1 次失败
    noteRefreshFailure({ response: { status: 503 } });
    expect(refreshCallCount).toBe(0);

    // 5s 触发第 2 次（来自 backoff）
    await vi.advanceTimersByTimeAsync(5_001);
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshCallCount).toBe(1);

    // 15s 后第 3 次
    await vi.advanceTimersByTimeAsync(15_001);
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshCallCount).toBe(2);

    // 45s 后第 4 次 — 但 recordRefreshFailure 已在第 3 次计数后走 logout，无第 4 次重试
    // 修正：MAX_REFRESH_RETRIES=3 = 第 3 次失败触发 logout（refreshCallCount 达到 2 是因为第 1 次手动调用不算 HTTP 调用，所以退避调用共 2 次）
    // 等第 3 次退避失败后 recordRefreshFailure 触发 hard logout
    await vi.advanceTimersByTimeAsync(45_001);
    await vi.advanceTimersByTimeAsync(0);

    // access_token 被清空 = 走完真踢
    expect(localStorage.getItem('excs-access-token')).toBeNull();
    expect(localStorage.getItem('excs-refresh-token')).toBeNull();

    // 恢复 location
    (window as unknown as { location: Location }).location = originalLocation;
  });

  it('致命错误（401）— 无退避重试，立即强踢', async () => {
    vi.useFakeTimers();

    let refreshCallCount = 0;
    stubAdapter(async (config) => {
      if (config.url?.endsWith('/auth/refresh')) {
        refreshCallCount++;
        return {
          data: { code: 0, data: { access_token: 'new', refresh_token: 'new' } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {},
        };
      }
      throw new Error('unexpected url');
    });

    const originalLocation = window.location;
    delete (window as unknown as { location?: Location }).location;
    (window as unknown as { location: Partial<Location> }).location = {
      ...originalLocation,
      href: '',
      pathname: '/devices',
      hostname: 'excs.crossovercg.com.cn',
      origin: 'https://excs.crossovercg.com.cn',
    } as Location;

    noteRefreshFailure({ response: { status: 401 } });

    // 致命 → 不调度重试
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refreshCallCount).toBe(0);

    // access_token 已清空（force logout）
    expect(localStorage.getItem('excs-access-token')).toBeNull();
    expect(localStorage.getItem('excs-refresh-token')).toBeNull();

    (window as unknown as { location: Location }).location = originalLocation;
  });

  it('1 次失败 + noteRefreshSuccess 清零 — 取消挂起重试', async () => {
    vi.useFakeTimers();

    let refreshCallCount = 0;
    stubAdapter(async (config) => {
      if (config.url?.endsWith('/auth/refresh')) {
        refreshCallCount++;
        return {
          data: { code: 0, data: { access_token: 'A', refresh_token: 'R' } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {},
        };
      }
      throw new Error('unexpected url');
    });

    noteRefreshFailure({ code: 'ECONNABORTED' });
    // 模拟 2s 后 authStore 主动续期成功
    await vi.advanceTimersByTimeAsync(2_000);
    noteRefreshSuccess();

    // 等过 5s 退避窗口 — 因为已 noteRefreshSuccess 清零 + 取消 timer，不应再触发
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refreshCallCount).toBe(0);
  });
});

describe('dirty 阻断（timeline 草稿）', () => {
  it('退避用尽 + timeline 草稿残留 → 弹 Modal 阻断硬踢（access_token 仍保留）', async () => {
    vi.useFakeTimers();

    // 注入 timeline 草稿
    localStorage.setItem('excs.timeline.draft.show.1', JSON.stringify({ dirty: true }));

    const blockedEvents: Event[] = [];
    const handler = (e: Event) => blockedEvents.push(e);
    window.addEventListener('excs:logout-blocked', handler);

    stubAdapter(async (config) => {
      if (config.url?.endsWith('/auth/refresh')) {
        const err = Object.assign(new Error('503'), {
          isAxiosError: true,
          config,
          response: { status: 503, statusText: 'Service Unavailable', headers: {}, config, data: {} },
        });
        throw err;
      }
      throw new Error('unexpected url');
    });

    noteRefreshFailure({ response: { status: 503 } });
    await vi.advanceTimersByTimeAsync(5_001);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_001);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(45_001);
    await vi.advanceTimersByTimeAsync(0);

    // 应触发 dirty 阻断事件
    expect(blockedEvents.length).toBeGreaterThanOrEqual(1);
    // access_token 仍未被清空（用户先看 Modal）
    expect(localStorage.getItem('excs-access-token')).toBe('mock-access-token');

    window.removeEventListener('excs:logout-blocked', handler);
    localStorage.removeItem('excs.timeline.draft.show.1');
  });
});
