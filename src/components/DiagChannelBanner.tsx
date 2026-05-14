/**
 * DRC-Phase 5 — 反向通道错误态 banner（state 1 / 2 / 4）
 *
 * 视觉权威：07-ui/mockup/07-diag-reverse-channel/01-offline-states.html（PM 文案版）
 *
 * 渲染矩阵：
 *   kind=app_offline       → state 1（红 / Alert error / IP+MAC+心跳+3 步排查）
 *   kind=cloud_unavailable → state 2（黄 / Alert warning / 不用去现场）
 *   sseReconnectCount ≥ 5  → state 4（红 / "立即重连" 红色按钮，覆盖 state 1/2）
 *   kind=online + count<5  → 不渲染
 *
 * 红线：
 *   - 仅渲染 local_ip + mac_address + last_heartbeat_at；machine_code 不渲染
 *   - 颜色全部 antd token / CSS var，不硬编码 hex
 *   - state 0「实时事件流已重连」绿 banner 由 ExhibitDebugTab 自管，本组件不接管
 */
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useDiagChannelStatus, type DiagChannelStatus } from '@/hooks/useDiagChannelStatus';

interface DiagChannelBannerProps {
  hallId: number;
  exhibitId: number;
  /** 实时事件流（SSE）累计重连失败次数；≥5 升级为 state 4 红 banner */
  sseReconnectCount?: number;
  /** state 4 banner 的「立即重连」按钮回调 */
  onForceReconnect?: () => void;
  /** 「再试一次」按钮回调（手动触发 _health refetch） */
  onRetry?: () => void;
  /** 测试 / 受控注入：直接给 status，跳过 useQuery */
  statusOverride?: DiagChannelStatus;
}

const SSE_RECONNECT_THRESHOLD = 5;

function formatHeartbeat(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${minutes} 分钟前（${ts}）`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export default function DiagChannelBanner({
  hallId,
  exhibitId,
  sseReconnectCount = 0,
  onForceReconnect,
  onRetry,
  statusOverride,
}: DiagChannelBannerProps) {
  const query = useDiagChannelStatus(hallId, exhibitId, {
    enabled: !statusOverride,
  });
  const status: DiagChannelStatus | undefined = statusOverride ?? query.data;

  // state 4：SSE 重连超阈，红色高优；不依赖 _health（可能 SSE 单独不通）
  if (sseReconnectCount >= SSE_RECONNECT_THRESHOLD) {
    return (
      <Alert
        type="error"
        showIcon
        message={`实时事件已断开 ${sseReconnectCount} 次 · 已停止自动重试`}
        description={
          <span>
            连续重试 {sseReconnectCount} 次还没接上，可能是网络不稳定。
            <br />
            点右边「立即重连」再试一下，或刷新整个页面。
            <br />
            <strong>之前已经收到的事件还可以在下面看</strong>。
          </span>
        }
        action={
          <Button
            size="small"
            danger
            type="primary"
            icon={<ReloadOutlined />}
            onClick={onForceReconnect}
          >
            立即重连
          </Button>
        }
        style={{ marginBottom: 12 }}
        data-diag-banner-state="4"
      />
    );
  }

  if (!status || status.kind === 'online') {
    return null;
  }

  if (status.kind === 'app_offline') {
    const d = status.details ?? {};
    return (
      <Alert
        type="error"
        showIcon
        message="展厅电脑没连上，调试功能暂时用不了"
        description={
          <div>
            上次心跳：<strong>{formatHeartbeat(d.last_heartbeat_at)}</strong>
            <br />
            IP 地址：<code>{d.local_ip || '—'}</code> · MAC：
            <code>{d.mac_address || '—'}</code>
            <br />
            <br />
            <strong>请到现场看一下：</strong>
            <br />
            ① 展厅电脑（NUC / 主机）是否开机、屏幕亮不亮
            <br />
            ② 网线插好了吗？Wi-Fi 连着吗？（可在别的电脑 ping 上面那个 IP）
            <br />
            ③ 处理好后这条提示会在 30 秒内自动消失，不需要刷新本页面
          </div>
        }
        action={
          <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
            再试一次
          </Button>
        }
        style={{ marginBottom: 12 }}
        data-diag-banner-state="1"
      />
    );
  }

  // cloud_unavailable
  return (
    <Alert
      type="warning"
      showIcon
      message="调试功能暂时不能用 · 云端正在自动恢复"
      description={
        <span>
          这是<strong>云端临时问题</strong>，和现场展厅电脑没关系，
          <strong>不用去现场</strong>。
          <br />
          云端会自动重试，通常 1 分钟内恢复。
          <br />
          如果超过 5 分钟还没恢复，请告诉 ExCS 工程师。
        </span>
      }
      action={
        <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
          再试一次
        </Button>
      }
      style={{ marginBottom: 12 }}
      data-diag-banner-state="2"
    />
  );
}
