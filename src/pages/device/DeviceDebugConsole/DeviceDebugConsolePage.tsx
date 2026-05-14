/**
 * device-mgmt-v2 P9-C.2 — 设备调试台主页。
 *
 * 独立全屏路由 /devices/:deviceId/debug，4 tab：
 *  [通道矩阵] [指令组] [Raw 终端] [响应解析]
 *
 * 数据流：
 *  1. mount → GET /v2/devices/:id/debug-bundle 一次拉齐
 *  2. mount → 每 5s 拉 GET /v2/devices/:id/state（retained MQTT 缓存）刷新通道状态
 *  3. 单格点击 → POST /commands/device { command: 'channel_on/off', params:{channels:[idx]} }
 *  4. preset 触发 → POST /commands/device → 等下一帧 retained → 实测对比
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, InputNumber, Popover, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { CloseOutlined, EditOutlined, FullscreenOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMessage } from '@/hooks/useMessage';
import { deviceDebugApi, type DeviceDebugBundle } from '@/api/deviceDebug';
import { channelMapApi, type ChannelEntry, type ChannelMap } from '@/api/channelMap';
import { commandPresetApi, type CommandPreset } from '@/api/commandPreset';
import { deviceCommandApi } from '@/api/deviceCommand';
import { deviceV2Api } from '@/api/deviceConnector';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { startEventStream, type SSEClient } from '@/api/diag';
import { CONNECTOR_KIND_LABEL } from '@/lib/deviceConnectorLabels';
import type { DebugEvent, DeviceCommand as DeviceCommandView } from '@/types/deviceConnector';
import ChannelMatrix, { type MatrixVariant } from './ChannelMatrix';
import CascadeSelector from './CascadeSelector';
import ChannelLabelPopover from './ChannelLabelPopover';
import CommandPresetEditor from './CommandPresetEditor';
import CommandPresetList from './CommandPresetList';
import { fromRetainedState, verifyPreset, type PresetVerifyResult } from './state';
import RawStream from './RawStream';
import ResponseParser from './ResponseParser';
import InlineCommandsTab from './InlineCommandsTab';
import styles from './DeviceDebugConsole.module.scss';

const { Text } = Typography;

type TabKey = 'matrix' | 'commands' | 'presets' | 'raw' | 'parser';

export default function DeviceDebugConsolePage() {
  const { deviceId: deviceIdStr } = useParams<{ deviceId: string }>();
  const deviceId = Number(deviceIdStr);
  const navigate = useNavigate();
  const { message } = useMessage();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('matrix');
  const [inlineCmdCount, setInlineCmdCount] = useState<number>(0);
  // bundle 加载后，raw_transport 设备默认落到「命令清单」tab（无通道矩阵）
  const [didDefaultTab, setDidDefaultTab] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [labelPopoverIndexes, setLabelPopoverIndexes] = useState<number[] | null>(null);
  const [presetEditor, setPresetEditor] = useState<{
    open: boolean;
    initial?: Partial<CommandPreset> | null;
    defaultExpectedChannels?: number[];
    editingExisting?: boolean;
  } | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, PresetVerifyResult | undefined>>({});
  const pendingVerifyRef = useRef<{ name: string; preset: CommandPreset } | null>(null);

  // Bundle (device + channel_map + command_presets + max_channel)
  const {
    data: bundle,
    isLoading: bundleLoading,
    error: bundleError,
  } = useQuery({
    queryKey: ['device-debug-bundle', deviceId],
    queryFn: () => deviceDebugApi.bundle(deviceId),
    select: (res) => res.data.data as DeviceDebugBundle,
    enabled: deviceId > 0,
  });

  // Retained state（5s 轮询；前端不缓存超过 1 分钟，订阅式靠 React-Query 自然 refetch）
  const { data: retainedState } = useQuery({
    queryKey: ['device-state', deviceId],
    queryFn: () => deviceV2Api.state(deviceId),
    select: (res) => res.data.data as Record<string, unknown> | null,
    enabled: deviceId > 0,
    refetchInterval: 5000,
  });

  // P9-B 前端补齐：tab bar 右侧统计（最近响应平均 ms / 控制丢包率 60s 滑窗）。
  // 复用 RawStream 同一份 SSE 形态——这里独立订阅一份只用于算 stats，不渲染 events。
  // 简单实现：保存最近 60s 的 outbound / inbound 序列 + 最近 10 个带 latency_ms 的 inbound。
  const exhibitIdForSse = bundle?.device?.exhibit_id ?? 0;
  const hallIdForSse = bundle?.device?.hall_id ?? 0;
  const [statsAvgMs, setStatsAvgMs] = useState<number | null>(null);
  const [statsDropRate, setStatsDropRate] = useState<number>(0);
  const recentLatenciesRef = useRef<number[]>([]);
  const windowEventsRef = useRef<{ ts: number; kind: 'out' | 'in' }[]>([]);
  const sseStatsRef = useRef<SSEClient | null>(null);

  useEffect(() => {
    if (hallIdForSse <= 0 || exhibitIdForSse <= 0 || deviceId <= 0) return;
    const trim = () => {
      const cutoff = Date.now() - 60_000;
      while (windowEventsRef.current.length > 0 && windowEventsRef.current[0].ts < cutoff) {
        windowEventsRef.current.shift();
      }
    };
    const recompute = () => {
      const lat = recentLatenciesRef.current;
      setStatsAvgMs(
        lat.length > 0 ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
      );
      const win = windowEventsRef.current;
      const sent = win.filter((e) => e.kind === 'out').length;
      const recv = win.filter((e) => e.kind === 'in').length;
      const dropped = Math.max(0, sent - recv);
      setStatsDropRate(sent > 0 ? Math.round((dropped / sent) * 100) : 0);
    };
    sseStatsRef.current = startEventStream({
      hallId: hallIdForSse,
      exhibitId: exhibitIdForSse,
      onEvent: (e: DebugEvent) => {
        if (e.device_id != null && e.device_id !== deviceId) return;
        const now = Date.now();
        if (e.kind === 'outbound') {
          windowEventsRef.current.push({ ts: now, kind: 'out' });
        } else if (e.kind === 'inbound') {
          windowEventsRef.current.push({ ts: now, kind: 'in' });
          if (typeof e.latency_ms === 'number' && e.latency_ms > 0) {
            recentLatenciesRef.current.push(e.latency_ms);
            if (recentLatenciesRef.current.length > 10) {
              recentLatenciesRef.current.shift();
            }
          }
        } else {
          return;
        }
        trim();
        recompute();
      },
    });
    const tick = setInterval(() => {
      trim();
      recompute();
    }, 5000);
    return () => {
      sseStatsRef.current?.close();
      sseStatsRef.current = null;
      clearInterval(tick);
    };
  }, [hallIdForSse, exhibitIdForSse, deviceId]);

  // Variant 推断：preset.transport_kind = http → smyoo 风格；其他默认 K32 风格
  const variant: MatrixVariant = useMemo(() => {
    if (!bundle) return 'generic';
    const ref = bundle.device.connector_ref ?? {};
    if (bundle.device.connector_kind === 'preset' && ref.preset_key === 'shanyou_switch_16ch') {
      return 'smyoo16';
    }
    if (bundle.device.connector_kind === 'preset' && bundle.device.connector_kind === 'preset') {
      // K32 / 激光笔接收器：base=32 / 16，serial 类
      return 'k32';
    }
    return 'generic';
  }, [bundle]);

  // 联级 cascade_units PATCH
  const cascadeMutation = useMutation({
    mutationFn: async (units: number) => {
      const cfg = { ...(bundle?.device.connection_config ?? {}), cascade_units: units };
      await hallApi.updateDevice(deviceId, { connection_config: cfg });
    },
    onSuccess: () => {
      message.success('联级配置已更新');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '更新失败';
      message.error(msg);
    },
  });

  // ChannelMap PATCH
  const updateChannelMapMutation = useMutation({
    mutationFn: (next: ChannelMap) => channelMapApi.update(deviceId, { channel_map: next }),
    onSuccess: () => {
      message.success('通道标签已保存');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setLabelPopoverIndexes(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '更新失败';
      message.error(msg);
    },
  });

  // CommandPreset upsert / delete
  // ADR-0024：command_presets 已合流到 effective-commands 的"现场别名"卡。
  // upsert/delete 必须 invalidate effectiveCommands(deviceId)（前缀 ['devices', id]）
  // 让演出编辑器动作库立刻刷新；server 端也已联动失效 60s Redis 缓存。
  const upsertPresetMutation = useMutation({
    mutationFn: ({
      name,
      body,
    }: {
      name: string;
      body: Parameters<typeof commandPresetApi.upsert>[2];
    }) => commandPresetApi.upsert(deviceId, name, body),
    onSuccess: () => {
      message.success('命令组合已保存');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.effectiveCommands(deviceId) });
      setPresetEditor(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '保存失败';
      message.error(msg);
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: (name: string) => commandPresetApi.delete(deviceId, name),
    onSuccess: () => {
      message.success('命令组合已删除');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.effectiveCommands(deviceId) });
    },
  });

  // ADR-0017 P-C：raw_transport 设备首次 bundle 加载后默认落到「命令清单」tab
  // （无通道矩阵；admin 进调试台主要就是为了改命令）。
  useEffect(() => {
    if (didDefaultTab) return;
    if (!bundle) return;
    if (bundle.device.connector_kind === 'raw_transport' && activeTab === 'matrix') {
      setActiveTab('commands');
    }
    setDidDefaultTab(true);
  }, [bundle, didDefaultTab, activeTab]);

  // 监听 retained 变化，跑 verifyPreset 对比
  useEffect(() => {
    const pending = pendingVerifyRef.current;
    if (!pending || !bundle) return;
    const result = verifyPreset(pending.preset, retainedState ?? null, bundle.max_channel);
    if (result) {
      setVerifyResults((prev) => ({ ...prev, [pending.name]: result }));
      pendingVerifyRef.current = null;
    }
  }, [retainedState, bundle]);

  if (!deviceId || bundleError) {
    return (
      <div style={{ padding: 40 }}>
        <Alert type="error" message="设备不存在或加载失败" description={String(bundleError ?? '')} />
        <Button onClick={() => navigate(-1)} style={{ marginTop: 16 }}>
          返回
        </Button>
      </div>
    );
  }

  if (bundleLoading || !bundle) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const device = bundle.device;
  const channelMap: ChannelMap = device.channel_map ?? [];
  const presets: CommandPreset[] = device.command_presets ?? [];
  const total = bundle.max_channel;
  const isK32 = variant === 'k32';
  const groupSuggestions = Array.from(
    new Set(channelMap.map((e) => e.group).filter((g): g is string => !!g)),
  );
  // command_code → yaml `request` 模板，给 CommandPresetList mono 行 render raw bytes 预览用
  const commandRequestByCode: Record<string, string> = {};
  for (const c of bundle.effective_commands ?? []) {
    if (c.code && c.request) commandRequestByCode[c.code] = c.request;
  }
  const channelsRaw = (() => {
    const fields = retainedState
      ? (retainedState as { fields?: { channels?: string } }).fields
      : undefined;
    return typeof fields?.channels === 'string' ? fields.channels : '';
  })();
  // PRD 附录 G.5：复用 fromRetainedState 统一计 onlineCount / unknownCount，
  // 同时支持 K32 字符串（"AABB..."）+ 闪优 poweron 位图（int）+ 通用数组三种形式。
  // 旧版只解析 K32 字符串 → 闪优设备 onlineCount 永远 0、unknownCount=total，与矩阵实际渲染脱节。
  const channelStates = fromRetainedState(
    retainedState as Record<string, unknown> | null,
    total,
  );
  const onlineCount = channelStates.filter((s) => s === 'on').length;
  const unknownCount = channelStates.filter((s) => s === 'unknown').length;

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/devices');
    }
  };

  // ─── Cell action handlers ───
  // P9-C.2 follow-up（PRD 附录 D.10）：单格 / 全开 / 全关 / 批量统一走 channels_on/off/blink，
  // server 端用 K32 yaml `<channels_fold>` token 折成单条 ":::DMSZ1-32A." 之类的 raw 命令；
  // 不再循环 N 次 channel_on（cmd-ack 串行 + 串口阻塞会卡）。
  const handleCellClick = async (index: number, currentState: 'on' | 'off' | 'unknown') => {
    const next = currentState === 'on' ? 'channels_off' : 'channels_on';
    try {
      const res = await deviceCommandApi.control({
        device_id: deviceId,
        command: next,
        params: { channels: [index] },
      });
      // 后端 cloud-dispatch 路径返 status=executed；MQTT 路径返 status=pending/sent。
      // status=failed 时把错误显式抛出（cloud-dispatch / cmd-ack 任一阶段失败都用同一字段）。
      if (res?.status === 'failed') {
        message.error(`通道 ${index} 控制失败（设备未响应）`);
        return;
      }
      message.success(`通道 ${index} ${next === 'channels_on' ? '开' : '关'} 已发送`);
      // cloud-dispatch 在闪优 setmultichannels 落到设备后约 1.5s 自动触发 get_status 回灌 retained；
      // 这里 2.5s 后 invalidate 让 admin 看到通道翻色（多 1s 余量给闪优 4G 抖动）。
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['device-state', deviceId] });
      }, 2500);
    } catch (err) {
      message.error(`通道 ${index} 控制失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCellAction = async (
    action: 'on' | 'off' | 'blink' | 'label' | 'preset',
    indexes: number[],
  ) => {
    if (action === 'label') {
      setLabelPopoverIndexes(indexes);
      return;
    }
    if (action === 'preset') {
      setPresetEditor({
        open: true,
        initial: { expected_state: action === 'preset' ? 'on' : undefined },
        defaultExpectedChannels: indexes,
        editingExisting: false,
      });
      return;
    }
    const cmd =
      action === 'on' ? 'channels_on' : action === 'off' ? 'channels_off' : 'channels_blink';
    try {
      const res = await deviceCommandApi.control({
        device_id: deviceId,
        command: cmd,
        params: { channels: indexes },
      });
      if (res?.status === 'failed') {
        message.error(`批量控制失败（设备未响应）`);
        return;
      }
      message.success(
        `已发送 ${indexes.length} 路 ${action === 'on' ? '开' : action === 'off' ? '关' : '闪烁'}`,
      );
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['device-state', deviceId] });
      }, 2500);
    } catch (err) {
      message.error(`批量控制失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handlePresetTrigger = async (p: CommandPreset) => {
    try {
      const res = await deviceCommandApi.control({
        device_id: deviceId,
        command: p.command_code,
        params: p.params ?? null,
      });
      if (res?.status === 'failed') {
        message.error(
          `触发 ${p.name} 失败 —— 这条命令不在该设备的命令清单中，请检查命令名和参数`,
        );
        return;
      }
      message.success(`已发送 ${p.name}，等待设备回应…`);
      pendingVerifyRef.current = { name: p.name, preset: p };
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['device-state', deviceId] });
      }, 800);
    } catch (err) {
      message.error(`触发失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleLabelSubmit = async (next: ChannelEntry[]) => {
    await updateChannelMapMutation.mutateAsync(next);
  };

  const exhibitId = device.exhibit_id ?? 0;

  // ─── tabs ───
  const isRawTransport = device.connector_kind === 'raw_transport';
  const inlineCommands = (device.inline_commands ?? []) as DeviceCommandView[];
  const tabs: { key: TabKey; label: React.ReactNode }[] = [];
  if (!isRawTransport) {
    // 通道矩阵 tab：raw_transport 没有"通道"概念，隐去
    tabs.push({
      key: 'matrix',
      label: (
        <>
          🔲 通道矩阵 <span className={styles.tabBadge}>{onlineCount}/{total}</span>
        </>
      ),
    });
  }
  if (isRawTransport) {
    // ADR-0017 P-C：仅 raw_transport 显示「命令清单」tab
    tabs.push({
      key: 'commands',
      label: (
        <>
          📝 命令清单{' '}
          <span className={styles.tabBadge}>{inlineCmdCount || inlineCommands.length}</span>
        </>
      ),
    });
  }
  tabs.push({
    key: 'presets',
    label: (
      <>
        📚 命令组合 <span className={styles.tabBadge}>{presets.length}</span>
      </>
    ),
  });
  tabs.push({
    key: 'raw',
    label: variant === 'smyoo16' ? '⌨️ 网络请求' : '⌨️ 协议调试',
  });
  tabs.push({ key: 'parser', label: '🔍 响应解析' });


  return (
    <div className={styles.shell}>
      {/* 顶栏 */}
      <div className={styles.top}>
        <span className={styles.crumb}>
          <a onClick={() => navigate('/devices')} style={{ cursor: 'pointer' }}>
            设备管理
          </a>{' '}
          ·
        </span>
        <div className={styles.deviceTitle}>
          {device.name}
          <span className={styles.deviceId}>
            #{device.id}
            {device.connector_kind && ` · ${CONNECTOR_KIND_LABEL[device.connector_kind as keyof typeof CONNECTOR_KIND_LABEL] || device.connector_kind}`}
          </span>
        </div>
        <span className={`${styles.heartbeatBadge} ${styles[device.status]}`}>
          {device.status === 'online' && <span className={styles.heartbeatPulse} />}
          {device.status === 'online' ? '在线' : device.status === 'offline' ? '离线' : '未知'}
        </span>
        <Tag>{CONNECTOR_KIND_LABEL[device.connector_kind as keyof typeof CONNECTOR_KIND_LABEL] || '历史导入'}</Tag>
        <span className={styles.flexSpacer} />
        <Tooltip title="打印设备贴纸（A6 不干胶 · 含 QR 扫码跳本调试台）">
          <Button
            size="small"
            icon={<PrinterOutlined />}
            onClick={() =>
              window.open(`/devices/${deviceId}/sticker?print=1`, '_blank')
            }
          >
            打印贴纸
          </Button>
        </Tooltip>
        <Button
          size="small"
          icon={<FullscreenOutlined />}
          onClick={() => document.documentElement.requestFullscreen?.()}
        >
          全屏
        </Button>
        <Button size="small" icon={<CloseOutlined />} onClick={handleClose}>
          关闭
        </Button>
      </div>

      {/* Tab */}
      <div className={styles.tabs}>
        {tabs.map((t) => (
          <div
            key={t.key}
            className={`${styles.tab} ${activeTab === t.key ? styles.active : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </div>
        ))}
        <span className={styles.flexSpacer} />
        {/* P9-B 前端补齐：右侧统计条（mockup 05 line 213 / mockup 06 line 106）。
            K32 风格："最近响应：N ms · 丢包率 X%"
            闪优风格："最近响应：N ms · ticket: 已缓存"（admin 看不到具体 TTL，由 plugin sessionManager 24h 缓存） */}
        <span style={{ fontSize: 11.5, color: 'var(--ant-color-text-secondary)', paddingRight: 12 }}>
          {statsAvgMs != null ? (
            <>
              最近响应：{statsAvgMs} ms{' '}
              {variant === 'smyoo16' ? (
                <Tooltip title="BpeSessionId 由 SmyooPlugin 内部缓存（24h TTL）；admin 无 token 可见，可在右侧凭据卡 [立即刷新 ticket] 强制重登。">
                  <span>· ticket: 已缓存</span>
                </Tooltip>
              ) : (
                <>· 丢包率 {statsDropRate}%</>
              )}
              <span style={{ marginLeft: 12, color: 'var(--ant-color-text-tertiary)' }}>
                base={bundle.base_channel || '?'} · max={total}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--ant-color-text-tertiary)' }}>
              base={bundle.base_channel || '?'} · cascade={bundle.cascade_units} · max={total}
            </span>
          )}
        </span>
      </div>

      {/* 主体 */}
      <div className={styles.body}>
        {/* 左侧：矩阵 / preset 列表（按 tab 切换） */}
        <div className={styles.matrixWrap}>
          {activeTab === 'matrix' && (
            <>
              {/* K32 联级配置 */}
              {isK32 && (
                <div className={styles.tools}>
                  <CascadeSelector
                    baseChannel={bundle.base_channel}
                    cascadeUnits={bundle.cascade_units}
                    channelMap={channelMap}
                    loading={cascadeMutation.isPending}
                    onChange={(units) => cascadeMutation.mutateAsync(units)}
                  />
                  <span className={styles.flexSpacer} />
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => deviceCommandApi.queryNow(deviceId).then(() => message.success('已触发刷新'))}
                  >
                    刷新状态
                  </Button>
                </div>
              )}

              {/* 全开 / 全关（仅 K32 / smyoo16） */}
              {(isK32 || variant === 'smyoo16') && (
                <div className={styles.tools}>
                  <span className={styles.toolsLabel}>分组筛选:</span>
                  <span className={`${styles.chip} ${styles.active}`}>全部 {total}</span>
                  {groupSuggestions.map((g) => (
                    <span key={g} className={styles.chip}>
                      {g} {channelMap.filter((e) => e.group === g).length}
                    </span>
                  ))}
                  <span className={styles.flexSpacer} />
                  <Button
                    size="small"
                    onClick={() =>
                      handleCellAction(
                        'on',
                        Array.from({ length: total }, (_, i) => i + 1),
                      )
                    }
                  >
                    ▶ 全开
                  </Button>
                  {/* 全关：直接执行不弹确认（admin 高频操作；误点最坏后果是设备关，二次点 [全开] 即可恢复）。 */}
                  <Button
                    size="small"
                    danger
                    onClick={() =>
                      handleCellAction(
                        'off',
                        Array.from({ length: total }, (_, i) => i + 1),
                      )
                    }
                  >
                    ■ 全关
                  </Button>
                </div>
              )}

              <ChannelMatrix
                total={total}
                channelMap={channelMap}
                retainedState={retainedState ?? null}
                variant={variant}
                cascadeUnits={bundle.cascade_units}
                selectedIndexes={selectedIndexes}
                onSelectionChange={setSelectedIndexes}
                onCellClick={handleCellClick}
                onCellAction={handleCellAction}
              />

              {/* 选中态操作栏 */}
              {selectedIndexes.size > 0 && (
                <div className={styles.selectionBar}>
                  <strong>已选 {selectedIndexes.size} 路</strong>
                  <span className={styles.flexSpacer} />
                  <Space size={6}>
                    <Button
                      size="small"
                      onClick={() => handleCellAction('on', [...selectedIndexes].sort((a, b) => a - b))}
                    >
                      ▶ 一起开
                    </Button>
                    <Button
                      size="small"
                      onClick={() => handleCellAction('off', [...selectedIndexes].sort((a, b) => a - b))}
                    >
                      ■ 一起关
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => handleCellAction('preset', [...selectedIndexes].sort((a, b) => a - b))}
                    >
                      💾 存为命令组合…
                    </Button>
                    <Button size="small" onClick={() => setSelectedIndexes(new Set())}>
                      ✕ 取消选择
                    </Button>
                  </Space>
                </div>
              )}

              {/* Legend */}
              <div className={styles.legend}>
                <div className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#f59e0b' }} />
                  开
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#bfbfbf' }} />
                  关
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#8c8c8c', opacity: 0.5 }} />
                  未知
                </div>
                <span className={styles.flexSpacer} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  单击切开关 · Shift+点 = 多选 · 拖选成组 · 右键看完整菜单
                </Text>
              </div>
            </>
          )}

          {activeTab === 'commands' && isRawTransport && (
            <InlineCommandsTab
              deviceId={deviceId}
              initial={inlineCommands}
              initialConnectionConfig={device.connection_config}
              transport={device.connector_ref?.transport}
              onCountChange={setInlineCmdCount}
            />
          )}

          {activeTab === 'presets' && (
            <CommandPresetList
              presets={presets}
              verifyResults={verifyResults}
              commandRequestByCode={commandRequestByCode}
              total={total}
              retainedState={retainedState ?? null}
              onTrigger={handlePresetTrigger}
              onEdit={(p) =>
                setPresetEditor({ open: true, initial: p, editingExisting: true })
              }
              onDelete={(p) => deletePresetMutation.mutate(p.name)}
              onAdd={() => setPresetEditor({ open: true, initial: null, editingExisting: false })}
            />
          )}

          {activeTab === 'raw' && exhibitId > 0 && (
            <RawStream
              hallId={device.hall_id}
              exhibitId={exhibitId}
              deviceId={deviceId}
              protocolStyle={variant === 'smyoo16' ? 'http' : 'raw'}
            />
          )}
          {activeTab === 'raw' && exhibitId <= 0 && (
            <Alert
              type="info"
              showIcon
              message="该设备未绑定展项 — Raw 终端仅展项级 SSE 可订阅"
              description="请到设备编辑里绑定展项后再来调试"
            />
          )}

          {activeTab === 'parser' && (
            <ResponseParser
              retainedState={retainedState ?? null}
              effectiveCommands={bundle.effective_commands}
            />
          )}
        </div>

        {/* 右侧 sidebar：始终显示状态 + preset list 摘要（matrix tab 下），切到其他 tab 后 sidebar 仍保留 */}
        <div className={styles.sidePanel}>
          <div className={styles.sideCard}>
            <div className={styles.sideCardTitle}>
              <span>{isRawTransport ? '设备信息' : '当前状态'}</span>
              <small>{isRawTransport ? device.connector_kind : retainedState ? 'retained' : '未收到'}</small>
            </div>
            {isRawTransport ? (
              <RawTransportSideStats
                device={device}
                inlineCommands={inlineCommands}
                onSaveTarget={async (host, port) => {
                  const cfg = { ...(device.connection_config ?? {}), host, port };
                  await hallApi.updateDevice(deviceId, { connection_config: cfg });
                  message.success('目标地址已更新');
                  queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
                  queryClient.invalidateQueries({ queryKey: ['devices'] });
                }}
              />
            ) : (
              <>
                <div className={styles.statRow}>
                  <span>开通道</span>
                  <strong>
                    {onlineCount} / {total}
                  </strong>
                </div>
                <div className={styles.statRow}>
                  <span>未知通道</span>
                  <strong>{unknownCount}</strong>
                </div>
                <div className={styles.statRow}>
                  <span>cascade_units</span>
                  <strong>{bundle.cascade_units}</strong>
                </div>
                <div className={styles.statRow}>
                  <span>max_channel</span>
                  <strong>{total}</strong>
                </div>
                <div className={styles.statRow}>
                  <span>connector</span>
                  <strong style={{ fontSize: 11 }}>{device.connector_kind || 'v1'}</strong>
                </div>
              </>
            )}
            {!isRawTransport && channelsRaw && (
              <>
                <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px dashed var(--ant-color-border)' }} />
                <div style={{ fontSize: 11.5, color: 'var(--ant-color-text-secondary)', marginBottom: 4 }}>
                  最新 GET 返回（K32Buf）
                </div>
                <code style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  wordBreak: 'break-all',
                  color: 'var(--ant-color-text)',
                  display: 'block',
                  background: 'var(--ant-color-fill-quaternary)',
                  padding: '4px 6px',
                  borderRadius: 4,
                }}>
                  K32Buf={channelsRaw}
                </code>
              </>
            )}
          </div>

          {/* 闪优凭据卡 */}
          {variant === 'smyoo16' && <SmyooCredsCard deviceId={deviceId} />}

          <div className={styles.sideCard}>
            <div className={styles.sideCardTitle}>
              <span>命令组合</span>
              <small>{presets.length} 个</small>
            </div>
            <CommandPresetList
              presets={presets}
              verifyResults={verifyResults}
              commandRequestByCode={commandRequestByCode}
              total={total}
              retainedState={retainedState ?? null}
              onTrigger={handlePresetTrigger}
              onEdit={(p) =>
                setPresetEditor({ open: true, initial: p, editingExisting: true })
              }
              onDelete={(p) => deletePresetMutation.mutate(p.name)}
              onAdd={() => setPresetEditor({ open: true, initial: null, editingExisting: false })}
            />
          </div>

          {/* sidePanel 常驻 Raw 流卡片（mockup 05 行 519-541），切到任意 tab 都能看到设备实时流 */}
          {exhibitId > 0 && (
            <RawStream
              hallId={device.hall_id}
              exhibitId={exhibitId}
              deviceId={deviceId}
              protocolStyle={variant === 'smyoo16' ? 'http' : 'raw'}
              variant="mini"
            />
          )}

          <div className={styles.callout}>
            💡 <strong>实施小贴士</strong>：未标注的灯亮起后，
            <strong>右键单格 → [打标签…]</strong> 当场命名。多格拖选 →{' '}
            <strong>[存为命令组合…]</strong> 保存灯组合，演出 / 场景里直接复用。
          </div>
        </div>
      </div>

      {/* Modals */}
      <ChannelLabelPopover
        open={!!labelPopoverIndexes}
        indexes={labelPopoverIndexes ?? []}
        channelMap={channelMap}
        groupSuggestions={groupSuggestions}
        onCancel={() => setLabelPopoverIndexes(null)}
        onSubmit={handleLabelSubmit}
      />
      <CommandPresetEditor
        open={!!presetEditor?.open}
        initial={presetEditor?.initial}
        defaultExpectedChannels={presetEditor?.defaultExpectedChannels}
        editingExisting={presetEditor?.editingExisting}
        effectiveCommands={bundle.effective_commands}
        onCancel={() => setPresetEditor(null)}
        onSubmit={async (name, body) => {
          await upsertPresetMutation.mutateAsync({ name, body });
        }}
      />
    </div>
  );
}

/** 闪优凭据状态卡。BpeSessionId 缓存在 plugin runtime 内部（02-server 进程内 sessionManager），
 * admin 看不到具体 token；只能看上次 [刷新 ticket] 时间 + 触发强制重登。 */
function SmyooCredsCard({ deviceId }: { deviceId: number }) {
  const { message } = useMessage();
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const refreshMutation = useMutation({
    mutationFn: () => deviceCommandApi.refreshCredentials(deviceId),
    onSuccess: (res) => {
      setLastRefreshed(res.data.data.refreshed_at);
      message.success('已重新登录厂家账号');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '刷新失败';
      message.error(msg);
    },
  });
  return (
    <div className={`${styles.sideCard} ${styles.sideCardCreds}`}>
      <div className={styles.sideCardTitle}>
        <span>🔐 厂家账号</span>
        <small>闪优云端登录</small>
      </div>
      <div className={styles.statRow}>
        <span>设备</span>
        <strong>#{deviceId}</strong>
      </div>
      <div className={styles.statRow}>
        <span>登录状态</span>
        <strong style={{ fontSize: 11 }}>已登录（24 小时自动续期）</strong>
      </div>
      <div className={styles.statRow}>
        <span>上次重登</span>
        <strong style={{ fontSize: 11 }}>
          {lastRefreshed ? new Date(lastRefreshed).toLocaleString('zh-CN', { hour12: false }) : '未刷新'}
        </strong>
      </div>
      <Button
        size="small"
        block
        style={{ marginTop: 8 }}
        loading={refreshMutation.isPending}
        onClick={() => refreshMutation.mutate()}
      >
        🔄 重新登录
      </Button>
    </div>
  );
}

/** ADR-0017 P-C：raw_transport 设备右侧 sidebar 信息卡（替代 K32 的"通道矩阵"统计）。
 *  status=unknown 时显示"无 query 命令，状态走兜底"提示（mockup 10 Scene 2 右侧）。 */
function RawTransportSideStats({
  device,
  inlineCommands,
  onSaveTarget,
}: {
  device: DeviceDebugBundle['device'];
  inlineCommands: DeviceCommandView[];
  onSaveTarget: (host: string, port: number) => Promise<void>;
}) {
  const cfg = device.connection_config ?? {};
  const transport = device.connector_ref?.transport;
  const host = (cfg as { host?: string }).host;
  const port = (cfg as { port?: number }).port;
  const com = (cfg as { com?: string }).com;
  const localIface = (cfg as { local_interface?: string }).local_interface;
  const broadcast = (cfg as { broadcast?: boolean }).broadcast;
  const controlCount = inlineCommands.filter((c) => (c.kind ?? 'control') === 'control').length;
  const queryCount = inlineCommands.filter((c) => c.kind === 'query').length;
  const targetEditable = transport === 'udp' || transport === 'tcp';
  return (
    <>
      <div className={styles.statRow}>
        <span>接入方式</span>
        <strong>自定义协议 · {transport ?? '?'}</strong>
      </div>
      {(host || port || targetEditable) && (
        <div className={styles.statRow}>
          <span>目标</span>
          {targetEditable ? (
            <TargetEditor
              host={host}
              port={port}
              onSave={onSaveTarget}
            />
          ) : (
            <strong style={{ fontSize: 11 }}>
              {host ?? '?'}
              {port ? `:${port}` : ''}
            </strong>
          )}
        </div>
      )}
      {com && (
        <div className={styles.statRow}>
          <span>串口</span>
          <strong style={{ fontSize: 11 }}>{com}</strong>
        </div>
      )}
      {(transport === 'udp' || transport === 'tcp') && (
        <>
          <div className={styles.statRow}>
            <span>本地网卡</span>
            <strong style={{ fontSize: 11 }}>{localIface || 'OS 路由'}</strong>
          </div>
          {transport === 'udp' && (
            <div className={styles.statRow}>
              <span>广播</span>
              <strong>{broadcast ? '✓ 启用' : '—'}</strong>
            </div>
          )}
        </>
      )}
      <div className={styles.statRow}>
        <span>命令数</span>
        <strong>
          {controlCount} 控制 / {queryCount} 查询
        </strong>
      </div>
      {device.status === 'unknown' && queryCount === 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 10 }}
          message={
            <span style={{ fontSize: 11.5 }}>
              没有查询类命令，状态判断走兜底（5 分钟无操作 → 未知）
            </span>
          }
        />
      )}
    </>
  );
}

/** raw_transport (udp/tcp) 设备目标地址内联编辑：点击当前值 → Popover 表单 → 保存即写 connection_config。
 *  端口范围 1-65535；host 允许 IP/域名/广播地址（broadcast 字段单独管，这里不动）。 */
function TargetEditor({
  host,
  port,
  onSave,
}: {
  host: string | undefined;
  port: number | undefined;
  onSave: (host: string, port: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [hostDraft, setHostDraft] = useState(host ?? '');
  const [portDraft, setPortDraft] = useState<number | null>(port ?? null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 每次打开 Popover 把草稿同步回当前值，避免上次取消后残留
  useEffect(() => {
    if (open) {
      setHostDraft(host ?? '');
      setPortDraft(port ?? null);
      setErr(null);
    }
  }, [open, host, port]);

  const submit = async () => {
    const h = hostDraft.trim();
    if (!h) {
      setErr('请填写 IP 或域名');
      return;
    }
    if (portDraft == null || portDraft < 1 || portDraft > 65535) {
      setErr('端口需在 1-65535');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave(h, portDraft);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <Form layout="vertical" size="small" style={{ width: 220 }}>
      <Form.Item label="IP / 域名" style={{ marginBottom: 8 }}>
        <Input
          value={hostDraft}
          onChange={(e) => setHostDraft(e.target.value)}
          placeholder="192.168.1.10 或 255.255.255.255"
          autoFocus
          onPressEnter={submit}
        />
      </Form.Item>
      <Form.Item label="端口" style={{ marginBottom: 8 }}>
        <InputNumber
          value={portDraft ?? undefined}
          onChange={(v) => setPortDraft(typeof v === 'number' ? v : null)}
          min={1}
          max={65535}
          style={{ width: '100%' }}
          onPressEnter={submit}
        />
      </Form.Item>
      {err && (
        <div style={{ color: 'var(--ant-color-error)', fontSize: 11.5, marginBottom: 6 }}>
          {err}
        </div>
      )}
      <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" onClick={() => setOpen(false)} disabled={saving}>
          取消
        </Button>
        <Button size="small" type="primary" loading={saving} onClick={submit}>
          保存
        </Button>
      </Space>
    </Form>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(v) => !saving && setOpen(v)}
      trigger="click"
      placement="left"
      title="编辑目标地址"
      content={content}
    >
      <Tooltip title="点击编辑">
        <strong
          style={{
            fontSize: 11,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {host ?? '?'}
          {port ? `:${port}` : ''}
          <EditOutlined style={{ fontSize: 11, opacity: 0.6 }} />
        </strong>
      </Tooltip>
    </Popover>
  );
}
