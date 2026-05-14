/**
 * device-mgmt-v2 — 触发监视（接收器型设备调试台）。
 *
 * 适用：xiuzhan_laser_16ch 等纯接收器型设备（commands=[] +
 * default_listener_patterns.length > 0）。这类设备没有"通道开关"概念，
 * 只有"按下时刻"事件；调试台用 16 格网格做"被按到了哪一路"的可视化，
 * 配合右侧实时事件流让部署人员核对监听规则。
 *
 * 数据源：复用 RawStream 同一份 SSE（startEventStream），客户端用 yaml 里
 * default_listener_patterns 的 regex 自解析 inbound payload.text/.body。
 * 不依赖 retained state（设备无主动上行状态）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Empty, Tag, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { startEventStream, type SSEClient } from '@/api/diag';
import type { ChannelEntry } from '@/api/channelMap';
import type { DebugEvent } from '@/types/deviceConnector';
import type { DocumentedListenerPattern } from '@/types/deviceConnector';
import styles from './DeviceDebugConsole.module.scss';

const { Text } = Typography;

interface Props {
  hallId: number;
  exhibitId: number;
  deviceId: number;
  total: number;
  channelMap: ChannelEntry[];
  /** 来自 catalog yaml 的 default_listener_patterns（preset 设备）；
   *  未提供时退化为单一 wildcard `:::XZLP(\d{3})K([AB])\.` 兜底。*/
  listenerPatterns?: DocumentedListenerPattern[];
  /** 本设备 connection_config.port_name（如 "COM6"）。
   *  当展厅 App 发的 inbound 事件 device_id=null（纯接收器无 heartbeat / 无 listener
   *  时 FindResourceOwner 找不到 owner）时，按 payload.resource === portName 兜底接受。
   *  详见 BUG-TRIAGE 设备管理节激光笔 root-cause；A 路线 hotfix。 */
  portName?: string;
  onEditLabel?: (channelIdx1Based: number) => void;
}

interface TriggerEvent {
  ts: number;
  channelIdx: number;   // 0-indexed
  button: 'A' | 'B';
  raw: string;
}

interface CellFlashState {
  /** 末次 A 键触发 ms 时间戳 */
  a: number;
  /** 末次 B 键触发 ms 时间戳 */
  b: number;
  /** 累计触发次数（A + B） */
  count: number;
}

const FLASH_MS = 1500;
const MAX_LOG = 20;
// catalog/xiuzhan_laser_16ch.yaml: 按住激光笔时约每 200ms 重复一帧。
const FRAME_INTERVAL_MS = 200;

/** 把 yaml regex 编译为 RegExp 数组；编译失败的项静默跳过 + 控制台告警。 */
function compilePatterns(raw?: DocumentedListenerPattern[]): RegExp[] {
  const list = raw && raw.length > 0
    ? raw
        .filter((p) => p.pattern_kind === 'regex' && p.pattern)
        .map((p) => p.pattern)
    : [`^:::XZLP(\\d{3})K([AB])\\.$`];
  return list
    .map((src) => {
      try {
        return new RegExp(src);
      } catch (e) {
        console.warn('[EventListenerMonitor] regex compile failed:', src, e);
        return null;
      }
    })
    .filter((r): r is RegExp => r != null);
}

/** 从 regex 命中中抽出 channel(0-indexed) + button；命中但解析失败返 null。 */
function parseMatch(m: RegExpExecArray): { channelIdx: number; button: 'A' | 'B' } | null {
  // 期望 capture groups 顺序：(\d{3}) [可选 (A|B)]
  // 个别 pattern 是 A-only / B-only，按 regex 源串后缀推断按钮。
  const numStr = m[1];
  if (!numStr || !/^\d+$/.test(numStr)) return null;
  const channelIdx = Number(numStr);
  if (channelIdx < 0 || channelIdx > 999) return null;
  let button: 'A' | 'B';
  if (m[2] === 'A' || m[2] === 'B') {
    button = m[2];
  } else if (m.input.endsWith('KA.')) {
    button = 'A';
  } else if (m.input.endsWith('KB.')) {
    button = 'B';
  } else {
    return null;
  }
  return { channelIdx, button };
}

/** 展厅 App TriggerRuntime emit Inbound 时（含 SerialDriver / Listeners 多路径）
 *  payload 标准字段是 `bytes_ascii`（首选）+ `bytes_hex`（兜底）；
 *  额外兼容 raw_transport / 其它 driver 路径可能出现的 text/body/response/request。
 *  权威源：06-exhibit-app/src/.../Application/Trigger/TriggerRuntime.cs `bytes_ascii = TruncateAscii(evt.TextRepr, 200)`。 */
function extractText(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';
  const candidates = [
    payload.bytes_ascii,
    payload.text,
    payload.body,
    payload.response,
    payload.request,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c;
  }
  const hex = payload.bytes_hex ?? payload.hex;
  if (typeof hex === 'string') return hex;
  return '';
}

function extractResource(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';
  const r = payload.resource;
  return typeof r === 'string' ? r : '';
}

export default function EventListenerMonitor({
  hallId,
  exhibitId,
  deviceId,
  total,
  channelMap,
  listenerPatterns,
  portName,
  onEditLabel,
}: Props) {
  const regs = useMemo(() => compilePatterns(listenerPatterns), [listenerPatterns]);
  const [log, setLog] = useState<TriggerEvent[]>([]);
  const [cells, setCells] = useState<Record<number, CellFlashState>>({});
  const [now, setNow] = useState(0);
  const sseRef = useRef<SSEClient | null>(null);

  // SSE 订阅
  useEffect(() => {
    if (hallId <= 0 || exhibitId <= 0 || deviceId <= 0) return;
    sseRef.current = startEventStream({
      hallId,
      exhibitId,
      onEvent: (e: DebugEvent) => {
        if (e.kind !== 'inbound') return;
        // 接受条件二选一：
        //  1) 事件已带 device_id 且匹配（理想路径，展厅 App 注册了 heartbeat / listener trigger 时）
        //  2) 事件 device_id=null 但 payload.resource === portName（兜底路径，
        //     纯接收器无 heartbeat / 无 listener → FindResourceOwner 返 null）
        const payload = e.payload as Record<string, unknown> | undefined;
        const resource = extractResource(payload);
        const ownerMatch =
          e.device_id === deviceId ||
          (e.device_id == null && !!portName && resource === portName);
        if (!ownerMatch) return;
        const text = extractText(payload);
        if (!text) return;
        // 展厅 App 把 200ms 内积攒的多帧拼成一个 bytes_ascii，形如
        // "\r\n:::XZLP014KA.\r\n:::XZLP014KA.\r\n:::..."；按行拆分逐行匹配，
        // 同 payload 内多次命中分别累计。
        const lines = text.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
        if (lines.length === 0) return;
        const hits: { channelIdx: number; button: 'A' | 'B'; raw: string }[] = [];
        for (const line of lines) {
          for (const r of regs) {
            const m = r.exec(line);
            if (m) {
              const parsed = parseMatch(m);
              if (parsed) {
                hits.push({ ...parsed, raw: line });
                break;
              }
            }
          }
        }
        if (hits.length === 0) return;
        const now = Date.now();
        setNow(now);
        const hitsWithTs = hits.map((h, i) => ({
          ...h,
          ts: now - (hits.length - 1 - i) * FRAME_INTERVAL_MS,
        }));
        setLog((prev) => {
          const next = [...hitsWithTs].reverse().concat(prev);
          return next.slice(0, MAX_LOG);
        });
        setCells((prev) => {
          const next = { ...prev };
          for (const h of hitsWithTs) {
            const cur = next[h.channelIdx] ?? { a: 0, b: 0, count: 0 };
            next[h.channelIdx] = {
              a: h.button === 'A' ? h.ts : cur.a,
              b: h.button === 'B' ? h.ts : cur.b,
              count: cur.count + 1,
            };
          }
          return next;
        });
      },
    });
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [hallId, exhibitId, deviceId, regs, portName]);

  // 闪烁衰减 + 时间戳相对刷新：500ms 一帧
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, []);

  const totalCount = log.length === 0 ? 0 : Object.values(cells).reduce((s, c) => s + c.count, 0);

  // 16 格渲染
  const cellsRender = Array.from({ length: total }, (_, i) => {
    const state = cells[i];
    const aActive = state ? now - state.a < FLASH_MS : false;
    const bActive = state ? now - state.b < FLASH_MS : false;
    const entry = channelMap.find((m) => m.index === i + 1);
    return { idx: i, aActive, bActive, hits: state?.count ?? 0, entry };
  });

  if (hallId <= 0 || exhibitId <= 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="该设备未绑定展项 — 触发监视依赖展项级 SSE 通道"
        description="请到设备编辑里绑定展项后再来调试"
      />
    );
  }

  return (
    <div className={styles.eventMonitorWrap}>
      {/* 顶部状态条 */}
      <div className={styles.tools}>
        <span className={styles.toolsLabel}>
          🎯 监听中
          <span style={{ marginLeft: 8, color: 'var(--ant-color-text-tertiary)', fontWeight: 400 }}>
            （按下激光笔后此处亮起）
          </span>
        </span>
        <span className={styles.flexSpacer} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          累计触发 <strong style={{ color: 'var(--ant-color-text)' }}>{totalCount}</strong> 次
        </Text>
      </div>

      <div className={styles.eventMonitorBody}>
        {/* 左：16 格 */}
        <div className={styles.eventMonitorGridWrap}>
          <div className={styles.matrixGrid16}>
            {cellsRender.map((c) => {
              const lit = c.aActive || c.bActive;
              const classes = [styles.channel, styles.eventCell];
              if (c.aActive) classes.push(styles.eventCellA);
              if (c.bActive) classes.push(styles.eventCellB);
              if (lit) classes.push(styles.eventCellLit);
              const editLabel = () => onEditLabel?.(c.idx + 1);
              return (
                <div
                  key={c.idx}
                  className={classes.join(' ')}
                  onClick={editLabel}
                  role="button"
                  tabIndex={0}
                  aria-label={`编辑第 ${c.idx + 1} 路接收点标注`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      editLabel();
                    }
                  }}
                >
                  <div className={styles.channelNum}>{c.idx + 1}</div>
                  {c.entry?.label ? (
                    <div className={styles.channelLabel}>{c.entry.label}</div>
                  ) : (
                    <div className={`${styles.channelLabel} ${styles.channelLabelPlaceholder}`}>
                      未标注
                      <EditOutlined style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }} />
                    </div>
                  )}
                  {/* A/B 灯 */}
                  <div className={styles.eventCellButtons}>
                    <span className={`${styles.eventBtnDot} ${c.aActive ? styles.eventBtnDotOnA : ''}`}>A</span>
                    <span className={`${styles.eventBtnDot} ${c.bActive ? styles.eventBtnDotOnB : ''}`}>B</span>
                  </div>
                  {c.hits > 0 && <span className={styles.eventCellHits}>{c.hits}</span>}
                </div>
              );
            })}
          </div>

          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#3b82f6' }} />A 键
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#ef4444' }} />B 键
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#bfbfbf' }} />未触发
            </div>
            <span className={styles.flexSpacer} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              通道 0-indexed：第 1 路 = 000 · 按住时约每 200ms 重复一帧
            </Text>
          </div>
        </div>

        {/* 右：实时事件流 */}
        <div className={styles.eventMonitorLog}>
          <div className={styles.eventMonitorLogTitle}>
            <span>实时事件流</span>
            <small>{log.length}/{MAX_LOG}</small>
          </div>
          {log.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ fontSize: 12 }}>等待激光笔按键…</span>}
            />
          ) : (
            <div className={styles.eventMonitorLogList}>
              {log.map((ev, i) => {
                const diffMs = now - ev.ts;
                const relTs =
                  diffMs < 1000 ? '刚刚' :
                  diffMs < 60_000 ? `${(diffMs / 1000).toFixed(1)}s 前` :
                  new Date(ev.ts).toLocaleTimeString('zh-CN', { hour12: false });
                return (
                  <div key={`${ev.ts}-${i}`} className={styles.eventMonitorLogRow}>
                    <span className={styles.eventMonitorLogTs}>{relTs}</span>
                    <Tag
                      color={ev.button === 'A' ? 'blue' : 'red'}
                      style={{ marginRight: 4, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}
                    >
                      第 {ev.channelIdx + 1} 路 · {ev.button}
                    </Tag>
                    <code className={styles.eventMonitorLogRaw}>{ev.raw}</code>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
