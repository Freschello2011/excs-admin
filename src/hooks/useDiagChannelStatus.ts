/**
 * DRC-Phase 5 — diag 反向通道健康轮询
 *
 * GET /api/v1/v2/exhibits/:exhibitId/diag/_health?hall_id=
 *
 * 端点始终返回 200 + body { kind, details }，不会触发 request.ts 全局 toast。
 * kind:
 *   - online              ：反向通道可用
 *   - app_offline         ：心跳过期 / 实例缺失（state 1 红 banner）
 *   - cloud_unavailable   ：云端 MQTT 客户端断开（state 2 黄 banner）
 *
 * details 仅在 banner 内渲染：
 *   - app_offline:        local_ip / mac_address / last_heartbeat_at / interface_name?
 *                         （machine_code 仅日志，不渲染）
 *   - cloud_unavailable:  since (ISO8601)
 *
 * 默认 5s 轮询；hallId / exhibitId 任一无效则禁用。
 */
import { useQuery } from '@tanstack/react-query';
import request from '@/api/request';

export type DiagChannelKind = 'online' | 'app_offline' | 'cloud_unavailable';

export interface DiagChannelDetails {
  local_ip?: string;
  mac_address?: string;
  last_heartbeat_at?: string | null;
  interface_name?: string;
  machine_code?: string;
  since?: string;
  hall_id?: number;
  exhibit_id?: number;
  [key: string]: unknown;
}

export interface DiagChannelStatus {
  kind: DiagChannelKind;
  details: DiagChannelDetails;
}

export interface UseDiagChannelStatusOptions {
  /** 关闭轮询（譬如 tab 不可见时） */
  enabled?: boolean;
  /** 轮询间隔（毫秒），默认 5000 */
  refetchIntervalMs?: number;
}

export function useDiagChannelStatus(
  hallId: number,
  exhibitId: number,
  opts: UseDiagChannelStatusOptions = {},
) {
  const { enabled = true, refetchIntervalMs = 5000 } = opts;
  return useQuery<DiagChannelStatus>({
    queryKey: ['diag', 'health', hallId, exhibitId],
    enabled: enabled && hallId > 0 && exhibitId > 0,
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const res = await request.get(`/api/v1/v2/exhibits/${exhibitId}/diag/_health`, {
        params: { hall_id: hallId },
        skipErrorMessage: true,
      });
      const body = (res.data ?? {}) as Partial<DiagChannelStatus>;
      const kind = (body.kind as DiagChannelKind) ?? 'online';
      const details = (body.details ?? {}) as DiagChannelDetails;
      return { kind, details };
    },
  });
}
