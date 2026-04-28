/**
 * device-mgmt-v2 P6 — 设备管理页（v2 重写）
 *
 * 与 v1 区别：
 *   - 新建抽屉走 4 卡片 connector_kind 选择 → 动态 step2 → step3
 *   - 列表"接入方式" chip：⛀ 已支持型号 / ⛁ 标准协议 / ⛂ 自定义 / ⛃ 插件
 *   - v1 model_id 流程已下线（新设备不再用 model_id）
 *   - v2 endpoint：POST /api/v1/v2/devices
 *
 * v1 老设备仍能 GET /api/v1/devices 列出来；新设备从 v2 路径建。
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Steps,
  Empty,
  Tooltip,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, CopyOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { presetCatalogApi, protocolProfileApi, pluginApi, deviceV2Api } from '@/api/deviceConnector';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useHallStore } from '@/stores/hallStore';
import type { DeviceListItem, ExhibitListItem } from '@/api/gen/client';
import type {
  ConnectorKind,
  ConnectorRef,
  TransportKind,
  CreateDeviceV2Body,
  PresetCatalogDTO,
  ProtocolProfileListItem,
  PluginDTO,
  PluginDeviceDTO,
} from '@/types/deviceConnector';
import {
  CONNECTOR_KIND_LABEL,
  CONNECTOR_KIND_ICON,
  TRANSPORT_LABEL,
} from '@/lib/deviceConnectorLabels';
import ConnectorKindCards from '@/components/device/ConnectorKindCards';
import TransportBindEditor from '@/components/device/TransportBindEditor';

interface DeviceListItemV2 extends DeviceListItem {
  connector_kind?: ConnectorKind;
  connector_ref?: ConnectorRef;
  poll_interval_seconds?: number;
  last_heartbeat_at?: string | null;
}

export default function DeviceListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const user = useAuthStore((s) => s.user);
  const selectedHallId = useHallStore((s) => s.selectedHallId);

  const [keyword, setKeyword] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceListItemV2 | null>(null);

  const { data: devices = [], isLoading } = useQuery({
    queryKey: queryKeys.devices({ hall_id: selectedHallId } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: selectedHallId! }),
    select: (res) => res.data.data as DeviceListItemV2[],
    enabled: !!selectedHallId,
  });

  const { data: exhibits = [] } = useQuery({
    queryKey: queryKeys.exhibits(selectedHallId ?? 0),
    queryFn: () => hallApi.getExhibits(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  const canConfig =
    !!selectedHallId &&
    (isAdmin() ||
      (user?.hall_permissions?.some(
        (hp) => hp.hall_id === selectedHallId && hp.permissions.includes('system_config'),
      ) ?? false));

  const deleteMutation = useMutation({
    mutationFn: (deviceId: number) => hallApi.deleteDevice(deviceId),
    onSuccess: () => {
      message.success('设备已删除');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: (deviceId: number) => deviceV2Api.clone(deviceId),
    onSuccess: () => {
      message.success('设备已克隆，请到列表中重命名 + 改连接参数');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const filtered = useMemo(() => {
    return keyword
      ? devices.filter((d) => d.name.toLowerCase().includes(keyword.toLowerCase()))
      : devices;
  }, [devices, keyword]);

  const openCreate = () => {
    setEditingDevice(null);
    setDrawerOpen(true);
  };

  const openEdit = (record: DeviceListItemV2) => {
    setEditingDevice(record);
    setDrawerOpen(true);
  };

  const columns: TableColumnsType<DeviceListItemV2> = [
    {
      title: '设备名称',
      dataIndex: 'name',
      render: (n: string, r) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{n}</span>
          {r.serial_no && (
            <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
              SN：{r.serial_no}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: '接入方式',
      width: 180,
      render: (_, r) => <ConnectorKindBadge device={r} />,
    },
    {
      title: '引用',
      width: 240,
      render: (_, r) => <DeviceRefCell device={r} />,
    },
    {
      title: '所属展项',
      dataIndex: 'exhibit_name',
      width: 140,
      render: (v: string | null) =>
        v || <span style={{ color: 'var(--ant-color-text-tertiary)' }}>展厅级</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <StatusTag status={s} />,
    },
    {
      title: '最近上行',
      dataIndex: 'last_heartbeat_at',
      width: 140,
      render: (v?: string | null) =>
        v ? <span style={{ fontSize: 12 }}>{formatRelTime(v)}</span> : '-',
    },
    ...(canConfig
      ? [
          {
            title: '操作',
            width: 220,
            render: (_: unknown, record: DeviceListItemV2) => (
              <Space size="small">
                <a onClick={() => openEdit(record)}>编辑</a>
                <Tooltip title="保留 connector + 命令清单，留空 name + 连接参数；适合批量录入同型号设备">
                  <a onClick={() => cloneMutation.mutate(record.id)}>
                    <CopyOutlined /> 克隆
                  </a>
                </Tooltip>
                <Popconfirm
                  title="确定删除此设备？"
                  description="需要设备未被场景动作 / 触发器引用"
                  onConfirm={() => deleteMutation.mutate(record.id)}
                >
                  <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="设备管理"
        description="管理当前展厅的设备实例（v2 — 4 种接入方式：已支持型号 / 标准协议 / 自定义 / 插件）"
        extra={
          canConfig ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!selectedHallId}>
              新建设备
            </Button>
          ) : undefined
        }
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索设备名"
          allowClear
          style={{ width: 280 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </Space>

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅
        </div>
      ) : (
        <Table<DeviceListItemV2>
          columns={columns}
          dataSource={filtered}
          loading={isLoading}
          pagination={false}
          rowKey="id"
          size="middle"
        />
      )}

      <DeviceDrawer
        open={drawerOpen}
        editing={editingDevice}
        hallId={selectedHallId ?? 0}
        exhibits={exhibits as ExhibitListItem[]}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['devices'] });
          setDrawerOpen(false);
        }}
      />
    </div>
  );
}

function formatRelTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

/* ==================== 列表 chip ==================== */

function ConnectorKindBadge({ device }: { device: DeviceListItemV2 }) {
  if (!device.connector_kind) {
    return <Tag>v1（旧版）</Tag>;
  }
  const kind = device.connector_kind;
  const colorMap: Record<ConnectorKind, string> = {
    preset: 'purple',
    protocol: 'blue',
    raw_transport: 'green',
    plugin: 'gold',
  };
  return (
    <Tag color={colorMap[kind]}>
      {CONNECTOR_KIND_ICON[kind]} {CONNECTOR_KIND_LABEL[kind]}
    </Tag>
  );
}

function DeviceRefCell({ device }: { device: DeviceListItemV2 }) {
  const ref = device.connector_ref;
  if (!device.connector_kind || !ref) {
    return (
      <span style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>-</span>
    );
  }
  let text: string;
  switch (device.connector_kind) {
    case 'preset':
      text = ref.preset_key ?? '?';
      break;
    case 'protocol':
      text = ref.protocol ?? '?';
      break;
    case 'raw_transport':
      text = ref.transport ? TRANSPORT_LABEL[ref.transport] : '?';
      break;
    case 'plugin':
      text = `${ref.plugin_id}/${ref.plugin_device_key ?? '?'}`;
      break;
    default:
      text = '-';
  }
  return <code style={{ fontSize: 12 }}>{text}</code>;
}

/* ==================== 新建 / 编辑抽屉 ==================== */

interface DrawerProps {
  open: boolean;
  editing: DeviceListItemV2 | null;
  hallId: number;
  exhibits: ExhibitListItem[];
  onClose: () => void;
  onSaved: () => void;
}

function DeviceDrawer({ open, editing, hallId, exhibits, onClose, onSaved }: DrawerProps) {
  const { message } = useMessage();

  // step state
  const [kind, setKind] = useState<ConnectorKind | undefined>(undefined);
  const [step, setStep] = useState(0);

  // step 2 state
  const [presetKey, setPresetKey] = useState<string | undefined>(undefined);
  const [protocol, setProtocol] = useState<string | undefined>(undefined);
  const [transport, setTransport] = useState<TransportKind | undefined>(undefined);
  const [pluginId, setPluginId] = useState<string | undefined>(undefined);
  const [pluginDeviceKey, setPluginDeviceKey] = useState<string | undefined>(undefined);
  const [connectionConfig, setConnectionConfig] = useState<Record<string, unknown>>({});

  // step 3 state
  const [form] = Form.useForm<{
    name: string;
    exhibit_id: number | null;
    notes?: string;
    serial_no?: string;
    poll_interval_seconds?: number;
  }>();

  // resetting on open
  useMemo(() => {
    if (!open) return;
    if (editing) {
      setKind(editing.connector_kind);
      setStep(2);
      setPresetKey(editing.connector_ref?.preset_key);
      setProtocol(editing.connector_ref?.protocol);
      setTransport(editing.connector_ref?.transport);
      setPluginId(editing.connector_ref?.plugin_id);
      setPluginDeviceKey(editing.connector_ref?.plugin_device_key);
      setConnectionConfig((editing.connection_config as Record<string, unknown>) ?? {});
      form.setFieldsValue({
        name: editing.name,
        exhibit_id: editing.exhibit_id ?? null,
        notes: editing.notes ?? '',
        serial_no: editing.serial_no ?? '',
        poll_interval_seconds: editing.poll_interval_seconds ?? 120,
      });
    } else {
      setKind(undefined);
      setStep(0);
      setPresetKey(undefined);
      setProtocol(undefined);
      setTransport(undefined);
      setPluginId(undefined);
      setPluginDeviceKey(undefined);
      setConnectionConfig({});
      form.resetFields();
      form.setFieldsValue({ exhibit_id: null, poll_interval_seconds: 120 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const createMutation = useMutation({
    mutationFn: (body: CreateDeviceV2Body) => deviceV2Api.create(body),
    onSuccess: () => {
      message.success('设备已创建');
      onSaved();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CreateDeviceV2Body> }) =>
      deviceV2Api.update(id, body),
    onSuccess: () => {
      message.success('设备已更新');
      onSaved();
    },
  });

  const buildBody = (): CreateDeviceV2Body | null => {
    const v = form.getFieldsValue();
    if (!kind) return null;
    const ref: ConnectorRef = {};
    if (kind === 'preset') {
      if (!presetKey) {
        message.error('请选择预置型号');
        return null;
      }
      ref.preset_key = presetKey;
    } else if (kind === 'protocol') {
      if (!protocol) {
        message.error('请选择协议');
        return null;
      }
      ref.protocol = protocol;
    } else if (kind === 'raw_transport') {
      if (!transport) {
        message.error('请选择连接方式');
        return null;
      }
      ref.transport = transport;
    } else if (kind === 'plugin') {
      if (!pluginId || !pluginDeviceKey) {
        message.error('请选择插件 + 子设备类型');
        return null;
      }
      ref.plugin_id = pluginId;
      ref.plugin_device_key = pluginDeviceKey;
    }
    return {
      hall_id: hallId,
      exhibit_id: v.exhibit_id ?? null,
      name: v.name,
      connector_kind: kind,
      connector_ref: ref,
      connection_config: connectionConfig,
      poll_interval_seconds: v.poll_interval_seconds ?? 120,
      notes: v.notes,
      serial_no: v.serial_no,
    };
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const body = buildBody();
    if (!body) return;
    if (editing) {
      updateMutation.mutate({ id: editing.id, body });
    } else {
      createMutation.mutate(body);
    }
  };

  return (
    <Drawer
      title={editing ? `编辑设备 — ${editing.name}` : '新建设备'}
      open={open}
      onClose={onClose}
      width={720}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          {step === 2 && (
            <Button
              type="primary"
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
            >
              保存
            </Button>
          )}
        </Space>
      }
    >
      <Steps
        current={step}
        size="small"
        items={[
          { title: '选接入方式' },
          { title: '配置连接' },
          { title: '通用字段' },
        ]}
        style={{ marginBottom: 24 }}
      />

      {step === 0 && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--ant-color-text-secondary)', marginBottom: 16 }}>
            根据设备类型选一种接入方式：
          </p>
          <ConnectorKindCards
            value={kind}
            onChange={(k) => {
              setKind(k);
            }}
            disabled={!!editing} // 编辑时不允许切换 connector_kind
          />
          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Button type="primary" disabled={!kind} onClick={() => setStep(1)}>
              下一步
            </Button>
          </div>
        </div>
      )}

      {step === 1 && kind && (
        <div>
          {kind === 'preset' && (
            <PresetStep
              value={presetKey}
              onChange={(v) => {
                setPresetKey(v);
                setConnectionConfig({});
              }}
            />
          )}
          {kind === 'protocol' && (
            <ProtocolStep
              value={protocol}
              onChange={(v) => {
                setProtocol(v);
                setConnectionConfig({});
              }}
            />
          )}
          {kind === 'raw_transport' && (
            <RawTransportStep
              transport={transport}
              onTransportChange={(t) => {
                setTransport(t);
                setConnectionConfig({});
              }}
              connectionConfig={connectionConfig}
              onConnectionConfigChange={setConnectionConfig}
            />
          )}
          {kind === 'plugin' && (
            <PluginStep
              pluginId={pluginId}
              pluginDeviceKey={pluginDeviceKey}
              onPluginIdChange={(v) => {
                setPluginId(v);
                setPluginDeviceKey(undefined);
              }}
              onPluginDeviceKeyChange={setPluginDeviceKey}
            />
          )}
          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setStep(0)} disabled={!!editing}>
                上一步
              </Button>
              <Button type="primary" onClick={() => setStep(2)}>
                下一步
              </Button>
            </Space>
          </div>
        </div>
      )}

      {step === 2 && kind && (
        <div>
          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label="设备名称"
              rules={[{ required: true, message: '必填' }]}
            >
              <Input maxLength={100} placeholder="如：1 号厅·主投影" />
            </Form.Item>
            <Form.Item name="exhibit_id" label="所属展项">
              <Select
                allowClear
                placeholder="选择展项（不选 = 展厅级）"
                options={[
                  { value: null, label: '展厅级（无展项）' },
                  ...exhibits.map((e) => ({ value: e.id, label: e.name })),
                ]}
              />
            </Form.Item>

            {/* raw_transport 需要在 step1 已经填好 connectionConfig；这里复用 */}
            {kind !== 'raw_transport' && (
              <Form.Item label="连接参数" extra="按选中接入方式渲染（IP / 端口 / 串口路径等）">
                <ConnectionConfigForKind
                  kind={kind}
                  presetKey={presetKey}
                  protocol={protocol}
                  pluginId={pluginId}
                  pluginDeviceKey={pluginDeviceKey}
                  value={connectionConfig}
                  onChange={setConnectionConfig}
                />
              </Form.Item>
            )}

            <Form.Item
              name="poll_interval_seconds"
              label="心跳轮询周期（秒）"
              extra="ExCS 主动周期问设备"
            >
              <InputNumber min={0} max={3600} placeholder="120" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="serial_no" label="序列号（可选）">
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item name="notes" label="备注（可选）" extra="如：松下 PT-FRQ75CL，2024 采购">
              <Input.TextArea rows={3} maxLength={500} />
            </Form.Item>
          </Form>
          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Button onClick={() => setStep(1)} disabled={!!editing}>
              上一步
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ===== step 2 子组件 ===== */

function PresetStep({ value, onChange }: { value?: string; onChange: (k: string) => void }) {
  const { data: list = [] } = useQuery({
    queryKey: ['preset-catalog'],
    queryFn: () => presetCatalogApi.list(),
    select: (res) => res.data.data ?? [],
  });
  const { data: detail } = useQuery({
    queryKey: ['preset-catalog', value],
    queryFn: () => presetCatalogApi.get(value!),
    select: (res) => res.data.data,
    enabled: !!value,
  });

  return (
    <div>
      <Form.Item
        label="预置型号"
        required
        extra="从 ExCS 已支持的型号库选一个，命令清单 / 心跳全自动配好"
      >
        <Select
          showSearch
          placeholder="搜索型号 / 厂商"
          value={value}
          onChange={onChange}
          options={list.map((p: PresetCatalogDTO) => ({
            value: p.key,
            label: `${p.name}（${p.manufacturer} ${p.model_name}）`,
          }))}
          filterOption={(input, option) =>
            (option?.label as string).toLowerCase().includes(input.toLowerCase())
          }
        />
      </Form.Item>
      {detail && (
        <div
          style={{
            padding: 12,
            background: 'var(--ant-color-fill-tertiary)',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div>
            <strong>{detail.name}</strong>
          </div>
          <div style={{ color: 'var(--ant-color-text-secondary)', marginTop: 4 }}>
            连接方式：
            {TRANSPORT_LABEL[detail.transport_kind as keyof typeof TRANSPORT_LABEL] ?? detail.transport_kind}{' '}
            · 命令数：{detail.control_count + detail.query_count}
            {detail.heartbeat_patterns && detail.heartbeat_patterns.length > 0 && (
              <span> · ♥ 心跳模式 {detail.heartbeat_patterns.length} 种</span>
            )}
            {detail.commands.length === 0 && detail.default_listener_patterns && (
              <span> · 📥 接收器型</span>
            )}
          </div>
          {detail.description && (
            <div style={{ color: 'var(--ant-color-text-tertiary)', marginTop: 4, fontSize: 12 }}>
              {detail.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProtocolStep({ value, onChange }: { value?: string; onChange: (p: string) => void }) {
  const { data: list = [] } = useQuery({
    queryKey: ['protocol-profiles'],
    queryFn: () => protocolProfileApi.list(),
    select: (res) => res.data.data ?? [],
  });
  const selected = list.find((p: ProtocolProfileListItem) => p.protocol === value);

  return (
    <div>
      <Form.Item label="标准协议" required extra="设备走通用工业协议（PJLink / Modbus / Art-Net / OSC 等）">
        <Select
          showSearch
          placeholder="选协议"
          value={value}
          onChange={onChange}
          options={list.map((p: ProtocolProfileListItem) => ({
            value: p.protocol,
            label: `${p.name}（${p.protocol}）`,
          }))}
        />
      </Form.Item>
      {selected && (
        <div
          style={{
            padding: 12,
            background: 'var(--ant-color-fill-tertiary)',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div>
            <strong>{selected.name}</strong>{' '}
            <span style={{ color: 'var(--ant-color-text-tertiary)' }}>
              控制 {selected.control_count} · 查询 {selected.query_count}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function RawTransportStep({
  transport,
  onTransportChange,
  connectionConfig,
  onConnectionConfigChange,
}: {
  transport?: TransportKind;
  onTransportChange: (t: TransportKind) => void;
  connectionConfig: Record<string, unknown>;
  onConnectionConfigChange: (v: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <Form.Item label="连接方式" required>
        <Select
          value={transport}
          onChange={onTransportChange}
          placeholder="选连接方式"
          options={(['tcp', 'udp', 'serial', 'osc', 'artnet', 'modbus'] as TransportKind[]).map(
            (t) => ({ value: t, label: TRANSPORT_LABEL[t] }),
          )}
        />
      </Form.Item>
      {transport && (
        <div style={{ borderTop: '1px solid var(--ant-color-border)', paddingTop: 16 }}>
          <Form layout="vertical">
            <TransportBindEditor
              transport={transport}
              value={connectionConfig}
              onChange={onConnectionConfigChange}
            />
          </Form>
        </div>
      )}
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="自定义命令清单"
        description="自定义设备的命令（control / query）可在保存后到设备详情页『命令清单』tab 编辑。"
      />
    </div>
  );
}

function PluginStep({
  pluginId,
  pluginDeviceKey,
  onPluginIdChange,
  onPluginDeviceKeyChange,
}: {
  pluginId?: string;
  pluginDeviceKey?: string;
  onPluginIdChange: (id: string) => void;
  onPluginDeviceKeyChange: (key: string) => void;
}) {
  const { data: plugins = [] } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => pluginApi.list(),
    select: (res) => res.data.data ?? [],
  });
  const { data: pluginDevices = [] } = useQuery({
    queryKey: ['plugin-devices', pluginId],
    queryFn: () => pluginApi.listDevices(pluginId!),
    select: (res) => res.data.data ?? [],
    enabled: !!pluginId,
  });

  if (plugins.length === 0) {
    return (
      <Empty
        description={
          <span>
            暂无已安装插件
            <br />
            <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
              Smyoo 等 plugin 在 P7 接入
            </span>
          </span>
        }
      />
    );
  }

  return (
    <div>
      <Form.Item label="插件" required>
        <Select
          value={pluginId}
          onChange={onPluginIdChange}
          options={plugins.map((p: PluginDTO) => ({
            value: p.plugin_id,
            label: `${p.name} (v${p.version})`,
          }))}
        />
      </Form.Item>
      {pluginId && (
        <Form.Item label="子设备类型" required>
          <Select
            value={pluginDeviceKey}
            onChange={onPluginDeviceKeyChange}
            options={pluginDevices.map((d: PluginDeviceDTO) => ({
              value: d.device_key,
              label: d.name,
            }))}
          />
        </Form.Item>
      )}
    </div>
  );
}

function ConnectionConfigForKind({
  kind,
  presetKey,
  protocol,
  pluginId,
  pluginDeviceKey,
  value,
  onChange,
}: {
  kind: ConnectorKind;
  presetKey?: string;
  protocol?: string;
  pluginId?: string;
  pluginDeviceKey?: string;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const { data: presetDetail } = useQuery({
    queryKey: ['preset-catalog', presetKey],
    queryFn: () => presetCatalogApi.get(presetKey!),
    select: (res) => res.data.data,
    enabled: kind === 'preset' && !!presetKey,
  });
  const { data: protoDetail } = useQuery({
    queryKey: ['protocol-profile', protocol],
    queryFn: () => protocolProfileApi.get(protocol!),
    select: (res) => res.data.data,
    enabled: kind === 'protocol' && !!protocol,
  });
  const { data: pluginDevices = [] } = useQuery({
    queryKey: ['plugin-devices', pluginId],
    queryFn: () => pluginApi.listDevices(pluginId!),
    select: (res) => res.data.data ?? [],
    enabled: kind === 'plugin' && !!pluginId,
  });

  const transportKind: TransportKind | undefined =
    kind === 'preset'
      ? (presetDetail?.transport_kind as TransportKind | undefined)
      : kind === 'plugin'
      ? (pluginDevices.find((d) => d.device_key === pluginDeviceKey)?.transport_kind as TransportKind | undefined)
      : undefined;

  // protocol 没有固定 transport (依赖 schema)；这里做简单回退：从 schema 推断 host/port 字段
  if (kind === 'protocol' && protoDetail) {
    return (
      <SchemaConfigForm
        schema={(protoDetail.connection_schema as Record<string, unknown>) ?? {}}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (transportKind && (kind === 'preset' || kind === 'plugin')) {
    return (
      <Form layout="vertical">
        <TransportBindEditor transport={transportKind} value={value} onChange={onChange} />
      </Form>
    );
  }

  return <div style={{ color: 'var(--ant-color-text-tertiary)' }}>无连接参数</div>;
}

interface ConnSchemaShape {
  type?: string;
  required?: string[];
  properties?: Record<string, { title?: string; type?: string; default?: unknown; description?: string }>;
}

function SchemaConfigForm({
  schema,
  value,
  onChange,
}: {
  schema: Record<string, unknown>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const s = schema as ConnSchemaShape;
  const props = s.properties ?? {};
  const requiredSet = new Set(s.required ?? []);
  const keys = Object.keys(props);
  if (keys.length === 0) return <div style={{ color: 'var(--ant-color-text-tertiary)' }}>该协议无连接参数</div>;
  return (
    <Form layout="vertical">
      {keys.map((k) => {
        const p = props[k];
        const required = requiredSet.has(k);
        return (
          <Form.Item key={k} label={p.title ?? k} required={required} help={p.description}>
            {p.type === 'number' || p.type === 'integer' ? (
              <InputNumber
                value={(value[k] as number | undefined) ?? (p.default as number | undefined)}
                onChange={(v) => onChange({ ...value, [k]: v })}
                style={{ width: '100%' }}
              />
            ) : (
              <Input
                value={(value[k] as string | undefined) ?? (p.default as string | undefined) ?? ''}
                onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              />
            )}
          </Form.Item>
        );
      })}
    </Form>
  );
}
