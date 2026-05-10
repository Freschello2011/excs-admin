/**
 * device-mgmt-v2 P9-E.2 — 设备新建抽屉「扫描发现」tab。
 *
 * 流程：
 *   1. admin 选要扫描的协议（默认勾 PJLink / Art-Net / Modbus / Smyoo）
 *   2. 点 [开始扫描] → POST /api/v1/v2/halls/:id/discovery/scan → task_id
 *   3. 轮询 GET /api/v1/v2/halls/:id/discovery/results 直到 partial=false
 *   4. 列结果；admin 点 [+ 添加] → 触发 onPrefill 把推断的 kind / connector_ref /
 *      connection_config 喂给上层 drawer，drawer 跳到 step 1（配连接参数）
 *
 * 协议→connector 推断（mockup 04-device-discovery-drawer.html）：
 *   pjlink   → protocol kind, protocol=pjlink
 *   artnet   → raw_transport, transport=artnet
 *   modbus   → raw_transport, transport=modbus, host + port=502
 *   smyoo    → preset kind, preset_key=shanyou_switch_16ch
 *   wol      → raw_transport, transport=udp（兜底；admin 自填 MAC）
 *   serial   → raw_transport, transport=serial, port=endpoint
 *
 * 不展示扫描发现按钮的状态：mode='disconnected'（点了无意义）—— 上层 drawer 据 store 灰掉 tab。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Empty, Input, Select, Space, Spin, Tag, Typography } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { discoveryApi, pollDiscoveryResults, type PollHandle } from '@/api/discovery';
import { vendorCredentialApi } from '@/api/vendorCredential';
import {
  PROTOCOL_LABEL,
  PROTOCOL_ICON,
  PROTOCOL_DESC,
  CONFIDENCE_LABEL,
  type ProbeProtocol,
  type DiscoveryResult,
  type DiscoveryResultSnapshot,
} from '@/types/discovery';
import type {
  ConnectorKind,
  ConnectorRef,
  TransportKind,
} from '@/types/deviceConnector';

export interface DiscoveryPrefill {
  kind: ConnectorKind;
  ref: ConnectorRef;
  /** raw_transport 时 step1 单独存的 transport */
  transport?: TransportKind;
  connectionConfig: Record<string, unknown>;
  /** UI 展示用：哪一行结果被加 */
  sourceEndpoint: string;
  /** display name from scan; drawer 拿来当默认设备名 */
  suggestedName: string;
}

interface Props {
  hallId: number;
  /** 已配好闪优凭据时传 id；smyoo 探测必填，否则后端 412 */
  smyooCredentialId?: number;
  onPrefill: (prefill: DiscoveryPrefill) => void;
}

const DEFAULT_SELECTED: ProbeProtocol[] = ['pjlink', 'artnet', 'modbus', 'smyoo'];
const ALL_PROTOCOLS: ProbeProtocol[] = ['pjlink', 'artnet', 'modbus', 'smyoo', 'wol', 'serial'];

export default function DiscoveryStep({ hallId, smyooCredentialId, onPrefill }: Props) {
  const { message } = useMessage();
  const [protocols, setProtocols] = useState<ProbeProtocol[]>(DEFAULT_SELECTED);
  const [scanning, setScanning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<DiscoveryResultSnapshot | null>(null);
  const [addedEndpoints, setAddedEndpoints] = useState<Set<string>>(new Set());
  const [taskId, setTaskId] = useState<string | null>(null);
  // 网段输入：默认空 = hall_master 自动检测；接受 "192.168.50.0/24, 192.168.20.0/24" 逗号分隔
  const [cidrsInput, setCidrsInput] = useState('');
  // 当 protocols 含 smyoo 时让 admin 在抽屉内直接选凭据；优先级：prop > admin 主动选 > 默认第一条
  const [internalCredId, setInternalCredId] = useState<number | undefined>(undefined);

  const pollRef = useRef<PollHandle | null>(null);

  // smyoo 凭据下拉数据
  const { data: smyooCreds = [] } = useQuery({
    queryKey: ['vendor-credentials', 'smyoo'],
    queryFn: () => vendorCredentialApi.list('smyoo'),
    select: (res) => res.data.data ?? [],
    enabled: protocols.includes('smyoo'),
  });

  // 默认凭据（首条）— 推导而非 effect+setState
  const defaultCredId = smyooCreds.length > 0 ? smyooCreds[0].id : undefined;
  const effectiveCredId = smyooCredentialId ?? internalCredId ?? defaultCredId;

  useEffect(() => {
    return () => {
      pollRef.current?.cancel();
    };
  }, []);

  /** 解析 cidrs 输入（逗号 / 空白 / 中文逗号分隔，去重）。空 → undefined（hall_master 自检）。 */
  const parseCidrs = (raw: string): string[] | undefined => {
    const items = raw
      .split(/[,\s，]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? Array.from(new Set(items)) : undefined;
  };

  const startScan = async () => {
    if (protocols.length === 0) {
      message.warning('至少选一个协议');
      return;
    }
    if (protocols.includes('smyoo') && !effectiveCredId) {
      message.warning('扫描闪优需要先配好厂家凭据（平台数据配置 → 厂家凭据），或取消勾选闪优');
      return;
    }
    pollRef.current?.cancel();
    setSnapshot(null);
    setScanning(true);
    setPaused(false);
    setAddedEndpoints(new Set());
    const cidrs = parseCidrs(cidrsInput);
    try {
      const res = await discoveryApi.scan(hallId, {
        protocols,
        ...(effectiveCredId ? { vendor_credential_id: effectiveCredId } : {}),
        ...(cidrs ? { cidrs } : {}),
      });
      const data = res.data.data;
      if (res.data.code !== 0 || !data) {
        message.error(res.data.message || '扫描请求失败');
        setScanning(false);
        return;
      }
      setTaskId(data.task_id);
      message.info(`扫描已启动（${data.accepted_protocols?.join(', ') || protocols.join(', ')}），约 ${data.eta_seconds}s 完成`);

      pollRef.current = pollDiscoveryResults({
        hallId,
        taskId: data.task_id,
        intervalMs: 1500,
        onSnapshot: (snap) => setSnapshot(snap),
        onDone: (snap) => {
          setScanning(false);
          if (snap && !snap.partial) {
            const errs = snap.errors ?? [];
            if (errs.length > 0) {
              message.warning(`部分协议出错：${errs.map((e) => e.protocol).join(', ')}`);
            }
            message.success(`扫描完成，发现 ${snap.results.length} 台设备`);
          }
        },
      });
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      const status = e.response?.status;
      if (status === 412) {
        message.error('闪优凭据缺失或失效，请到「平台数据配置 → 厂家凭据」补一条');
      } else if (status === 503) {
        message.error('hall_master 不可达；先确认展厅 App 在线再试');
      } else {
        message.error(e.response?.data?.message || '扫描请求失败');
      }
      setScanning(false);
    }
  };

  const stopScan = () => {
    pollRef.current?.cancel();
    setScanning(false);
    setPaused(false);
  };

  const togglePause = () => {
    if (!pollRef.current) return;
    if (paused) {
      pollRef.current.resume();
      setPaused(false);
    } else {
      pollRef.current.pause();
      setPaused(true);
    }
  };

  const results = snapshot?.results ?? [];
  const groupedByProtocol = useMemo(() => {
    const m = new Map<ProbeProtocol, DiscoveryResult[]>();
    for (const r of results) {
      const list = m.get(r.protocol) ?? [];
      list.push(r);
      m.set(r.protocol, list);
    }
    return m;
  }, [results]);

  const handleAdd = (r: DiscoveryResult) => {
    const prefill = inferPrefill(r);
    if (!prefill) {
      message.warning(`暂不支持自动预填 ${r.protocol}，请手动选接入方式`);
      return;
    }
    setAddedEndpoints((prev) => new Set(prev).add(r.endpoint));
    onPrefill(prefill);
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="实施小贴士"
        description="先把所有设备插上电、连上局域网，再点[开始扫描]——能识别的协议会自动出现，一键预填新建表单，比手动建快 3 倍。"
      />

      <Typography.Text strong>选要扫描的协议（可多选）</Typography.Text>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          marginTop: 8,
          marginBottom: 16,
        }}
      >
        {ALL_PROTOCOLS.map((p) => (
          <label
            key={p}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--ant-color-border)',
              borderRadius: 6,
              background: 'var(--ant-color-fill-quaternary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: scanning ? 'not-allowed' : 'pointer',
              opacity: scanning ? 0.6 : 1,
              fontSize: 13,
            }}
          >
            <Checkbox
              disabled={scanning}
              checked={protocols.includes(p)}
              onChange={(e) =>
                setProtocols((prev) =>
                  e.target.checked ? [...prev, p] : prev.filter((x) => x !== p),
                )
              }
            />
            <span>{PROTOCOL_ICON[p]}</span>
            <span style={{ fontWeight: 500 }}>{PROTOCOL_LABEL[p]}</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 11.5,
                color: 'var(--ant-color-text-tertiary)',
              }}
            >
              {PROTOCOL_DESC[p]}
            </span>
          </label>
        ))}
      </div>

      {/* 扫描限制网段（默认空 = hall_master 自动检测） */}
      <div style={{ marginBottom: 12 }}>
        <Typography.Text style={{ fontSize: 12 }} type="secondary">
          扫描网段（可选）
        </Typography.Text>
        <Input
          size="small"
          placeholder="留空 = hall_master 自动用接到的 RFC1918 /24；或填 192.168.50.0/24, 192.168.20.0/24"
          value={cidrsInput}
          onChange={(e) => setCidrsInput(e.target.value)}
          disabled={scanning}
          style={{ fontFamily: 'var(--font-family-mono, ui-monospace, monospace)', fontSize: 12 }}
        />
      </div>

      {/* 闪优 vendor_credential 选择（仅勾选 smyoo 时显示，且 admin 没主动传 prop 时） */}
      {protocols.includes('smyoo') && smyooCredentialId == null && (
        <div style={{ marginBottom: 12 }}>
          <Typography.Text style={{ fontSize: 12 }} type="secondary">
            闪优厂家账号（必选）
          </Typography.Text>
          {smyooCreds.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              message={
                <span style={{ fontSize: 12 }}>
                  尚无 vendor_key=smyoo 的厂家凭据 ——{' '}
                  <a href="/platform/device-catalog" target="_blank" rel="noreferrer">
                    去新建
                  </a>{' '}
                  后再扫描，或取消勾选闪优。
                </span>
              }
              style={{ padding: '4px 12px' }}
            />
          ) : (
            <Select
              size="small"
              style={{ width: '100%' }}
              placeholder="选择厂家账号"
              value={effectiveCredId}
              onChange={setInternalCredId}
              disabled={scanning}
              options={smyooCreds.map((c) => ({
                value: c.id,
                label: `${c.label}${c.phone_masked ? ` · ${c.phone_masked}` : ''}${c.complete ? '' : ' · ⚠ 缺字段'}`,
              }))}
            />
          )}
        </div>
      )}

      <Space style={{ marginBottom: 16 }}>
        {!scanning ? (
          <Button type="primary" onClick={startScan}>
            🔍 开始扫描
          </Button>
        ) : (
          <>
            <Button onClick={togglePause}>{paused ? '▶ 继续' : '⏸ 暂停'}</Button>
            <Button onClick={stopScan} danger>
              ■ 中止
            </Button>
          </>
        )}
        {snapshot && !snapshot.partial && (
          <Button onClick={startScan}>⟳ 重新扫描</Button>
        )}
      </Space>

      {scanning && (
        <div
          style={{
            background: paused ? 'var(--ant-color-warning-bg)' : 'var(--ant-color-info-bg)',
            border: `1px solid ${paused ? 'var(--ant-color-warning-border)' : 'var(--ant-color-info-border)'}`,
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {paused ? <span style={{ fontSize: 18 }}>⏸</span> : <Spin size="small" />}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>
              {paused ? '已暂停拉取（后端 task 仍在跑，点 [▶ 继续] 恢复显示）' : '扫描进行中…'}
              {snapshot && ` 已找到 ${snapshot.results.length} 台`}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ant-color-text-secondary)' }}>
              {protocols.map((p) => PROTOCOL_LABEL[p]).join(' · ')}
              {taskId && ` · task ${taskId.slice(0, 16)}…`}
            </div>
          </div>
        </div>
      )}

      {snapshot && results.length === 0 && !scanning && (
        <Empty description="未发现任何设备 — 检查局域网连通性 / 设备是否上电 / 协议是否对路" />
      )}

      {results.length > 0 && (
        <>
          <Typography.Text strong>
            已发现 {results.length} 台
            <Typography.Text
              type="secondary"
              style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}
            >
              点 [+ 添加] 预填新建表单 → 进步骤 2
            </Typography.Text>
          </Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {Array.from(groupedByProtocol.entries()).map(([proto, items]) => (
              <div key={proto}>
                {items.map((r) => {
                  const added = addedEndpoints.has(r.endpoint);
                  return (
                    <ResultRow
                      key={`${r.protocol}-${r.endpoint}`}
                      result={r}
                      added={added}
                      onAdd={() => handleAdd(r)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {snapshot?.errors && snapshot.errors.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="部分协议出错"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {snapshot.errors.map((e, i) => (
                <li key={i}>
                  <strong>{e.protocol}</strong>：{e.message}
                </li>
              ))}
            </ul>
          }
        />
      )}

      {snapshot && !snapshot.partial && results.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="未匹配？"
          description="切到上方 [手动选接入方式] 自己挑，或回这里改协议复选项重扫。"
        />
      )}
    </div>
  );
}

function ResultRow({
  result,
  added,
  onAdd,
}: {
  result: DiscoveryResult;
  added: boolean;
  onAdd: () => void;
}) {
  const confColor =
    result.confidence === 'high' ? 'success' : result.confidence === 'medium' ? 'warning' : 'default';
  const hintsLine = Object.entries(result.hints)
    .slice(0, 4)
    .map(([k, v]) => `${k}=${v}`)
    .join(' / ');
  return (
    <div
      style={{
        background: added ? 'var(--ant-color-success-bg)' : 'var(--ant-color-fill-quaternary)',
        border: `1px solid ${added ? 'var(--ant-color-success-border)' : 'var(--ant-color-border)'}`,
        borderRadius: 8,
        padding: '10px 12px',
        display: 'grid',
        gridTemplateColumns: '24px 1fr auto auto auto',
        gap: 10,
        alignItems: 'center',
        fontSize: 13,
        marginBottom: 6,
      }}
    >
      <div style={{ fontSize: 18, textAlign: 'center' }}>{PROTOCOL_ICON[result.protocol]}</div>
      <div>
        <div style={{ fontWeight: 500 }}>
          {result.display_name} · <code>{result.endpoint}</code>
        </div>
        {hintsLine && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-secondary)',
              fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
              marginTop: 2,
            }}
          >
            {hintsLine}
          </div>
        )}
      </div>
      <Tag>{PROTOCOL_LABEL[result.protocol]}</Tag>
      <Tag color={confColor}>{CONFIDENCE_LABEL[result.confidence]}</Tag>
      {added ? (
        <span style={{ fontSize: 12, color: 'var(--ant-color-success)', fontWeight: 600 }}>
          ✓ 已添加
        </span>
      ) : (
        <Button type="primary" size="small" onClick={onAdd}>
          + 添加
        </Button>
      )}
    </div>
  );
}

/** 推断 connector_kind / ref / connection_config — 从扫描结果到 device drawer 的桥。 */
function inferPrefill(r: DiscoveryResult): DiscoveryPrefill | null {
  switch (r.protocol) {
    case 'pjlink':
      return {
        kind: 'protocol',
        ref: { protocol: 'pjlink' },
        connectionConfig: { host: r.endpoint },
        sourceEndpoint: r.endpoint,
        suggestedName: r.display_name,
      };
    case 'artnet':
      return {
        kind: 'raw_transport',
        ref: { transport: 'artnet' },
        transport: 'artnet',
        connectionConfig: { host: r.endpoint },
        sourceEndpoint: r.endpoint,
        suggestedName: r.display_name,
      };
    case 'modbus': {
      const [host, portStr] = r.endpoint.split(':');
      const port = portStr ? Number(portStr) : 502;
      return {
        kind: 'raw_transport',
        ref: { transport: 'modbus' },
        transport: 'modbus',
        connectionConfig: { host, port },
        sourceEndpoint: r.endpoint,
        suggestedName: r.display_name,
      };
    }
    case 'smyoo':
      return {
        kind: 'preset',
        ref: { preset_key: 'shanyou_switch_16ch' },
        connectionConfig: { deviceid: r.endpoint },
        sourceEndpoint: r.endpoint,
        suggestedName: r.display_name,
      };
    case 'serial':
      return {
        kind: 'raw_transport',
        ref: { transport: 'serial' },
        transport: 'serial',
        connectionConfig: { port: r.endpoint, baud: 9600 },
        sourceEndpoint: r.endpoint,
        suggestedName: r.display_name,
      };
    case 'wol':
      return {
        kind: 'raw_transport',
        ref: { transport: 'udp' },
        transport: 'udp',
        connectionConfig: { host: r.endpoint, port: 9 },
        sourceEndpoint: r.endpoint,
        suggestedName: r.display_name,
      };
    default:
      return null;
  }
}
