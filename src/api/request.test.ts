/**
 * 全局响应拦截器 — /diag/* 透传契约 envelope 豁免（DRC-Phase 5+）
 *
 * 背景：cloud `ProxyExhibitDiag` 字节级透传展厅 App 9900 /diag/* 裸 JSON（无 envelope），
 * 与 admin 全局 envelope 契约割裂。修复策略 = URL 前缀豁免，把每个调用点 opt-in
 * `skipErrorMessage` 收成单点规则。本测试覆盖 4 个关键场景。
 *
 * 不打真实网络：覆盖 axios adapter 直接喂响应/错误。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AxiosAdapter } from 'axios';
import request from './request';
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
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
  vi.restoreAllMocks();
});

/** 把 axios adapter 强行替换为同步喂数据的 stub（不走真实 XHR/fetch）。 */
function stubAdapter(impl: AxiosAdapter) {
  request.defaults.adapter = impl as unknown as typeof request.defaults.adapter;
}

describe('request.ts /diag/* envelope 豁免', () => {
  it('case 1: 裸 {ok:true} bare body（无 code 字段）→ 不 toast', async () => {
    stubAdapter(async (config) => ({
      data: { ok: true, recording: false },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    }));

    const res = await request.get('/api/v1/v2/exhibits/1/diag/events/recording', {
      params: { hall_id: 3 },
    });
    expect(res.data).toEqual({ ok: true, recording: false });
    expect(toasts.filter((t) => t.level === 'error')).toEqual([]);
  });

  it('case 2: envelope 成功 {code:0,data:...}（cloud HealthStatus 200 走 envelope 也可以）→ 不 toast', async () => {
    stubAdapter(async (config) => ({
      data: { code: 0, message: 'ok', data: { ok: true } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    }));

    const res = await request.get('/api/v1/v2/exhibits/1/diag/events/recording', {
      params: { hall_id: 3 },
    });
    expect((res.data as { code: number }).code).toBe(0);
    expect(toasts.filter((t) => t.level === 'error')).toEqual([]);
  });

  it('case 3: DRC ErrorEnvelope（带 error.kind = app_offline）→ 不 toast，rejected error 上挂 __diagKind', async () => {
    const axiosError = {
      isAxiosError: true,
      message: 'Request failed with status code 503',
      config: { url: '/api/v1/v2/exhibits/1/diag/events/recording' },
      response: {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        config: { url: '/api/v1/v2/exhibits/1/diag/events/recording' },
        data: {
          code: 5001,
          message: '展厅 App 离线',
          error: { kind: 'app_offline', details: { last_heartbeat_at: '2026-05-03T10:00:00Z' } },
        },
      },
    };
    stubAdapter(async () => {
      throw axiosError;
    });

    let caught: { __diagKind?: string; __diagDetails?: unknown } | null = null;
    try {
      await request.get('/api/v1/v2/exhibits/1/diag/events/recording', {
        params: { hall_id: 3 },
      });
    } catch (e) {
      caught = e as { __diagKind?: string; __diagDetails?: unknown };
    }
    expect(caught?.__diagKind).toBe('app_offline');
    expect(caught?.__diagDetails).toEqual({ last_heartbeat_at: '2026-05-03T10:00:00Z' });
    expect(toasts.filter((t) => t.level === 'error')).toEqual([]);
  });

  it('case 3b: legacy masterAddrResolve 503 envelope（无 error.kind） on /diag/* URL → 不 toast，但仍 reject', async () => {
    const axiosError = {
      isAxiosError: true,
      message: 'Request failed with status code 503',
      config: { url: '/api/v1/v2/exhibits/1/diag/events/recording' },
      response: {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        config: { url: '/api/v1/v2/exhibits/1/diag/events/recording' },
        data: { code: 500, message: 'hall=3 当前无在线 master' },
      },
    };
    stubAdapter(async () => {
      throw axiosError;
    });

    let rejected = false;
    try {
      await request.get('/api/v1/v2/exhibits/1/diag/events/recording', {
        params: { hall_id: 3 },
      });
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(toasts.filter((t) => t.level === 'error')).toEqual([]);
  });

  it('case 4: 非 diag URL envelope error → 仍走旧 toast 行为（回归保护）', async () => {
    const axiosError = {
      isAxiosError: true,
      message: 'Request failed with status code 500',
      config: { url: '/api/v1/halls/3/exhibits' },
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: { url: '/api/v1/halls/3/exhibits' },
        data: { code: 9999, message: '业务挂了' },
      },
    };
    stubAdapter(async () => {
      throw axiosError;
    });

    try {
      await request.get('/api/v1/halls/3/exhibits');
    } catch {
      /* expected reject */
    }
    expect(toasts.filter((t) => t.level === 'error').map((t) => t.content)).toEqual(['业务挂了']);
  });

  it('case 5: discovery /v2/halls/:id/discovery/* 不在 diag 豁免内（仍受 skipErrorMessage 调用方控制）', async () => {
    const axiosError = {
      isAxiosError: true,
      message: 'Request failed with status code 503',
      config: { url: '/api/v1/v2/halls/3/discovery/scan', skipErrorMessage: false },
      response: {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        config: { url: '/api/v1/v2/halls/3/discovery/scan', skipErrorMessage: false },
        data: { code: 500, message: '现场扫描挂了' },
      },
    };
    stubAdapter(async () => {
      throw axiosError;
    });

    try {
      await request.post(
        '/api/v1/v2/halls/3/discovery/scan',
        { hall_id: 3 },
        { skipErrorMessage: false },
      );
    } catch {
      /* expected reject */
    }
    expect(toasts.filter((t) => t.level === 'error').map((t) => t.content)).toEqual([
      '现场扫描挂了',
    ]);
  });
});
