/**
 * device-mgmt-v2 P-C（ADR-0017）— 调试台「命令清单」tab。
 *
 * 仅 raw_transport 设备显示。功能：
 *   - 行内编辑 inline_commands（共用 InlineCommandsTable）
 *   - 每行 [▶ 测试] → POST /v2/devices/:id/inline-commands/test（云端转发）
 *   - 整页 [保存全部] → PUT /api/v1/devices/:id 全量替换 inline_commands + connection_config
 *   - dirty 状态指示 + [放弃改动]
 *
 * Step 7（ADR-0030 §D4 + §D1 + §D2）：
 *   - 顶部 profile chips 行（5 选 1）批量填 connection_mode + heartbeat + 全部命令的 expect_response.mode
 *   - connection_mode（短连接 / 长连接）+ 心跳 enable / interval 内联编辑
 *   - 保存全部 = 同时 PUT inline_commands + connection_config 合并
 *
 * 数据来源：bundle.device.inline_commands + bundle.device.connection_config（仅 raw_transport 后端会带）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, InputNumber, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMessage } from '@/hooks/useMessage';
import { deviceV2Api } from '@/api/deviceConnector';
import InlineCommandsTable, {
  ensureRowKey,
  prepareInlineCommandsForSave,
  validateInlineCommands,
  type InlineCommandRow,
} from '@/components/device/InlineCommandsTable';
import {
  isInlineCommandReferencedError,
  showInlineCommandReferencedModal,
} from '@/components/device/showInlineCommandReferencedModal';
import { useInlineCommandCodeAutogenEnabled } from '@/components/device/useInlineCommandCodeAutogenEnabled';
import type {
  ConnectionMode,
  DeviceCommand,
  HeartbeatConfig,
} from '@/types/deviceConnector';
import {
  RAW_TRANSPORT_PROFILES,
  detectProfile,
  type RawTransportProfileKey,
} from '@/components/device/rawTransportProfiles';

const { Text } = Typography;

interface Props {
  deviceId: number;
  initial: DeviceCommand[];
  /** 设备 connection_config 透传（free-form jsonb；本 tab 读写 connection_mode + heartbeat 子键） */
  initialConnectionConfig?: Record<string, unknown>;
  onCountChange?: (count: number) => void;
}

/** 从 connection_config 解出 connection_mode（缺省 short，ADR-0030 §D1 默认） */
function readConnectionMode(cfg: Record<string, unknown> | undefined): ConnectionMode {
  const v = cfg?.connection_mode;
  return v === 'persistent' ? 'persistent' : 'short';
}

/** 从 connection_config 解出 heartbeat（缺省 enabled=false） */
function readHeartbeat(cfg: Record<string, unknown> | undefined): HeartbeatConfig {
  const hb = cfg?.heartbeat;
  if (!hb || typeof hb !== 'object') return { enabled: false };
  const o = hb as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    interval_ms: typeof o.interval_ms === 'number' ? o.interval_ms : undefined,
    command_code: typeof o.command_code === 'string' ? o.command_code : undefined,
    miss_threshold: typeof o.miss_threshold === 'number' ? o.miss_threshold : undefined,
  };
}

function heartbeatEqual(a: HeartbeatConfig, b: HeartbeatConfig): boolean {
  return (
    (a.enabled ?? false) === (b.enabled ?? false) &&
    (a.interval_ms ?? 0) === (b.interval_ms ?? 0) &&
    (a.command_code ?? '') === (b.command_code ?? '') &&
    (a.miss_threshold ?? 0) === (b.miss_threshold ?? 0)
  );
}

function expectResponseEqual(a: InlineCommandRow['expect_response'], b: InlineCommandRow['expect_response']): boolean {
  const am = a?.mode ?? '';
  const bm = b?.mode ?? '';
  if (am !== bm) return false;
  if ((a?.match_pattern ?? '') !== (b?.match_pattern ?? '')) return false;
  if ((a?.fail_pattern ?? '') !== (b?.fail_pattern ?? '')) return false;
  if ((a?.read_timeout_ms ?? 0) !== (b?.read_timeout_ms ?? 0)) return false;
  if ((a?.max_bytes ?? 0) !== (b?.max_bytes ?? 0)) return false;
  return true;
}

function rowsEqual(a: InlineCommandRow[], b: InlineCommandRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      (x.code ?? '') !== (y.code ?? '') ||
      (x.name ?? '') !== (y.name ?? '') ||
      (x.kind ?? 'control') !== (y.kind ?? 'control') ||
      (x.request ?? '') !== (y.request ?? '') ||
      (x.request_format ?? 'text') !== (y.request_format ?? 'text') ||
      !expectResponseEqual(x.expect_response, y.expect_response)
    ) {
      return false;
    }
  }
  return true;
}

function withRowKeys(cmds: DeviceCommand[]): InlineCommandRow[] {
  return cmds.map((c, idx) => {
    const r: InlineCommandRow = { ...c };
    ensureRowKey(r, idx);
    return r;
  });
}

export default function InlineCommandsTab({
  deviceId,
  initial,
  initialConnectionConfig,
  onCountChange,
}: Props) {
  const { message, modal } = useMessage();
  const queryClient = useQueryClient();

  // 把后端 cmds 转 row（带 _row key）；记录 baseline 用于 dirty 比较
  const [rows, setRows] = useState<InlineCommandRow[]>(() => withRowKeys(initial));
  const [baseline, setBaseline] = useState<InlineCommandRow[]>(() => withRowKeys(initial));

  // ADR-0030 §D1 + §D2 — connection_mode + heartbeat 编辑态（落 connection_config jsonb 子键）
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(() =>
    readConnectionMode(initialConnectionConfig),
  );
  const [heartbeat, setHeartbeat] = useState<HeartbeatConfig>(() =>
    readHeartbeat(initialConnectionConfig),
  );
  const [baselineConnectionMode, setBaselineConnectionMode] = useState<ConnectionMode>(() =>
    readConnectionMode(initialConnectionConfig),
  );
  const [baselineHeartbeat, setBaselineHeartbeat] = useState<HeartbeatConfig>(() =>
    readHeartbeat(initialConnectionConfig),
  );

  // 后端 bundle 重拉时同步（保存成功 / 外部刷新）
  useEffect(() => {
    const fresh = withRowKeys(initial);
    setRows(fresh);
    setBaseline(fresh);
  }, [initial]);

  useEffect(() => {
    const m = readConnectionMode(initialConnectionConfig);
    const h = readHeartbeat(initialConnectionConfig);
    setConnectionMode(m);
    setHeartbeat(h);
    setBaselineConnectionMode(m);
    setBaselineHeartbeat(h);
  }, [initialConnectionConfig]);

  useEffect(() => {
    onCountChange?.(rows.length);
  }, [rows.length, onCountChange]);

  const autogenEnabled = useInlineCommandCodeAutogenEnabled();
  const connectionDirty =
    connectionMode !== baselineConnectionMode || !heartbeatEqual(heartbeat, baselineHeartbeat);
  const dirty = !rowsEqual(rows, baseline) || connectionDirty;
  const issues = useMemo(
    () => validateInlineCommands(rows, { autogenEnabled }),
    [rows, autogenEnabled],
  );
  const dirtyRowKeys = useMemo(() => {
    const baseByKey = new Map(baseline.map((r) => [r._row, r]));
    const set = new Set<string>();
    rows.forEach((r) => {
      if (!r._row) return;
      const b = baseByKey.get(r._row);
      if (
        !b ||
        (r.code ?? '') !== (b.code ?? '') ||
        (r.name ?? '') !== (b.name ?? '') ||
        (r.kind ?? 'control') !== (b.kind ?? 'control') ||
        (r.request ?? '') !== (b.request ?? '') ||
        (r.request_format ?? 'text') !== (b.request_format ?? 'text') ||
        !expectResponseEqual(r.expect_response, b.expect_response)
      ) {
        set.add(r._row);
      }
    });
    return set;
  }, [rows, baseline]);

  /** 已持久化行 key 集合：baseline 里有此 _row 且 code 非空（旧 code 不可改） */
  const persistedRowKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of baseline) {
      if (r._row && r.code) set.add(r._row);
    }
    return set;
  }, [baseline]);

  /** 当前命中的 profile —— 检测 connection_mode + heartbeat + 全部命令 mode 是否一致命中某 profile */
  const activeProfile: RawTransportProfileKey = useMemo(
    () =>
      detectProfile(
        connectionMode,
        heartbeat,
        rows.map((r) => r.expect_response?.mode),
      ),
    [connectionMode, heartbeat, rows],
  );

  /** 点 chip 批量填充：connection_mode + heartbeat + 每条命令 expect_response.mode（custom 不动） */
  const handlePickProfile = (key: RawTransportProfileKey) => {
    const profile = RAW_TRANSPORT_PROFILES.find((p) => p.key === key);
    if (!profile || profile.key === 'custom') return;
    if (profile.connection_mode) setConnectionMode(profile.connection_mode);
    if (profile.heartbeat) {
      setHeartbeat({
        enabled: profile.heartbeat.enabled,
        interval_ms: profile.heartbeat.interval_ms,
        miss_threshold: profile.heartbeat.miss_threshold,
        // command_code 不在 profile 里，保留用户已选（心跳启用且无 code 时表单层提示）
        command_code: heartbeat.command_code,
      });
    }
    if (profile.expect_response_mode) {
      const newMode = profile.expect_response_mode;
      setRows((prev) =>
        prev.map((r) => {
          const cur = r.expect_response;
          if (cur?.mode === newMode) return r;
          // 切到 echo → 清 match/fail；切到非 match → 不动 match_pattern（用户可能想保留）
          const next: InlineCommandRow['expect_response'] =
            newMode === 'echo'
              ? { mode: 'echo' }
              : { ...(cur ?? {}), mode: newMode };
          return { ...r, expect_response: next };
        }),
      );
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (next: InlineCommandRow[]) => {
      // PRD-inline-command-code-autogen.md D2：保存前一次性把空 code 自动按名字生成
      // P4 feature flag 关闭时跳过 autogen，空 code 走 issues 回报
      const prepared = await prepareInlineCommandsForSave(next, { autogenEnabled });
      if (prepared.issues.length > 0) {
        throw new Error(prepared.issues[0].message);
      }
      const cleaned = prepared.rows.map(({ _row: _drop, ...rest }) => rest);
      // 把 connection_mode + heartbeat 合并进 connection_config，保留其他键（host/port/cascade_units 等）
      const baseCfg: Record<string, unknown> = { ...(initialConnectionConfig ?? {}) };
      baseCfg.connection_mode = connectionMode;
      // 只有 heartbeat.enabled=true 时才落 heartbeat 子对象，否则清掉避免脏数据残留
      if (heartbeat.enabled) {
        const hb: HeartbeatConfig = { enabled: true };
        if (heartbeat.interval_ms) hb.interval_ms = heartbeat.interval_ms;
        if (heartbeat.command_code) hb.command_code = heartbeat.command_code;
        if (heartbeat.miss_threshold) hb.miss_threshold = heartbeat.miss_threshold;
        baseCfg.heartbeat = hb;
      } else {
        delete baseCfg.heartbeat;
      }
      // PUT /api/v1/devices/:id —— deviceV2Api.update 用 Partial<CreateDeviceV2Body>。
      // 单次 PUT 同时落 inline_commands + connection_config 保证一致性。
      return deviceV2Api.update(deviceId, {
        inline_commands: cleaned,
        connection_config: baseCfg,
      });
    },
    onSuccess: () => {
      message.success('命令清单 + 连接配置已保存');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
      // 演出时间线编辑器 ActionLibrary 用 effectiveCommands(deviceId)/devices({hall_id})
      // 走 ['devices', ...] 前缀；inline_commands 改完不刷新 → Bug 2 根因
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (err: unknown) => {
      // PRD-inline-command-code-autogen P3.3：409 + INLINE_COMMAND_REFERENCED → 弹结构化 modal
      if (isInlineCommandReferencedError(err)) {
        showInlineCommandReferencedModal(modal, err.__inlineCommandReferenced);
        return;
      }
      const msg = err instanceof Error ? err.message : '保存失败';
      message.error(`保存失败：${msg}`);
    },
  });

  const handleSaveAll = () => {
    if (issues.length > 0) {
      message.error(`命令清单有 ${issues.length} 处错误：${issues[0].message}`);
      return;
    }
    if (rows.length === 0) {
      message.error('自定义协议设备至少需要保留 1 条命令');
      return;
    }
    // 心跳启用但未指定 command_code → 提示但不阻断（允许先保存连接侧、后回头补心跳命令）
    if (heartbeat.enabled && !heartbeat.command_code) {
      modal.confirm({
        title: '心跳已开但还没指定探活命令',
        content:
          '心跳要发哪条命令还没选 —— 保存后心跳暂时不会真的工作，等你回头在「心跳探活命令」下拉选一条 query 命令再保存一次。要继续保存吗？',
        okText: '继续保存',
        cancelText: '回去补一下',
        onOk: () => saveMutation.mutate(rows),
      });
      return;
    }
    saveMutation.mutate(rows);
  };

  const handleDiscard = () => {
    modal.confirm({
      title: '放弃所有未保存改动？',
      content: '将回到上次加载时的状态，已修改 / 新增 / 删除的行 + 连接配置都会还原。',
      okText: '放弃改动',
      okButtonProps: { danger: true },
      cancelText: '继续编辑',
      onOk: () => {
        setRows(withRowKeys(baseline.map(({ _row, ...rest }) => rest)));
        setConnectionMode(baselineConnectionMode);
        setHeartbeat(baselineHeartbeat);
      },
    });
  };

  const handleTest = async (row: InlineCommandRow) => {
    const start = Date.now();
    // dirty / 未保存的 row：走 ad-hoc payload；已存且未改动 → 走 command_code（ADR D3 二选一）
    const isPersistedAndClean = !!row._row && !dirtyRowKeys.has(row._row);
    const body = isPersistedAndClean
      ? { command_code: row.code ?? '' }
      : {
          payload: row.request ?? '',
          format: (row.request_format ?? 'text') as 'text' | 'hex',
        };
    try {
      const res = await deviceV2Api.testInlineCommand(deviceId, body);
      const data = res.data?.data;
      const ok = (data?.status ?? 'failed') !== 'failed';
      // 失败也回传 detail / errorCode 让 InlineCommandsTable 卡片三段渲染（不再 throw 丢上下文）
      return {
        ok,
        latencyMs: data?.latency_ms ?? Date.now() - start,
        detail: data?.detail,
        errorCode: data?.error_code,
        at: Date.now(),
      };
    } catch (err) {
      // ADR-0030 §D8 422 NO_HALL_MASTER_ONLINE / 其他 4xx 也要把 server 给的 message + error_code 透出
      const ax = err as { response?: { data?: { message?: string; data?: { error_code?: string } } } };
      const respData = ax.response?.data;
      return {
        ok: false,
        detail: respData?.message || (err instanceof Error ? err.message : String(err)),
        errorCode: respData?.data?.error_code,
        at: Date.now(),
      };
    }
  };

  // 现存命令里 kind=query 的 code 列表 —— 心跳探活命令下拉用
  const queryCommandOptions = useMemo(
    () =>
      rows
        .filter((r) => r.kind === 'query' && r.code)
        .map((r) => ({ value: r.code!, label: `${r.name || r.code} · ${r.code}` })),
    [rows],
  );

  return (
    <div>
      {/* ADR-0030 §D4 — profile chips：5 选 1 批量填三件事 */}
      <div
        style={{
          padding: '10px 12px',
          background: 'var(--ant-color-fill-quaternary, #f5f5f5)',
          borderRadius: 6,
          marginBottom: 12,
          border: '1px solid var(--ant-color-border-secondary)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: 600, marginRight: 4 }}>
            一键套用画像
          </Text>
          {RAW_TRANSPORT_PROFILES.map((p) => {
            const active = activeProfile === p.key;
            const isCustom = p.key === 'custom';
            return (
              <Tooltip
                key={p.key}
                title={
                  isCustom
                    ? '上面 4 种都不像 —— 当前设置不匹配任何画像，三个字段都自己定'
                    : (
                        <span style={{ fontSize: 12 }}>
                          <strong>{p.label}</strong> — {p.hint}
                          <br />
                          典型：{p.examples}
                          <br />
                          点这里会一键设置：连接方式 +「{p.connection_mode === 'persistent' ? '长连接' : '短连接'}」、心跳「{p.heartbeat?.enabled ? `开 ${(p.heartbeat.interval_ms ?? 30000) / 1000}s` : '关'}」、所有命令的响应判定都改成「{
                            p.expect_response_mode === 'none'
                              ? '发完就算'
                              : p.expect_response_mode === 'any'
                                ? '来啥都行'
                                : p.expect_response_mode === 'match'
                                  ? '看回应'
                                  : '原样回声'
                          }」
                        </span>
                      )
                }
              >
                <Tag.CheckableTag
                  checked={active}
                  onChange={() => {
                    if (!isCustom) handlePickProfile(p.key);
                  }}
                  style={{
                    fontSize: 12,
                    padding: '2px 10px',
                    cursor: isCustom ? 'default' : 'pointer',
                    border: active
                      ? '1px solid var(--ant-color-primary)'
                      : '1px solid var(--ant-color-border)',
                  }}
                >
                  {p.label}
                </Tag.CheckableTag>
              </Tooltip>
            );
          })}
        </div>
        {/* 连接方式 + 心跳 inline 编辑（chip 一键填的就是这两块） */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            fontSize: 12,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              连接方式
            </Text>
            <Select
              size="small"
              value={connectionMode}
              style={{ width: 124 }}
              onChange={(v) => {
                setConnectionMode(v);
                // 切回短连接 → 强制关心跳（D2 不变量：短连接禁用心跳）
                if (v === 'short' && heartbeat.enabled) {
                  setHeartbeat({ ...heartbeat, enabled: false });
                }
              }}
              options={[
                { value: 'short', label: '短连接' },
                { value: 'persistent', label: '长连接' },
              ]}
            />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              心跳
            </Text>
            <Select
              size="small"
              value={heartbeat.enabled ? 'on' : 'off'}
              style={{ width: 80 }}
              disabled={connectionMode === 'short'}
              onChange={(v) => setHeartbeat({ ...heartbeat, enabled: v === 'on' })}
              options={[
                { value: 'off', label: '关' },
                { value: 'on', label: '开' },
              ]}
            />
            {heartbeat.enabled && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  每
                </Text>
                <InputNumber
                  size="small"
                  min={5}
                  max={600}
                  step={5}
                  style={{ width: 78 }}
                  value={Math.round((heartbeat.interval_ms ?? 30000) / 1000)}
                  onChange={(s) =>
                    setHeartbeat({ ...heartbeat, interval_ms: ((s ?? 30) as number) * 1000 })
                  }
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  秒探活，发
                </Text>
                <Select
                  size="small"
                  value={heartbeat.command_code}
                  placeholder="选一条 query 命令"
                  style={{ minWidth: 180 }}
                  allowClear
                  onChange={(v) => setHeartbeat({ ...heartbeat, command_code: v })}
                  options={queryCommandOptions}
                  notFoundContent={
                    <span style={{ fontSize: 12 }}>
                      还没有 query 类型的命令 —— 在下方表格新建一条
                    </span>
                  }
                />
              </>
            )}
          </span>
          {connectionMode === 'short' && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              短连接每发一次重新拨；心跳要先切到长连接
            </Text>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>命令清单</div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          自定义协议设备的命令在此就地编辑，支持每行 [▶ 测试] 即时验证
        </Text>
      </div>

      <InlineCommandsTable
        value={rows}
        onChange={setRows}
        onTest={handleTest}
        showLastTest
        dirtyRowKeys={dirtyRowKeys}
        persistedRowKeys={persistedRowKeys}
        autogenEnabled={autogenEnabled}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        message={
          <span style={{ fontSize: 12 }}>
            <strong>测试发送</strong>会立即发到设备，不会保存到设备命令中（每秒最多 1 次）。
            未保存的行直接发送当前内容；已保存且未改动的行使用已存命令。
          </span>
        }
      />

      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px dashed var(--ant-color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {dirty ? (
          <span
            style={{
              fontSize: 12,
              color: 'var(--ant-color-warning)',
              fontWeight: 500,
            }}
          >
            ● 有未保存改动
            {dirtyRowKeys.size > 0 && `（${dirtyRowKeys.size} 行已修改 / 新增 / 删除`}
            {dirtyRowKeys.size > 0 && connectionDirty && ' + '}
            {connectionDirty && (dirtyRowKeys.size > 0 ? '连接配置改了' : '（连接配置改了')}
            {(dirtyRowKeys.size > 0 || connectionDirty) && '）'}
          </span>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            ✓ 无未保存改动
          </Text>
        )}
        <span style={{ flex: 1 }} />
        <Space>
          <Button onClick={handleDiscard} disabled={!dirty || saveMutation.isPending}>
            放弃改动
          </Button>
          <Button
            type="primary"
            loading={saveMutation.isPending}
            disabled={!dirty || issues.length > 0}
            onClick={handleSaveAll}
          >
            保存全部
          </Button>
        </Space>
      </div>
    </div>
  );
}
