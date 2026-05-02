/**
 * device-mgmt-v2 P6 — Diag 透传 API + SSE 客户端
 *
 * 云端 P4 已挂 ANY /api/v1/v2/exhibits/:exhibitId/diag/*subpath 透传到展厅 App
 * 9900 /diag/*. 9 个端点详见 README — admin 调云端，云端再 proxy 给展厅 App。
 *
 * P9-A 修复：所有方法接收 hallId 并透传 ?hall_id=（云端 ProxyExhibitDiag 强校验，
 * 缺失返回 "需提供 ?hall_id= 参数（P4 阶段简化）"）。
 */
import request from './request';
import type {
  DebugEvent,
  DiagEventsResponse,
  RecordingStatus,
  ResourceKind,
  ConflictReport,
} from '@/types/deviceConnector';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const base = (exhibitId: number, sub: string) =>
  `/api/v1/v2/exhibits/${exhibitId}/diag/${sub}`;

export const diagApi = {
  /** 拉模式（含 dropped 计数 + ring_capacity） */
  events: (
    hallId: number,
    exhibitId: number,
    params: { since?: number; kinds?: string[]; device_id?: number; limit?: number } = {},
  ) =>
    request.get<ApiEnvelope<DiagEventsResponse>>(base(exhibitId, 'events'), {
      params: {
        hall_id: hallId,
        ...params,
        kinds: params.kinds?.join(','),
      },
    }),

  /** 模拟收：从展厅 App 假装接到一笔数据 */
  inject: (
    hallId: number,
    exhibitId: number,
    body: {
      resource_kind: ResourceKind;
      identifier: string;
      text?: string;
      hex?: string;
    },
  ) =>
    request.post<ApiEnvelope<{ ok: boolean }>>(base(exhibitId, 'events/inject'), body, {
      params: { hall_id: hallId },
    }),

  /** 当前录制状态 */
  recordingStatus: (hallId: number, exhibitId: number) =>
    request.get<ApiEnvelope<RecordingStatus | null>>(base(exhibitId, 'events/recording'), {
      params: { hall_id: hallId },
    }),

  /** 启录制（duration_min 5 选 1 + note ≥5 字符；前端先校验，后端二次校验） */
  recordingStart: (
    hallId: number,
    exhibitId: number,
    body: { duration_min: number; note: string },
  ) =>
    request.post<ApiEnvelope<RecordingStatus>>(
      base(exhibitId, 'events/recording/start'),
      body,
      { skipErrorMessage: true, params: { hall_id: hallId } },
    ),

  /** 停录制（返回切片 URL 列表） */
  recordingStop: (hallId: number, exhibitId: number) =>
    request.post<ApiEnvelope<RecordingStatus>>(
      base(exhibitId, 'events/recording/stop'),
      undefined,
      { params: { hall_id: hallId } },
    ),

  /** active listener / timer trigger ids */
  activeTriggers: (hallId: number, exhibitId: number) =>
    request.get<
      ApiEnvelope<{
        listener_trigger_ids: number[];
        timer_trigger_ids: number[];
        device_heartbeats?: Array<{
          device_id: number;
          last_heartbeat_at?: string;
          heartbeat_label?: string;
          is_offline?: boolean;
        }>;
      }>
    >(base(exhibitId, 'triggers'), { params: { hall_id: hallId } }),

  /** admin 改 trigger 后让展厅 App 立即重拉配置 */
  triggersReload: (hallId: number, exhibitId: number) =>
    request.post<ApiEnvelope<{ ok: boolean }>>(
      base(exhibitId, 'triggers/reload'),
      undefined,
      { params: { hall_id: hallId } },
    ),

  /** GET / POST 双形态；admin trigger 抽屉保存前调云端 /v2/triggers/_check_conflict 即可，
   *  这里仅在调试 tab 直接点"检查端口"时用到。 */
  checkConflict: (
    hallId: number,
    exhibitId: number,
    body: { resource_kind: ResourceKind; identifier: string },
  ) =>
    request.post<ApiEnvelope<ConflictReport>>(base(exhibitId, 'check_conflict'), body, {
      params: { hall_id: hallId },
    }),

  /** ADR-0017 D4：取展厅 App 本机网卡列表（admin 选 UDP/TCP local_interface 用） */
  networkInterfaces: (hallId: number, exhibitId: number) =>
    request.get<
      ApiEnvelope<{
        interfaces: Array<{
          name: string;
          description?: string;
          mac?: string;
          type?: string;
          mtu?: number | null;
          has_default_gateway?: boolean;
          ipv4: Array<{ ip: string; prefix_length?: number; broadcast?: string | null }>;
        }>;
      }>
    >(base(exhibitId, 'network/interfaces'), {
      params: { hall_id: hallId },
      skipErrorMessage: true,
    }),
};

/* ==================== SSE long-connect client ==================== */

export interface SSEClientOptions {
  hallId: number;
  exhibitId: number;
  /** diag_token (X-Diag-Token 等价；通过 query 透传) */
  diagToken?: string;
  onEvent: (e: DebugEvent) => void;
  /** SSE 连接已 open（含重连） */
  onOpen?: () => void;
  /** 进入重连等待 */
  onReconnect?: () => void;
  onError?: (err: unknown) => void;
}

export interface SSEClient {
  close(): void;
  isConnected(): boolean;
}

/**
 * 建立 SSE 长连。EventSource 默认自动重连；token 走 query（EventSource 不支持自定义 header）。
 *
 * 服务端 frame 格式：
 *   data: {json}\n\n           — 业务事件
 *   :ping\n\n                  — 25s 心跳，忽略
 *
 * 启动期会回放最近 200 条历史事件。
 */
export function startEventStream(opts: SSEClientOptions): SSEClient {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
  const tokenFromStorage = localStorage.getItem('excs-access-token') || '';
  // 后端透传需要 Bearer token；EventSource 没法 header，于是用 ?token= 参数（DiagAccessConfig 接受）
  const params = new URLSearchParams();
  // P9-A 修复：云端 ProxyExhibitDiag 强校验 ?hall_id= 必填
  params.set('hall_id', String(opts.hallId));
  if (opts.diagToken) params.set('token', opts.diagToken);
  // bearer 也通过 query 兜底（部分后端透传层接受）
  if (tokenFromStorage) params.set('access_token', tokenFromStorage);
  const url = `${baseUrl}${base(opts.exhibitId, 'events/stream')}?${params.toString()}`;

  let connected = false;
  let es: EventSource | null = null;

  const connect = () => {
    es = new EventSource(url, { withCredentials: false });
    es.onopen = () => {
      connected = true;
      opts.onOpen?.();
    };
    es.onmessage = (ev) => {
      try {
        const json = JSON.parse(ev.data) as DebugEvent;
        opts.onEvent(json);
      } catch (err) {
        // ignore malformed
        opts.onError?.(err);
      }
    };
    es.onerror = (err) => {
      connected = false;
      opts.onReconnect?.();
      opts.onError?.(err);
      // EventSource 默认 3s 自动重连，无需手动处理
    };
  };

  connect();

  return {
    close: () => {
      es?.close();
      es = null;
      connected = false;
    },
    isConnected: () => connected,
  };
}
