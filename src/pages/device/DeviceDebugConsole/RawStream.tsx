/**
 * device-mgmt-v2 P9-C.2 — Raw 终端 / HTTP 调用记录。
 *
 * 复用 ExhibitDebugTab 的 SSE 模式（startEventStream），但仅过滤本 device。
 * 串口型设备 → "Raw 终端"；HTTP 型（闪优等）→ "HTTP 调用记录"，渲染相同结构，
 * 仅 tab 标签 + 颜色映射区分。
 *
 * P9-C.2 follow-up（PRD 附录 D.10 user feedback）：
 *  - 心跳 hb 帧**不渲染到 raw 流**（K32 5s 一帧刷屏严重，影响阅读 control 命令的回响）
 *  - 顶部加 ♥ chip 显示最近一次心跳时间 + 闪烁动画
 *  - 去除 [暂停] [清空] [复制] 等底部按钮（mockup 去复杂化）
 */
import { useEffect, useRef, useState } from 'react';
import { Empty } from 'antd';
import { startEventStream, type SSEClient } from '@/api/diag';
import type { DebugEvent } from '@/types/deviceConnector';
import styles from './DeviceDebugConsole.module.scss';

interface Props {
  hallId: number;
  exhibitId: number;
  deviceId: number;
  /** http 协议设备显示 'HTTP' 风格；serial 默认 'Raw' */
  protocolStyle?: 'raw' | 'http';
  /** sidePanel 常驻卡片用 mini 高度（mockup 05 行 519-541），主 tab 用默认全高 */
  variant?: 'full' | 'mini';
}

/** 把 hex 字段格式化为可读串（payload.bytes 兜底）。 */
function previewBytes(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';
  const text = payload.text ?? payload.body ?? payload.request ?? payload.response;
  if (typeof text === 'string') return text;
  const hex = payload.hex;
  if (typeof hex === 'string') return hex;
  return JSON.stringify(payload);
}

function isHeartbeatEvent(e: DebugEvent): boolean {
  if (e.kind !== 'inbound') return false;
  const p = e.payload as Record<string, unknown> | undefined;
  return p?.is_heartbeat === true;
}

function formatRelativeTime(ts: string | null): string {
  if (!ts) return '尚未收到';
  const t = new Date(ts).getTime();
  const diffMs = Date.now() - t;
  if (diffMs < 1000) return '刚刚';
  if (diffMs < 60_000) return `${(diffMs / 1000).toFixed(1)}s 前`;
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m 前`;
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
}

export default function RawStream({ hallId, exhibitId, deviceId, protocolStyle = 'raw', variant = 'full' }: Props) {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [lastHbAt, setLastHbAt] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const sseRef = useRef<SSEClient | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hallId <= 0 || exhibitId <= 0) return;
    sseRef.current = startEventStream({
      hallId,
      exhibitId,
      onEvent: (e) => {
        if (e.device_id != null && e.device_id !== deviceId) return;
        // 心跳：仅更新顶部时间戳，不入流
        if (isHeartbeatEvent(e)) {
          setLastHbAt(e.timestamp);
          return;
        }
        setEvents((prev) => {
          const next = [...prev, e];
          return next.length > 1000 ? next.slice(-1000) : next;
        });
      },
    });
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [hallId, exhibitId, deviceId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  // 顶部 ♥ chip 相对时间每秒刷新
  useEffect(() => {
    if (!lastHbAt) return;
    const tick = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => clearInterval(tick);
  }, [lastHbAt]);

  return (
    <div className={styles.sideCard}>
      <div className={styles.sideCardTitle}>
        <span>{protocolStyle === 'http' ? 'HTTP 调用记录' : 'Raw 终端'}</span>
        <span className={styles.heartbeatChip} title={lastHbAt ? `最近心跳 ${lastHbAt}` : '尚未收到心跳'}>
          <span className={styles.heartbeatChipDot} />
          ♥ {formatRelativeTime(lastHbAt)}
        </span>
      </div>
      <div className={`${styles.rawStream} ${variant === 'mini' ? styles.rawStreamMini : ''}`.trim()}>
        {events.length === 0 ? (
          <Empty
            description={lastHbAt ? '心跳已收到，等待 control / query 事件…' : '尚无事件'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            imageStyle={{ filter: 'invert(1)' }}
          />
        ) : (
          events.map((e) => {
            const ts = new Date(e.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
            const cls =
              e.kind === 'outbound'
                ? styles.rawOut
                : e.kind === 'inbound'
                  ? styles.rawIn
                  : e.kind === 'error'
                    ? styles.rawErr
                    : e.kind === 'trigger_fire'
                      ? styles.rawTriggerFire
                      : e.kind === 'listener_hit' || e.kind === 'listener_miss'
                        ? styles.rawListener
                        : '';
            const arrow =
              e.kind === 'outbound'
                ? '→'
                : e.kind === 'inbound'
                  ? '←'
                  : e.kind === 'error'
                    ? '✕'
                    : e.kind === 'trigger_fire'
                      ? '🔔'
                      : '·';
            return (
              <div key={e.seq} className={cls}>
                {ts} {arrow} {previewBytes(e.payload)}
                {e.latency_ms != null && (
                  <span style={{ color: '#6e7189' }}> [+{e.latency_ms}ms]</span>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
