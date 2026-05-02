/**
 * device-mgmt-v2 P9-E.2 — 扫描发现 API 客户端。
 *
 * - POST /api/v1/v2/halls/:hallId/discovery/scan → task_id
 * - GET  /api/v1/v2/halls/:hallId/discovery/results?task_id=... → snapshot（partial=true 表未完成）
 *
 * 直连模式下：path mapping 把这两个端点拍平到 9900 /diag/discover (POST) /
 * /diag/discover/results (GET)，hall_master 直接执行——不经云端。
 *
 * 客户端 pollResults 用普通 setTimeout 轮询；后端 partial=false 时停。轮询期间外面应
 * 提供 cancel token 防止 React 严格模式重渲染时泄漏。
 */
import request from './request';
import type {
  DiscoveryScanRequest,
  DiscoveryScanResponse,
  DiscoveryResultSnapshot,
} from '@/types/discovery';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const base = (hallId: number, sub: string) =>
  `/api/v1/v2/halls/${hallId}/discovery/${sub}`;

export const discoveryApi = {
  scan: (hallId: number, body: DiscoveryScanRequest) =>
    request.post<ApiEnvelope<DiscoveryScanResponse>>(base(hallId, 'scan'), body, {
      // 412 (smyoo 凭据缺失) / 503 (hall_master 不可达) 由调用方决定 toast，避免双重提示
      skipErrorMessage: true,
    }),
  results: (hallId: number, taskId: string) =>
    request.get<ApiEnvelope<DiscoveryResultSnapshot>>(base(hallId, 'results'), {
      params: { task_id: taskId },
      skipErrorMessage: true,
    }),
};

export interface PollOptions {
  hallId: number;
  taskId: string;
  intervalMs?: number;
  /** 单次快照（含 partial=true 的中间态）—— 调用方按需更新 UI */
  onSnapshot: (snapshot: DiscoveryResultSnapshot) => void;
  /** 拉到 partial=false 或请求出错后调用 */
  onDone?: (snapshot: DiscoveryResultSnapshot | null, err?: unknown) => void;
}

export interface PollHandle {
  cancel: () => void;
  /** P9-B 前端补齐：暂停拉取（不取消后端 task；admin 点 [⏸ 暂停] 时调用）。 */
  pause: () => void;
  /** 恢复拉取（admin 点 [▶ 继续] 时调用）。 */
  resume: () => void;
}

/**
 * 启动轮询；每 intervalMs (默认 1500) 拉一次，直到 partial=false 或调用 cancel()。
 * 单次错误不中断（hall_master 重启 / 502 抖动期）—— 仅最后一次错误触发 onDone。
 */
export function pollDiscoveryResults(opts: PollOptions): PollHandle {
  const { hallId, taskId, intervalMs = 1500, onSnapshot, onDone } = opts;
  let cancelled = false;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (cancelled) return;
    if (paused) {
      // 暂停期间不再 schedule 下一帧；resume() 会重新调度
      return;
    }
    try {
      const res = await discoveryApi.results(hallId, taskId);
      if (cancelled) return;
      const snap = res.data.data;
      if (res.data.code === 0 && snap) {
        onSnapshot(snap);
        if (!snap.partial) {
          onDone?.(snap);
          return;
        }
      }
    } catch (err) {
      // 轮询期单次失败不中断；仅当后续也失败时才看到效果
      if (cancelled) return;
      void err;
    }
    if (cancelled || paused) return;
    timer = setTimeout(tick, intervalMs);
  };

  tick();

  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      onDone?.(null);
    },
    pause: () => {
      paused = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    resume: () => {
      if (cancelled || !paused) return;
      paused = false;
      // 立刻拉一次（让 UI 立刻有反馈），由 tick 自己排定下一帧
      tick();
    },
  };
}
