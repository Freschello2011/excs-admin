/**
 * device-mgmt-v2 P9-C.2 — Raw 终端 / HTTP 调用记录。
 *
 * 复用 ExhibitDebugTab 的 SSE 模式（startEventStream），但仅过滤本 device。
 * 串口型设备 → "Raw 终端"；HTTP 型（闪优等）→ "HTTP 调用记录"，渲染相同结构，
 * 仅 tab 标签 + 颜色映射区分。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Space } from 'antd';
import { PauseOutlined, PlayCircleOutlined, ClearOutlined, CopyOutlined } from '@ant-design/icons';
import { startEventStream, type SSEClient } from '@/api/diag';
import type { DebugEvent } from '@/types/deviceConnector';
import { useMessage } from '@/hooks/useMessage';
import styles from './DeviceDebugConsole.module.scss';

interface Props {
  hallId: number;
  exhibitId: number;
  deviceId: number;
  /** http 协议设备显示 'HTTP' 风格；serial 默认 'Raw' */
  protocolStyle?: 'raw' | 'http';
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

export default function RawStream({ hallId, exhibitId, deviceId, protocolStyle = 'raw' }: Props) {
  const { message } = useMessage();
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const sseRef = useRef<SSEClient | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused || hallId <= 0 || exhibitId <= 0) return;
    sseRef.current = startEventStream({
      hallId,
      exhibitId,
      onEvent: (e) => {
        if (e.device_id != null && e.device_id !== deviceId) return;
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
  }, [hallId, exhibitId, deviceId, paused]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  const lastEventText = useMemo(() => {
    const last = events[events.length - 1];
    return last ? previewBytes(last.payload) : '';
  }, [events]);

  const handleCopy = async () => {
    if (!lastEventText) return;
    try {
      await navigator.clipboard.writeText(lastEventText);
      message.success('已复制最后一条');
    } catch {
      message.error('剪贴板不可用');
    }
  };

  return (
    <div className={styles.sideCard}>
      <div className={styles.sideCardTitle}>
        <span>{protocolStyle === 'http' ? 'HTTP 调用记录' : 'Raw 终端'}</span>
        <small>
          {paused ? '已暂停' : '订阅中'} · 最近 {Math.min(events.length, 1000)} 条
        </small>
      </div>
      <div className={styles.rawStream}>
        {events.length === 0 ? (
          <Empty
            description="尚无事件"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            imageStyle={{ filter: 'invert(1)' }}
          />
        ) : (
          events.map((e) => {
            const ts = new Date(e.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
            const isHb =
              e.kind === 'inbound' && (e.payload as Record<string, unknown>)?.is_heartbeat === true;
            const cls =
              e.kind === 'outbound'
                ? styles.rawOut
                : e.kind === 'inbound'
                  ? isHb
                    ? styles.rawHb
                    : styles.rawIn
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
                  ? isHb
                    ? '♥'
                    : '←'
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
      <Space size={4} style={{ marginTop: 8, width: '100%' }}>
        <Button
          size="small"
          icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? '继续' : '暂停'}
        </Button>
        <Button size="small" icon={<ClearOutlined />} onClick={() => setEvents([])}>
          清空
        </Button>
        <Button size="small" icon={<CopyOutlined />} onClick={handleCopy} disabled={!lastEventText}>
          复制最后一条
        </Button>
      </Space>
    </div>
  );
}
