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
import { Alert, Button, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { CloseOutlined, FullscreenOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMessage } from '@/hooks/useMessage';
import { deviceDebugApi, type DeviceDebugBundle } from '@/api/deviceDebug';
import { channelMapApi, type ChannelEntry, type ChannelMap } from '@/api/channelMap';
import { commandPresetApi, type CommandPreset } from '@/api/commandPreset';
import { deviceCommandApi } from '@/api/deviceCommand';
import { deviceV2Api } from '@/api/deviceConnector';
import { hallApi } from '@/api/hall';
import ChannelMatrix, { type MatrixVariant } from './ChannelMatrix';
import CascadeSelector from './CascadeSelector';
import ChannelLabelPopover from './ChannelLabelPopover';
import CommandPresetEditor from './CommandPresetEditor';
import CommandPresetList from './CommandPresetList';
import { verifyPreset, type PresetVerifyResult } from './state';
import RawStream from './RawStream';
import ResponseParser from './ResponseParser';
import DangerConfirm from '@/components/common/DangerConfirm';
import styles from './DeviceDebugConsole.module.scss';

const { Text } = Typography;

type TabKey = 'matrix' | 'presets' | 'raw' | 'parser';

export default function DeviceDebugConsolePage() {
  const { deviceId: deviceIdStr } = useParams<{ deviceId: string }>();
  const deviceId = Number(deviceIdStr);
  const navigate = useNavigate();
  const { message } = useMessage();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('matrix');
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
      message.success('通道映射已更新');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
      setLabelPopoverIndexes(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '更新失败';
      message.error(msg);
    },
  });

  // CommandPreset upsert / delete
  const upsertPresetMutation = useMutation({
    mutationFn: ({
      name,
      body,
    }: {
      name: string;
      body: Parameters<typeof commandPresetApi.upsert>[2];
    }) => commandPresetApi.upsert(deviceId, name, body),
    onSuccess: () => {
      message.success('指令组已保存');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
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
      message.success('指令组已删除');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
    },
  });

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
  const onlineCount = (() => {
    const states = retainedState
      ? (retainedState as { fields?: { channels?: string } }).fields?.channels
      : undefined;
    if (typeof states === 'string') {
      return states.split('').filter((c) => c === 'A' || c === 'a').length;
    }
    return 0;
  })();

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/devices');
    }
  };

  // ─── Cell action handlers ───
  const handleCellClick = async (index: number, currentState: 'on' | 'off' | 'unknown') => {
    const next = currentState === 'on' ? 'channel_off' : 'channel_on';
    try {
      await deviceCommandApi.control({
        device_id: deviceId,
        command: next,
        params: { channels: [index] },
      });
      // 触发后 5s 内 refetch retained
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['device-state', deviceId] });
      }, 800);
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
    const cmd = action === 'on' ? 'channel_on' : action === 'off' ? 'channel_off' : 'channel_blink';
    try {
      await deviceCommandApi.control({
        device_id: deviceId,
        command: cmd,
        params: { channels: indexes },
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['device-state', deviceId] });
      }, 800);
    } catch (err) {
      message.error(`批量控制失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handlePresetTrigger = async (p: CommandPreset) => {
    try {
      await deviceCommandApi.control({
        device_id: deviceId,
        command: p.command_code,
        params: p.params ?? null,
      });
      message.info(`已触发 ${p.name}，等下一帧 retained 验证…`);
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
  const tabs: { key: TabKey; label: React.ReactNode }[] = [
    {
      key: 'matrix',
      label: (
        <>
          🔲 通道矩阵 <span className={styles.tabBadge}>{onlineCount}/{total}</span>
        </>
      ),
    },
    {
      key: 'presets',
      label: (
        <>
          📚 指令组 <span className={styles.tabBadge}>{presets.length}</span>
        </>
      ),
    },
    {
      key: 'raw',
      label: variant === 'smyoo16' ? '⌨️ HTTP 终端' : '⌨️ Raw 终端',
    },
    { key: 'parser', label: '🔍 响应解析' },
  ];

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
            {device.connector_kind && ` · ${device.connector_kind}`}
          </span>
        </div>
        <span className={`${styles.heartbeatBadge} ${styles[device.status]}`}>
          {device.status === 'online' && <span className={styles.heartbeatPulse} />}
          {device.status === 'online' ? '心跳正常' : device.status === 'offline' ? '离线' : '未知'}
        </span>
        <Tag>{device.connector_kind || 'v1'}</Tag>
        <span className={styles.flexSpacer} />
        <Tooltip title="打印设备贴纸 — 后续 P9-D">
          <Button size="small" icon={<PrinterOutlined />} disabled>
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
        <span style={{ fontSize: 11.5, color: 'var(--ant-color-text-secondary)', paddingRight: 12 }}>
          base={bundle.base_channel || '?'} · cascade={bundle.cascade_units} · max={total}
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
                  <DangerConfirm
                    title="确定全关所有通道？"
                    description={`将向 ${total} 个通道发送关闭命令`}
                    onConfirm={() =>
                      handleCellAction(
                        'off',
                        Array.from({ length: total }, (_, i) => i + 1),
                      )
                    }
                  >
                    <Button size="small" danger>
                      ■ 全关
                    </Button>
                  </DangerConfirm>
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
                      💾 存为指令组…
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

          {activeTab === 'presets' && (
            <CommandPresetList
              presets={presets}
              verifyResults={verifyResults}
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
              <span>当前状态</span>
              <small>{retainedState ? 'retained' : '未收到'}</small>
            </div>
            <div className={styles.statRow}>
              <span>开通道</span>
              <strong>
                {onlineCount} / {total}
              </strong>
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
          </div>

          {/* 闪优凭据卡 */}
          {variant === 'smyoo16' && <SmyooCredsCard deviceId={deviceId} />}

          <div className={styles.sideCard}>
            <div className={styles.sideCardTitle}>
              <span>指令组</span>
              <small>{presets.length} 个</small>
            </div>
            <CommandPresetList
              presets={presets}
              verifyResults={verifyResults}
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

          <div className={styles.callout}>
            💡 <strong>实施小贴士</strong>：未标注的灯亮起后，
            <strong>右键单格 → [打标签…]</strong> 当场命名。多格拖选 →{' '}
            <strong>[存为指令组…]</strong> 保存灯组合，演出 / 场景里直接复用。
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
      message.success('已强制重登并刷新 ticket');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '刷新失败';
      message.error(msg);
    },
  });
  return (
    <div className={`${styles.sideCard} ${styles.sideCardCreds}`}>
      <div className={styles.sideCardTitle}>
        <span>🔐 厂家凭据</span>
        <small>SmyooPlugin 委托</small>
      </div>
      <div className={styles.statRow}>
        <span>设备</span>
        <strong>#{deviceId}</strong>
      </div>
      <div className={styles.statRow}>
        <span>BpeSessionId</span>
        <strong style={{ fontSize: 11 }}>插件内部缓存（24h TTL）</strong>
      </div>
      <div className={styles.statRow}>
        <span>上次刷新</span>
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
        🔄 立即刷新 ticket
      </Button>
    </div>
  );
}
