/**
 * device-mgmt-v2 P6 — 展项详情 [调试] tab
 *
 * 功能:
 *   - SSE 长连消费 /diag/events/stream（启动期回放最近 200 条 + 25s :ping）
 *   - 8 类过滤器 chip（7 EventKind + ♥ 心跳）
 *   - 设备 select / 暂停 / 录制 / 模拟收 / 清空 / 自动滚动
 *   - listener_miss 一键"用这个规则新建匹配"
 *   - 录制对话框（5 选 1 时长 + 必填备注 ≥5 字符）
 *   - SSE 重连 banner
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Select,
  Space,
  Tag,
  Tooltip,
  Switch,
  Empty,
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ClearOutlined,
  VideoCameraOutlined,
  StopOutlined,
  ReloadOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMessage } from '@/hooks/useMessage';
import { hallApi } from '@/api/hall';
import { diagApi, startEventStream, type SSEClient } from '@/api/diag';
import { queryKeys } from '@/api/queryKeys';
import DiagChannelBanner from '@/components/DiagChannelBanner';
import type {
  DebugEvent,
  EventKind,
  PatternKind,
  RecordingStatus,
  ResourceKind,
} from '@/types/deviceConnector';
import { EVENT_KIND_LABEL, EVENT_KIND_COLOR, RESOURCE_KIND_LABEL } from '@/lib/deviceConnectorLabels';

const ALL_KINDS: EventKind[] = [
  'outbound',
  'inbound',
  'listener_hit',
  'listener_miss',
  'trigger_fire',
  'poll_cycle',
  'error',
];

const RECORDING_DURATIONS = [
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
  { value: 120, label: '2 小时' },
  { value: 240, label: '4 小时' },
  { value: 480, label: '8 小时（上限）' },
];

interface DebugTabProps {
  hallId: number;
  exhibitId: number;
  /** 可选：默认按 device 过滤（从设备详情 tab 跳过来时） */
  defaultDeviceId?: number;
}

export default function ExhibitDebugTab({ hallId, exhibitId, defaultDeviceId }: DebugTabProps) {
  const { message, notification } = useMessage();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showHeartbeat, setShowHeartbeat] = useState(true);
  const [enabledKinds, setEnabledKinds] = useState<Set<EventKind>>(new Set(ALL_KINDS));
  const [deviceFilter, setDeviceFilter] = useState<number | undefined>(defaultDeviceId);
  const [reconnectBanner, setReconnectBanner] = useState(false);
  // DRC-Phase 5：累计 SSE 重连失败次数；onOpen 时清零，≥5 触发 state 4 红 banner
  const [reconnectFailCount, setReconnectFailCount] = useState(0);
  const [recordingDialogOpen, setRecordingDialogOpen] = useState(false);
  const [injectDialogOpen, setInjectDialogOpen] = useState(false);
  const [missForNewPattern, setMissForNewPattern] = useState<DebugEvent | null>(null);

  const sseRef = useRef<SSEClient | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const { data: devices = [] } = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: hallId }),
    select: (res) => res.data.data ?? [],
    enabled: hallId > 0,
  });

  const { data: recording } = useQuery({
    queryKey: ['diag-recording', exhibitId],
    queryFn: () => diagApi.recordingStatus(hallId, exhibitId),
    select: (res) => res.data.data,
    enabled: exhibitId > 0 && hallId > 0,
    refetchInterval: 5000,
  });

  // SSE long-connect lifecycle
  useEffect(() => {
    if (paused) {
      sseRef.current?.close();
      sseRef.current = null;
      return;
    }
    if (hallId <= 0) return;
    sseRef.current = startEventStream({
      hallId,
      exhibitId,
      onOpen: () => {
        setReconnectBanner(false);
        setReconnectFailCount(0);
      },
      onReconnect: () => {
        setReconnectBanner(true);
        setReconnectFailCount((n) => n + 1);
      },
      onEvent: (e) => {
        setEvents((prev) => {
          const next = [...prev, e];
          // 限制 5000 条避免内存爆
          return next.length > 5000 ? next.slice(-5000) : next;
        });
      },
      onError: () => {
        // EventSource 自动重连，UI 仅置顶 banner
      },
    });
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [hallId, exhibitId, paused]);

  // auto scroll
  useEffect(() => {
    if (autoScroll) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  // filter events
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (!enabledKinds.has(e.kind)) return false;
      if (deviceFilter && e.device_id !== deviceFilter) return false;
      const isHeartbeat =
        e.kind === 'inbound' && (e.payload as Record<string, unknown>)?.is_heartbeat === true;
      if (!showHeartbeat && isHeartbeat) return false;
      return true;
    });
  }, [events, enabledKinds, deviceFilter, showHeartbeat]);

  const toggleKind = (k: EventKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const handleStartRecording = useMutation({
    mutationFn: (body: { duration_min: number; note: string }) =>
      diagApi.recordingStart(hallId, exhibitId, body),
    onSuccess: () => {
      message.success('已开始录制');
      queryClient.invalidateQueries({ queryKey: ['diag-recording', exhibitId] });
      setRecordingDialogOpen(false);
    },
    onError: () => {
      message.error('启动录制失败 — 请检查时长 / 备注是否合规');
    },
  });

  const handleStopRecording = useMutation({
    mutationFn: () => diagApi.recordingStop(hallId, exhibitId),
    onSuccess: (res) => {
      const status = res.data.data;
      Modal.info({
        title: '录制完成',
        width: 640,
        content: <RecordingResultView status={status} />,
      });
      queryClient.invalidateQueries({ queryKey: ['diag-recording', exhibitId] });
    },
  });

  const handleInject = useMutation({
    mutationFn: (body: {
      resource_kind: ResourceKind;
      identifier: string;
      text?: string;
      hex?: string;
    }) => diagApi.inject(hallId, exhibitId, body),
    onSuccess: () => {
      message.success('已模拟接收一条数据');
      setInjectDialogOpen(false);
    },
    // DRC-Phase 5：单次请求超时 → toast state 3「展厅电脑可能正忙着」
    onError: (err: Error & { __diagKind?: string }) => {
      if (err.__diagKind === 'invocation_timeout') {
        notification.warning({
          message: '刚才那次操作没收到回应',
          description: '「模拟收一笔数据」等了 10 秒还没回。展厅电脑可能正忙着，可以再试一次。',
        });
      }
    },
  });

  return (
    <div>
      <DiagChannelBanner
        hallId={hallId}
        exhibitId={exhibitId}
        sseReconnectCount={reconnectFailCount}
        onForceReconnect={() => {
          setReconnectFailCount(0);
          setPaused(true);
          setTimeout(() => setPaused(false), 0);
        }}
        onRetry={() =>
          queryClient.invalidateQueries({ queryKey: ['diag', 'health', hallId, exhibitId] })
        }
      />
      {reconnectBanner && (
        <Alert
          type="success"
          showIcon
          icon={<ReloadOutlined />}
          message="✓ 实时事件流已重连 · 自动回放了最近 200 条历史"
          style={{ marginBottom: 12 }}
          closable
          onClose={() => setReconnectBanner(false)}
        />
      )}

      {recording?.is_recording && (
        <Alert
          type="warning"
          showIcon
          message="REC · 正在录制"
          description={
            <div>
              备注：{recording.note ?? '-'}{' '}
              {recording.planned_duration_min && (
                <span> · 计划 {recording.planned_duration_min} 分钟</span>
              )}{' '}
              · 到点会自动停
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                style={{ marginLeft: 12 }}
                loading={handleStopRecording.isPending}
                onClick={() => handleStopRecording.mutate()}
              >
                提前停录
              </Button>
            </div>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Space wrap style={{ marginBottom: 12 }}>
        {ALL_KINDS.map((k) => (
          <Tag.CheckableTag
            key={k}
            checked={enabledKinds.has(k)}
            onChange={() => toggleKind(k)}
            style={{
              border: `1px solid ${EVENT_KIND_COLOR[k]}`,
              color: enabledKinds.has(k) ? '#fff' : EVENT_KIND_COLOR[k],
              background: enabledKinds.has(k) ? EVENT_KIND_COLOR[k] : 'transparent',
            }}
          >
            {EVENT_KIND_LABEL[k]}
          </Tag.CheckableTag>
        ))}
        <Tag.CheckableTag
          checked={showHeartbeat}
          onChange={setShowHeartbeat}
          style={{
            border: '1px solid #ef4444',
            color: showHeartbeat ? '#fff' : '#ef4444',
            background: showHeartbeat ? '#ef4444' : 'transparent',
          }}
        >
          ♥ 心跳
        </Tag.CheckableTag>
      </Space>

      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          placeholder="按设备过滤"
          style={{ width: 200 }}
          value={deviceFilter}
          onChange={setDeviceFilter}
          options={devices.map((d) => ({ value: d.id, label: d.name }))}
        />
        <Button
          icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
          onClick={() => setPaused((v) => !v)}
        >
          {paused ? '继续' : '暂停'}
        </Button>
        {!recording?.is_recording ? (
          <Button icon={<VideoCameraOutlined />} onClick={() => setRecordingDialogOpen(true)}>
            开始录制
          </Button>
        ) : null}
        <Button onClick={() => setInjectDialogOpen(true)}>📥 模拟收</Button>
        <Button icon={<ClearOutlined />} onClick={() => setEvents([])}>
          清空
        </Button>
        <span>
          自动滚动 <Switch checked={autoScroll} onChange={setAutoScroll} size="small" />
        </span>
        <Tooltip
          title={
            <div style={{ fontSize: 12 }}>
              缓存约 5000 条；过新事件来时旧的会被丢
              <br />
              <code>seq</code> / <code>dropped</code> / <code>ring</code> 字段折叠到事件详情
            </div>
          }
        >
          <span style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12, cursor: 'help' }}>
            ⓘ 缓存状态
          </span>
        </Tooltip>
      </Space>

      <div
        style={{
          border: '1px solid var(--ant-color-border)',
          borderRadius: 8,
          height: 520,
          overflowY: 'auto',
          padding: 8,
          background: 'var(--ant-color-bg-container)',
        }}
      >
        {filtered.length === 0 ? (
          <Empty description={paused ? '已暂停 — 点继续恢复' : '等待事件中…'} />
        ) : (
          filtered.map((e) => (
            <EventRow
              key={e.seq}
              event={e}
              devices={devices}
              onCreatePatternFromMiss={() => setMissForNewPattern(e)}
            />
          ))
        )}
        <div ref={listEndRef} />
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
          🔧 开发者备注 — 实时事件流 (SSE) 客户端实现要点
        </summary>
        <div style={{ fontSize: 12, marginTop: 8, color: 'var(--ant-color-text-secondary)' }}>
          <code>GET /api/v1/v2/exhibits/{exhibitId}/diag/events/stream?token=&lt;...&gt;</code>
          <br />
          浏览器 EventSource 不支持 header → token 走 query。frame 格式 <code>data: {`{json}`}\n\n</code>
          ；<code>:ping</code> 行（前缀冒号）是 25s keepalive，忽略即可。启动期回放最近 200 条历史；
          断线 EventSource 默认 3s 自动重连，UI 仅做 banner 提示。
        </div>
      </details>

      <RecordingDialog
        open={recordingDialogOpen}
        onCancel={() => setRecordingDialogOpen(false)}
        onSubmit={(v) => handleStartRecording.mutate(v)}
        loading={handleStartRecording.isPending}
      />
      <InjectDialog
        open={injectDialogOpen}
        onCancel={() => setInjectDialogOpen(false)}
        onSubmit={(v) => handleInject.mutate(v)}
        loading={handleInject.isPending}
      />
      <CreatePatternFromMissDialog
        event={missForNewPattern}
        hallId={hallId}
        onClose={() => setMissForNewPattern(null)}
      />
    </div>
  );
}

/* ==================== Event Row ==================== */

interface EventRowProps {
  event: DebugEvent;
  devices: { id: number; name: string }[];
  onCreatePatternFromMiss: () => void;
}

function EventRow({ event, devices, onCreatePatternFromMiss }: EventRowProps) {
  const device = devices.find((d) => d.id === event.device_id);
  const ts = new Date(event.timestamp);
  const tsLabel = `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}.${pad3(ts.getMilliseconds())}`;
  const payload = event.payload as Record<string, unknown>;
  const isHeartbeat = event.kind === 'inbound' && payload?.is_heartbeat === true;

  return (
    <div
      style={{
        padding: '6px 8px',
        marginBottom: 4,
        background: isHeartbeat
          ? 'rgba(239, 68, 68, 0.04)'
          : event.kind === 'listener_miss'
          ? 'rgba(250, 140, 22, 0.06)'
          : event.kind === 'error'
          ? 'rgba(255, 77, 79, 0.06)'
          : 'transparent',
        borderLeft: `3px solid ${EVENT_KIND_COLOR[event.kind]}`,
        borderRadius: 4,
        fontSize: 12,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <Space size={8} style={{ marginBottom: 4 }}>
        <span style={{ color: 'var(--ant-color-text-tertiary)' }}>{tsLabel}</span>
        <Tag color={EVENT_KIND_COLOR[event.kind]} style={{ margin: 0 }}>
          {EVENT_KIND_LABEL[event.kind]}
        </Tag>
        {isHeartbeat && (
          <Tag color="#ef4444" style={{ margin: 0 }}>
            ♥ 心跳
            {payload?.heartbeat_label ? `（${payload.heartbeat_label}）` : ''}
          </Tag>
        )}
        {device && <span style={{ fontWeight: 500 }}>{device.name}</span>}
        {event.source && event.source.kind !== 'Manual' && (
          <span style={{ color: 'var(--ant-color-text-tertiary)' }}>
            来自 {event.source.kind}
            {event.source.ref ? ` ${JSON.stringify(event.source.ref)}` : ''}
          </span>
        )}
        {event.latency_ms !== undefined && (
          <span style={{ color: 'var(--ant-color-text-tertiary)' }}>+{event.latency_ms}ms</span>
        )}
      </Space>

      <PayloadRender event={event} />

      {event.kind === 'listener_miss' && Boolean(payload.suggest_pattern) && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            background: '#fffbe6',
            border: '1px dashed #faad14',
            borderRadius: 4,
          }}
        >
          💡 ExCS 帮你猜了一个匹配规则：
          <code style={{ marginLeft: 6 }}>
            {(payload.suggest_pattern as [string, string])[0]}：
            {(payload.suggest_pattern as [string, string])[1]}
          </code>
          <Button
            size="small"
            type="link"
            icon={<PlusOutlined />}
            onClick={onCreatePatternFromMiss}
          >
            用这个规则新建匹配
          </Button>
        </div>
      )}
    </div>
  );
}

function PayloadRender({ event }: { event: DebugEvent }) {
  const payload = event.payload as Record<string, unknown>;
  if (event.kind === 'inbound' || event.kind === 'listener_miss') {
    const hex = payload.bytes_hex as string | undefined;
    const ascii = payload.bytes_ascii as string | undefined;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 11 }}>
        <span style={{ color: 'var(--ant-color-text-tertiary)' }}>来源</span>
        <code>{String(payload.resource ?? payload.peer ?? '?')}</code>
        {hex && (
          <>
            <span style={{ color: 'var(--ant-color-text-tertiary)' }}>字节</span>
            <code style={{ wordBreak: 'break-all' }}>{hex}</code>
          </>
        )}
        {ascii && (
          <>
            <span style={{ color: 'var(--ant-color-text-tertiary)' }}>可读</span>
            <code style={{ wordBreak: 'break-all' }}>{ascii}</code>
          </>
        )}
      </div>
    );
  }
  if (event.kind === 'outbound') {
    return (
      <div style={{ fontSize: 11 }}>
        <code>{String(payload.command_code ?? payload.webhook ?? '?')}</code>
        {Boolean(payload.params) && (
          <code style={{ marginLeft: 8, color: 'var(--ant-color-text-tertiary)' }}>
            {JSON.stringify(payload.params)}
          </code>
        )}
      </div>
    );
  }
  if (event.kind === 'listener_hit') {
    return (
      <div style={{ fontSize: 11 }}>
        命中{' '}
        <code>
          {String(payload.pattern_kind)}：{String(payload.pattern)}
        </code>
        {Array.isArray(payload.captures) && payload.captures.length > 0 && (
          <span style={{ marginLeft: 8 }}>
            抓到 [{(payload.captures as string[]).join(', ')}]
          </span>
        )}
      </div>
    );
  }
  if (event.kind === 'trigger_fire') {
    return (
      <div style={{ fontSize: 11 }}>
        动作：<code>{String(payload.kind)}</code>
        {Array.isArray(payload.captures) && payload.captures.length > 0 && (
          <span style={{ marginLeft: 8 }}>
            参数 [{(payload.captures as string[]).join(', ')}]
          </span>
        )}
      </div>
    );
  }
  if (event.kind === 'error') {
    return (
      <div style={{ fontSize: 11, color: '#ff4d4f' }}>
        {String(payload.type ?? '')} {String(payload.message ?? event.error?.message ?? '')}
      </div>
    );
  }
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/* ==================== Recording Dialog ==================== */

function RecordingDialog({
  open,
  onCancel,
  onSubmit,
  loading,
}: {
  open: boolean;
  onCancel: () => void;
  onSubmit: (v: { duration_min: number; note: string }) => void;
  loading: boolean;
}) {
  const [form] = Form.useForm<{ duration_min: number; note: string }>();
  return (
    <Modal
      title="开始录制"
      open={open}
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onSubmit)}
      okButtonProps={{ loading }}
      destroyOnClose
      afterOpenChange={(o) => {
        if (o) form.setFieldsValue({ duration_min: 60, note: '' });
      }}
    >
      <Alert
        type="info"
        showIcon
        message="录制会把调试事件保存到云端"
        description="工程师可以下载下来分析（用于事后排障）"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item
          name="duration_min"
          label="录多久"
          rules={[{ required: true }]}
          extra="选一个时长（最长 8 小时）。到点会自动停录。"
        >
          <Radio.Group options={RECORDING_DURATIONS} />
        </Form.Item>
        <Form.Item
          name="note"
          label="录制原因"
          rules={[
            { required: true, message: '必填' },
            { min: 5, message: '至少 5 个字' },
          ]}
          extra="事后排障要靠这个找到对应录制，请写清楚一点"
        >
          <Input.TextArea rows={3} maxLength={500} placeholder="如：客户反映 14:30 灯光异常，复现期间录一次" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RecordingResultView({ status }: { status: RecordingStatus }) {
  return (
    <div>
      <p>
        <strong>开始时刻：</strong>
        {status.started_at}
      </p>
      <p>
        <strong>录制时长：</strong>
        {status.planned_duration_min} 分钟
      </p>
      <p>
        <strong>录制原因：</strong>
        {status.note}
      </p>
      <p>
        <strong>共生成 {status.slices_count ?? 0} 个文件：</strong>
      </p>
      {status.slice_urls && status.slice_urls.length > 0 ? (
        <ul style={{ paddingLeft: 20 }}>
          {status.slice_urls.map((url, i) => (
            <li key={i}>
              <a href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Empty description="无切片" />
      )}
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        message="把链接发给 ExCS 工程师做分析"
        description="链接为阿里云 OSS 预签名 GET URL，24 小时后过期；过期后请重开本对话框拉取最新链接。"
      />
    </div>
  );
}

/* ==================== Inject Dialog ==================== */

function InjectDialog({
  open,
  onCancel,
  onSubmit,
  loading,
}: {
  open: boolean;
  onCancel: () => void;
  onSubmit: (v: {
    resource_kind: ResourceKind;
    identifier: string;
    text?: string;
    hex?: string;
  }) => void;
  loading: boolean;
}) {
  const [form] = Form.useForm<{
    resource_kind: ResourceKind;
    identifier: string;
    payload_kind: 'text' | 'hex';
    payload: string;
  }>();
  return (
    <Modal
      title="模拟收一笔数据"
      open={open}
      onCancel={onCancel}
      onOk={async () => {
        const v = await form.validateFields();
        onSubmit({
          resource_kind: v.resource_kind,
          identifier: v.identifier,
          text: v.payload_kind === 'text' ? v.payload : undefined,
          hex: v.payload_kind === 'hex' ? v.payload : undefined,
        });
      }}
      okButtonProps={{ loading }}
      destroyOnClose
      afterOpenChange={(o) => {
        if (o) form.setFieldsValue({ resource_kind: 'tcp_port', payload_kind: 'text' });
      }}
    >
      <Alert
        type="info"
        showIcon
        message="没有真实硬件时，可以从这里假装一台设备发了数据，用于测触发器逻辑"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item name="resource_kind" label="从哪个端口" rules={[{ required: true }]}>
          <Select
            options={(Object.keys(RESOURCE_KIND_LABEL) as ResourceKind[]).map((k) => ({
              value: k,
              label: RESOURCE_KIND_LABEL[k],
            }))}
          />
        </Form.Item>
        <Form.Item
          name="identifier"
          label="端口编号 / 路径"
          rules={[{ required: true, message: '必填' }]}
          extra="如 :2000 / /dev/cu.usbserial-1 / universe:1"
        >
          <Input />
        </Form.Item>
        <Form.Item name="payload_kind" label="数据内容" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio value="text">文本</Radio>
            <Radio value="hex">字节（hex）</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="payload" label="数据" rules={[{ required: true, message: '必填' }]}>
          <Input.TextArea rows={3} placeholder="STAGE_START 或 FF 01 02 0A" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ==================== "用 suggest_pattern 新建" 跳转 ==================== */

function CreatePatternFromMissDialog({
  event,
  hallId,
  onClose,
}: {
  event: DebugEvent | null;
  hallId: number;
  onClose: () => void;
}) {
  if (!event) return null;
  const payload = event.payload as Record<string, unknown>;
  const suggest = payload.suggest_pattern as [PatternKind, string] | undefined;
  if (!suggest) return null;
  return (
    <Drawer title="用这个规则新建触发器" open={!!event} onClose={onClose} width={600}>
      <Alert
        type="info"
        showIcon
        message="ExCS 已自动生成一条建议规则"
        description="去触发器列表点「新建触发器」，复制下面的字段填进去即可。"
        style={{ marginBottom: 16 }}
      />
      <p>
        <strong>匹配方式：</strong>
        <Tag>{suggest[0]}</Tag>
      </p>
      <p>
        <strong>规则：</strong>
        <code>{suggest[1]}</code>
      </p>
      <p>
        <strong>原始数据：</strong>
        <code>{String(payload.bytes_ascii ?? payload.bytes_hex ?? '?')}</code>
      </p>
      <Button
        type="primary"
        href={`/halls/${hallId}/triggers`}
        target="_blank"
      >
        去触发器列表新建
      </Button>
    </Drawer>
  );
}

// keep Progress import alive (used by recording UI in future expansion)
void Progress;
void InputNumber;
