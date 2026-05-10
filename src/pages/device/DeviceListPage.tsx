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
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Steps,
  Empty,
  Tooltip,
} from 'antd';
import DangerConfirm from '@/components/common/DangerConfirm';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import {
  PlusOutlined,
  CopyOutlined,
  ToolOutlined,
  CaretDownOutlined,
  ReloadOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import DiscoveryStep, { type DiscoveryPrefill } from '@/components/device/DiscoveryStep';
import PresetConnectionConfigForm from '@/components/device/PresetConnectionConfigForm';
import InlineCommandsTable, {
  ensureRowKey,
  prepareInlineCommandsForSave,
  type InlineCommandRow,
} from '@/components/device/InlineCommandsTable';
import {
  isInlineCommandReferencedError,
  showInlineCommandReferencedModal,
} from '@/components/device/showInlineCommandReferencedModal';
import { useInlineCommandCodeAutogenEnabled } from '@/components/device/useInlineCommandCodeAutogenEnabled';
import { useDirectConnect } from '@/stores/directConnectStore';

interface DeviceListItemV2 extends DeviceListItem {
  connector_kind?: ConnectorKind;
  connector_ref?: ConnectorRef;
  poll_interval_seconds?: number;
  last_heartbeat_at?: string | null;
}

type GroupMode = 'exhibit' | 'connector_kind' | 'none';
type StatusFilter = 'all' | 'online' | 'not_online';
type ConnectorKindFilter = 'all' | ConnectorKind;

const COLLAPSED_KEY = 'excs-device-list-collapsed-groups';

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(s: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(s)));
  } catch {
    /* ignore */
  }
}

interface DeviceGroup {
  key: string;
  type: 'exhibit' | 'infra' | 'connector' | 'none';
  title: string;
  subtitle?: string;
  icon: string;
  devices: DeviceListItemV2[];
}

function statsOf(devices: DeviceListItemV2[]) {
  let online = 0;
  let offline = 0;
  let other = 0;
  for (const d of devices) {
    if (d.status === 'online') online++;
    else if (d.status === 'offline') offline++;
    else other++;
  }
  return { total: devices.length, online, offline, other };
}

function buildGroups(
  devices: DeviceListItemV2[],
  mode: GroupMode,
  exhibits: ExhibitListItem[],
): DeviceGroup[] {
  if (mode === 'none') {
    return [
      {
        key: 'all',
        type: 'none',
        title: '全部设备',
        icon: '📦',
        devices,
      },
    ];
  }

  if (mode === 'connector_kind') {
    const order: (ConnectorKind | 'v1')[] = ['preset', 'protocol', 'raw_transport', 'plugin', 'v1'];
    const map = new Map<string, DeviceListItemV2[]>();
    for (const d of devices) {
      const k = d.connector_kind ?? 'v1';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    const out: DeviceGroup[] = [];
    for (const k of order) {
      const list = map.get(k);
      if (!list || list.length === 0) continue;
      out.push({
        key: `kind:${k}`,
        type: 'connector',
        icon: k === 'v1' ? '🗂️' : CONNECTOR_KIND_ICON[k as ConnectorKind],
        title:
          k === 'v1'
            ? 'v1（旧版）'
            : `${CONNECTOR_KIND_LABEL[k as ConnectorKind]}`,
        subtitle: k === 'v1' ? '迁移前的设备' : '接入方式',
        devices: list,
      });
    }
    return out;
  }

  // exhibit
  const groupMap = new Map<string, DeviceGroup>();
  for (const e of exhibits) {
    groupMap.set(`e:${e.id}`, {
      key: `e:${e.id}`,
      type: 'exhibit',
      title: e.name,
      subtitle: '展项',
      icon: '🏛️',
      devices: [],
    });
  }
  groupMap.set('infra', {
    key: 'infra',
    type: 'infra',
    title: '展厅基础设施',
    subtitle: 'exhibit_id = null · 通常驱动开关馆等触发器',
    icon: '🏗️',
    devices: [],
  });

  for (const d of devices) {
    const k = d.exhibit_id != null ? `e:${d.exhibit_id}` : 'infra';
    let g = groupMap.get(k);
    if (!g) {
      g = {
        key: k,
        type: 'exhibit',
        title: d.exhibit_name ?? `展项 #${d.exhibit_id}`,
        subtitle: '展项',
        icon: '🏛️',
        devices: [],
      };
      groupMap.set(k, g);
    }
    g.devices.push(d);
  }

  const exhibitGroups: DeviceGroup[] = [];
  for (const e of exhibits) {
    const g = groupMap.get(`e:${e.id}`);
    if (g && g.devices.length > 0) exhibitGroups.push(g);
  }
  // orphan exhibit groups (exhibit removed but devices linger)
  for (const [k, g] of groupMap) {
    if (k.startsWith('e:') && !exhibits.some((e) => `e:${e.id}` === k) && g.devices.length > 0) {
      exhibitGroups.push(g);
    }
  }
  const infra = groupMap.get('infra')!;
  return infra.devices.length > 0 ? [...exhibitGroups, infra] : exhibitGroups;
}

export default function DeviceListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const user = useAuthStore((s) => s.user);
  const selectedHallId = useHallStore((s) => s.selectedHallId);

  const [keyword, setKeyword] = useState('');
  const [groupMode, setGroupMode] = useState<GroupMode>('exhibit');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<ConnectorKindFilter>('all');
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => readCollapsed());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceListItemV2 | null>(null);
  // P9-F：批量打印贴纸的多选 keys（不参与 group / filter，仅在视图层选中）
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([]);
  // P9-C.2 — 来自 [展项设备] tab 的"+ 新建设备（绑定本展项）"会带 exhibit_id，开抽屉时预填
  const [prefillExhibitId, setPrefillExhibitId] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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
    const kw = keyword.trim().toLowerCase();
    return devices.filter((d) => {
      if (kw) {
        const inName = d.name.toLowerCase().includes(kw);
        const inSn = (d.serial_no ?? '').toLowerCase().includes(kw);
        if (!inName && !inSn) return false;
      }
      if (statusFilter === 'online' && d.status !== 'online') return false;
      if (statusFilter === 'not_online' && d.status === 'online') return false;
      if (kindFilter !== 'all' && d.connector_kind !== kindFilter) return false;
      return true;
    });
  }, [devices, keyword, statusFilter, kindFilter]);

  const groups = useMemo(
    () => buildGroups(filtered, groupMode, exhibits as ExhibitListItem[]),
    [filtered, groupMode, exhibits],
  );

  const totalStats = useMemo(() => statsOf(devices), [devices]);

  // Persist collapsed state
  useEffect(() => {
    writeCollapsed(collapsedKeys);
  }, [collapsedKeys]);

  // P9-C.2 — 处理 ?openCreate=1&exhibit_id=<id> / ?openEdit=<id>（来自 [展项设备] tab）
  useEffect(() => {
    const openCreateFlag = searchParams.get('openCreate') === '1';
    const exhibitIdRaw = searchParams.get('exhibit_id');
    const openEditRaw = searchParams.get('openEdit');

    if (openCreateFlag) {
      const eid = exhibitIdRaw ? Number(exhibitIdRaw) : null;
      setPrefillExhibitId(Number.isFinite(eid) && eid! > 0 ? eid : null);
      setEditingDevice(null);
      setDrawerOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('openCreate');
      next.delete('exhibit_id');
      setSearchParams(next, { replace: true });
      return;
    }

    if (openEditRaw && devices.length > 0) {
      const eid = Number(openEditRaw);
      const found = devices.find((d) => d.id === eid);
      if (found) {
        setEditingDevice(found);
        setPrefillExhibitId(null);
        setDrawerOpen(true);
      }
      const next = new URLSearchParams(searchParams);
      next.delete('openEdit');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, devices.length]);

  const toggleGroup = (groupKey: string) => {
    const fullKey = `${groupMode}::${groupKey}`;
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(fullKey)) next.delete(fullKey);
      else next.add(fullKey);
      return next;
    });
  };

  const isCollapsed = (groupKey: string) =>
    collapsedKeys.has(`${groupMode}::${groupKey}`);

  const expandAll = () => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      for (const g of groups) next.delete(`${groupMode}::${g.key}`);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      for (const g of groups) next.add(`${groupMode}::${g.key}`);
      return next;
    });
  };

  const openCreate = () => {
    setEditingDevice(null);
    setDrawerOpen(true);
  };

  const openEdit = (record: DeviceListItemV2) => {
    setEditingDevice(record);
    setDrawerOpen(true);
  };

  const buildColumns = (mode: GroupMode): TableColumnsType<DeviceListItemV2> => {
    const cols: TableColumnsType<DeviceListItemV2> = [
      {
        title: '设备名称',
        dataIndex: 'name',
        width: 200,
        ellipsis: { showTitle: true },
        render: (n: string, r) => (
          <Tooltip title={n} mouseEnterDelay={0.4}>
            <Space direction="vertical" size={0} style={{ minWidth: 0, maxWidth: '100%' }}>
              <span
                style={{
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {n}
              </span>
              {r.serial_no && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--ant-color-text-tertiary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  SN：{r.serial_no}
                </span>
              )}
            </Space>
          </Tooltip>
        ),
      },
    ];
    if (mode !== 'connector_kind') {
      cols.push({
        title: '接入方式',
        width: 160,
        render: (_, r) => <ConnectorKindBadge device={r} />,
      });
    }
    cols.push(
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
        render: (s: string) => <StatusTag status={s} />,
      },
      {
        title: '引用 / 命令清单',
        width: 240,
        render: (_, r) => <DeviceRefCell device={r} />,
      },
    );
    if (mode === 'none') {
      cols.push({
        title: '所属展项',
        dataIndex: 'exhibit_name',
        width: 140,
        render: (v: string | null) =>
          v || <span style={{ color: 'var(--ant-color-text-tertiary)' }}>展厅级</span>,
      });
    }
    cols.push({
      title: '最近上行',
      dataIndex: 'last_heartbeat_at',
      width: 130,
      render: (v?: string | null) =>
        v ? <span style={{ fontSize: 12 }}>{formatRelTime(v)}</span> : '-',
    });
    if (canConfig) {
      cols.push({
        title: '操作',
        width: 320,
        render: (_: unknown, record: DeviceListItemV2) => (
          <Space size="small" wrap={false}>
            <a onClick={() => navigate(`/devices/${record.id}/debug`)}>
              <ToolOutlined /> 调试
            </a>
            <a onClick={() => navigate(`/devices/${record.id}/sticker?print=1`)}>
              <PrinterOutlined /> 贴纸
            </a>
            <a onClick={() => openEdit(record)}>编辑</a>
            <Tooltip title="保留 connector + 命令清单，留空 name + 连接参数；适合批量录入同型号设备">
              <a onClick={() => cloneMutation.mutate(record.id)}>
                <CopyOutlined /> 克隆
              </a>
            </Tooltip>
            <DangerConfirm
              title="确定删除此设备？"
              description="需要设备未被场景动作 / 触发器引用"
              onConfirm={() => deleteMutation.mutate(record.id)}
            >
              <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
            </DangerConfirm>
          </Space>
        ),
      });
    }
    return cols;
  };

  const columns = useMemo(() => buildColumns(groupMode), [groupMode, canConfig]);

  return (
    <div>
      <PageHeader
        title="设备管理"
        description={
          devices.length > 0
            ? `共 ${totalStats.total} 台 · ${totalStats.online} 在线 / ${totalStats.offline} 离线 / ${totalStats.other} 其他`
            : '管理当前展厅的设备实例（v2 — 4 种接入方式：已支持型号 / 标准协议 / 自定义 / 插件）'
        }
        extra={
          canConfig ? (
            <Space>
              {selectedDeviceIds.length > 0 && (
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() =>
                    navigate(
                      `/devices/sticker/batch?ids=${selectedDeviceIds.join(',')}&print=1`,
                    )
                  }
                >
                  批量打印贴纸（{selectedDeviceIds.length}）
                </Button>
              )}
              <Button
                icon={<ReloadOutlined />}
                onClick={() => queryClient.invalidateQueries({ queryKey: ['devices'] })}
              >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreate}
                disabled={!selectedHallId}
              >
                新建设备
              </Button>
            </Space>
          ) : undefined
        }
      />

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '12px 16px',
          marginBottom: 16,
          background: 'var(--ant-color-bg-container)',
          border: '1px solid var(--ant-color-border-secondary)',
          borderRadius: 8,
        }}
      >
        <Input.Search
          placeholder="搜索设备名 / 序列号"
          allowClear
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Select
          value={groupMode}
          onChange={setGroupMode}
          style={{ width: 160 }}
          options={[
            { value: 'exhibit', label: '分组：按展项' },
            { value: 'connector_kind', label: '分组：按接入方式' },
            { value: 'none', label: '不分组' },
          ]}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 150 }}
          options={[
            { value: 'all', label: '状态：全部' },
            { value: 'online', label: '仅在线' },
            { value: 'not_online', label: '离线 / 其他' },
          ]}
        />
        <Select
          value={kindFilter}
          onChange={setKindFilter}
          style={{ width: 170 }}
          options={[
            { value: 'all', label: '接入方式：全部' },
            { value: 'preset', label: `${CONNECTOR_KIND_ICON.preset} ${CONNECTOR_KIND_LABEL.preset}` },
            { value: 'protocol', label: `${CONNECTOR_KIND_ICON.protocol} ${CONNECTOR_KIND_LABEL.protocol}` },
            {
              value: 'raw_transport',
              label: `${CONNECTOR_KIND_ICON.raw_transport} ${CONNECTOR_KIND_LABEL.raw_transport}`,
            },
            { value: 'plugin', label: `${CONNECTOR_KIND_ICON.plugin} ${CONNECTOR_KIND_LABEL.plugin}` },
          ]}
        />
        <div style={{ flex: 1 }} />
        {groupMode !== 'none' && (
          <Space size={4}>
            <Button size="small" onClick={expandAll}>
              全部展开
            </Button>
            <Button size="small" onClick={collapseAll}>
              全部折叠
            </Button>
          </Space>
        )}
      </div>

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅
        </div>
      ) : isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--ant-color-text-tertiary)' }}>
          加载中…
        </div>
      ) : groups.length === 0 ? (
        <Empty description="无匹配设备" style={{ padding: 60 }} />
      ) : groupMode === 'none' ? (
        <Table<DeviceListItemV2>
          columns={columns}
          dataSource={groups[0].devices}
          loading={isLoading}
          pagination={false}
          rowKey="id"
          size="middle"
          rowSelection={{
            selectedRowKeys: selectedDeviceIds,
            onChange: (keys) => setSelectedDeviceIds(keys.map((k) => Number(k))),
            preserveSelectedRowKeys: true,
          }}
        />
      ) : (
        <div>
          {groups.map((g) => (
            <DeviceGroupCard
              key={g.key}
              group={g}
              collapsed={isCollapsed(g.key)}
              onToggle={() => toggleGroup(g.key)}
              columns={columns}
              selectedDeviceIds={selectedDeviceIds}
              onSelectionChange={setSelectedDeviceIds}
            />
          ))}
        </div>
      )}

      <DeviceDrawer
        open={drawerOpen}
        editing={editingDevice}
        hallId={selectedHallId ?? 0}
        exhibits={exhibits as ExhibitListItem[]}
        prefillExhibitId={prefillExhibitId}
        onClose={() => {
          setDrawerOpen(false);
          setPrefillExhibitId(null);
        }}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['devices'] });
          setDrawerOpen(false);
          setPrefillExhibitId(null);
        }}
      />
    </div>
  );
}

function DeviceGroupCard({
  group,
  collapsed,
  onToggle,
  columns,
  selectedDeviceIds,
  onSelectionChange,
}: {
  group: DeviceGroup;
  collapsed: boolean;
  onToggle: () => void;
  columns: TableColumnsType<DeviceListItemV2>;
  selectedDeviceIds: number[];
  onSelectionChange: (ids: number[]) => void;
}) {
  const stats = statsOf(group.devices);
  const isInfra = group.type === 'infra';

  return (
    <div
      style={{
        background: 'var(--ant-color-bg-container)',
        border: '1px solid var(--ant-color-border-secondary)',
        borderLeft: isInfra ? '3px solid var(--color-warning, #d68a2a)' : undefined,
        borderRadius: 8,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        style={{
          padding: '12px 16px',
          background: isInfra
            ? 'linear-gradient(90deg, rgba(214,138,42,0.12), transparent)'
            : 'var(--ant-color-fill-quaternary)',
          borderBottom: collapsed ? 'none' : '1px solid var(--ant-color-border-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <CaretDownOutlined
          style={{
            fontSize: 11,
            color: 'var(--ant-color-text-tertiary)',
            transition: 'transform 0.15s',
            transform: collapsed ? 'rotate(-90deg)' : 'none',
          }}
        />
        <span style={{ fontSize: 16 }}>{group.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
          {group.title}{' '}
          {group.subtitle && (
            <small
              style={{
                color: 'var(--ant-color-text-tertiary)',
                fontWeight: 400,
                marginLeft: 6,
              }}
            >
              {group.subtitle}
            </small>
          )}
        </span>
        <span
          style={{
            fontSize: 11.5,
            color: 'var(--ant-color-text-secondary)',
            display: 'flex',
            gap: 12,
          }}
        >
          <span>
            <strong style={{ color: 'var(--ant-color-text)' }}>{stats.total}</strong> 台
          </span>
          {stats.online > 0 && (
            <span>
              <strong style={{ color: 'var(--color-success, #2f9e5a)' }}>{stats.online}</strong> 在线
            </span>
          )}
          {stats.offline > 0 && (
            <span>
              <strong style={{ color: 'var(--color-error, #d84c5e)' }}>{stats.offline}</strong> 离线
            </span>
          )}
          {stats.other > 0 && (
            <span>
              <strong style={{ color: 'var(--ant-color-text-tertiary)' }}>{stats.other}</strong> 其他
            </span>
          )}
        </span>
      </div>
      {!collapsed && (
        <div>
          <Table<DeviceListItemV2>
            columns={columns}
            dataSource={group.devices}
            pagination={false}
            rowKey="id"
            size="middle"
            showHeader
            rowSelection={{
              selectedRowKeys: selectedDeviceIds,
              onChange: (keys) => onSelectionChange(keys.map((k) => Number(k))),
              preserveSelectedRowKeys: true,
            }}
          />
        </div>
      )}
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
  /** P9-C.2 — 由 [展项设备] tab 跳转时预填的展项 id（仅新建模式生效） */
  prefillExhibitId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}

function DeviceDrawer({ open, editing, hallId, exhibits, prefillExhibitId, onClose, onSaved }: DrawerProps) {
  const { message, modal } = useMessage();
  const directConnectMode = useDirectConnect((s) => s.mode);
  const autogenEnabled = useInlineCommandCodeAutogenEnabled();

  // step state
  const [kind, setKind] = useState<ConnectorKind | undefined>(undefined);
  const [step, setStep] = useState(0);

  // P9-E.2: step 0 sub-tab — 'scan' (default) | 'manual'
  // disconnected 模式下扫描发现按钮无意义 → 强制 manual
  const [step0Tab, setStep0Tab] = useState<'scan' | 'manual'>('scan');

  // step 2 state
  const [presetKey, setPresetKey] = useState<string | undefined>(undefined);
  const [protocol, setProtocol] = useState<string | undefined>(undefined);
  const [transport, setTransport] = useState<TransportKind | undefined>(undefined);
  const [pluginId, setPluginId] = useState<string | undefined>(undefined);
  const [pluginDeviceKey, setPluginDeviceKey] = useState<string | undefined>(undefined);
  const [connectionConfig, setConnectionConfig] = useState<Record<string, unknown>>({});

  // ADR-0017 P-C：raw_transport inline_commands 行内编辑（保存前校验，保存时全量提交）
  const [inlineCommands, setInlineCommands] = useState<InlineCommandRow[]>([]);
  /** baseline 中已有 code 的行 key —— 决定抽屉里 ID 字段是否锁死 */
  const [inlinePersistedKeys, setInlinePersistedKeys] = useState<Set<string>>(() => new Set());

  // step 3 state
  const [form] = Form.useForm<{
    name: string;
    exhibit_id: number | null;
    notes?: string;
    serial_no?: string;
    poll_interval_seconds?: number;
  }>();

  const applyPrefill = (p: DiscoveryPrefill) => {
    setKind(p.kind);
    setPresetKey(p.ref.preset_key);
    setProtocol(p.ref.protocol);
    setTransport(p.transport ?? p.ref.transport);
    setPluginId(p.ref.plugin_id);
    setPluginDeviceKey(p.ref.plugin_device_key);
    setConnectionConfig(p.connectionConfig);
    if (p.suggestedName) {
      form.setFieldsValue({ name: p.suggestedName });
    }
    setStep(1);
    message.success(`已预填 ${p.sourceEndpoint} 进入步骤 2 — 校核连接参数`);
  };

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
      const editingInline =
        ((editing as unknown as { inline_commands?: InlineCommandRow[] }).inline_commands ?? []).map(
          (c, idx) => {
            const r = { ...c };
            ensureRowKey(r, idx);
            return r;
          },
        );
      setInlineCommands(editingInline);
      // 编辑已存设备：所有从 server 拉回的行都视作"已持久化"——code 锁死，rename 不动 code
      setInlinePersistedKeys(
        new Set(editingInline.filter((r) => r._row && r.code).map((r) => r._row as string)),
      );
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
      setStep0Tab(directConnectMode === 'disconnected' ? 'manual' : 'scan');
      setPresetKey(undefined);
      setProtocol(undefined);
      setTransport(undefined);
      setPluginId(undefined);
      setPluginDeviceKey(undefined);
      setConnectionConfig({});
      setInlineCommands([]);
      setInlinePersistedKeys(new Set());
      form.resetFields();
      form.setFieldsValue({
        exhibit_id: prefillExhibitId ?? null,
        poll_interval_seconds: 120,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, prefillExhibitId]);

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
    onError: (err: unknown) => {
      // PRD-inline-command-code-autogen P3.3：净减/重命名命中现存引用方 → 弹结构化 modal
      if (isInlineCommandReferencedError(err)) {
        showInlineCommandReferencedModal(modal, err.__inlineCommandReferenced);
        return;
      }
      // 其它错误已由 request 拦截器全局 toast，无需重复
    },
  });

  const buildBody = async (): Promise<CreateDeviceV2Body | null> => {
    const v = form.getFieldsValue();
    if (!kind) return null;
    const ref: ConnectorRef = {};
    let preparedInlineRows: InlineCommandRow[] | null = null;
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
      if (inlineCommands.length === 0) {
        message.error('raw_transport 设备必须至少 1 条 inline_command');
        return null;
      }
      // PRD-inline-command-code-autogen.md D2：保存前一次性把空 code 自动按名字生成
      // P4 feature flag 关闭时跳过 autogen，空 code 走 issues 提示用户
      const prepared = await prepareInlineCommandsForSave(inlineCommands, { autogenEnabled });
      if (prepared.issues.length > 0) {
        message.error(`命令清单有 ${prepared.issues.length} 处错误：${prepared.issues[0].message}`);
        return null;
      }
      preparedInlineRows = prepared.rows;
      // 把已生成的 code 同步回 state，让 UI 行立即显示锁定 ID（避免用户再点保存时又一次自动生成）
      setInlineCommands(prepared.rows);
    } else if (kind === 'plugin') {
      if (!pluginId || !pluginDeviceKey) {
        message.error('请选择插件 + 子设备类型');
        return null;
      }
      ref.plugin_id = pluginId;
      ref.plugin_device_key = pluginDeviceKey;
    }
    const body: CreateDeviceV2Body = {
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
    if (kind === 'raw_transport' && preparedInlineRows) {
      // 用 prepared.rows（含 autogen code）而非 state 里可能 stale 的 inlineCommands
      body.inline_commands = preparedInlineRows.map(({ _row: _drop, ...rest }) => rest);
    }
    return body;
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const body = await buildBody();
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
          {!editing && (
            <div
              style={{
                display: 'inline-flex',
                marginBottom: 16,
                background: 'var(--ant-color-fill-tertiary)',
                borderRadius: 8,
                padding: 3,
                gap: 0,
              }}
            >
              <Button
                type={step0Tab === 'scan' ? 'primary' : 'text'}
                size="small"
                disabled={directConnectMode === 'disconnected'}
                onClick={() => setStep0Tab('scan')}
                style={{ minWidth: 130 }}
              >
                🔍 扫描发现{' '}
                {step0Tab === 'scan' && (
                  <Tag color="success" style={{ marginLeft: 4, fontSize: 10 }}>
                    推荐
                  </Tag>
                )}
              </Button>
              <Button
                type={step0Tab === 'manual' ? 'primary' : 'text'}
                size="small"
                onClick={() => setStep0Tab('manual')}
                style={{ minWidth: 150 }}
              >
                ✋ 手动选 connector
              </Button>
            </div>
          )}

          {(step0Tab === 'manual' || editing) && (
            <>
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
            </>
          )}

          {step0Tab === 'scan' && !editing && (
            <DiscoveryStep hallId={hallId} onPrefill={applyPrefill} />
          )}
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
              inlineCommands={inlineCommands}
              onInlineCommandsChange={setInlineCommands}
              persistedRowKeys={inlinePersistedKeys}
              hallId={hallId}
              exhibitId={form.getFieldValue('exhibit_id') ?? null}
              editingDeviceId={editing?.id ?? null}
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
          {/* P9-B 前端补齐：命令清单只读预览（mockup 07 line 154-166） */}
          {detail.commands.length > 0 && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px dashed var(--ant-color-border)',
                fontSize: 12,
              }}
            >
              <div style={{ color: 'var(--ant-color-text-tertiary)', marginBottom: 4 }}>
                命令清单（来自 preset，不可改）
              </div>
              <Space size={4} wrap>
                <Tag color="blue">control × {detail.control_count}</Tag>
                <Tag color="cyan">query × {detail.query_count}</Tag>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--ant-color-text-secondary)',
                    fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
                  }}
                >
                  {detail.commands.map((c) => c.code).join(' / ')}
                </span>
              </Space>
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
  inlineCommands,
  onInlineCommandsChange,
  persistedRowKeys,
  hallId,
  exhibitId,
  editingDeviceId,
}: {
  transport?: TransportKind;
  onTransportChange: (t: TransportKind) => void;
  connectionConfig: Record<string, unknown>;
  onConnectionConfigChange: (v: Record<string, unknown>) => void;
  inlineCommands: InlineCommandRow[];
  onInlineCommandsChange: (next: InlineCommandRow[]) => void;
  persistedRowKeys: Set<string>;
  hallId: number;
  exhibitId: number | null;
  editingDeviceId: number | null;
}) {
  const autogenEnabled = useInlineCommandCodeAutogenEnabled();
  const supportsInline =
    transport === 'tcp' ||
    transport === 'udp' ||
    transport === 'serial' ||
    transport === 'osc';

  // ADR-0017 D3：测试端点必须用已存设备 ID（POST /v2/devices/:id/inline-commands/test）。
  // 新建未保存时 editingDeviceId=null → 隐藏 [▶ 测试]，落保存后再到调试台测。
  const onTest = editingDeviceId
    ? async (row: InlineCommandRow) => {
        const start = Date.now();
        const res = await deviceV2Api.testInlineCommand(editingDeviceId, {
          payload: row.request ?? '',
          format: (row.request_format ?? 'text') as 'text' | 'hex',
        });
        const data = res.data?.data;
        const ok = (data?.status ?? 'failed') !== 'failed';
        return {
          ok,
          latencyMs: data?.latency_ms ?? Date.now() - start,
          detail: data?.detail,
          at: Date.now(),
        };
      }
    : undefined;

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
              hallId={hallId}
              exhibitId={exhibitId}
            />
          </Form>
        </div>
      )}
      {supportsInline && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 600,
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            inline 命令清单 <span style={{ color: 'var(--ant-color-error)' }}>*</span>
            <span
              style={{
                fontWeight: 'normal',
                color: 'var(--ant-color-text-secondary)',
                fontSize: 12,
              }}
            >
              （≥1 条；这台设备能发什么由你决定）
            </span>
          </div>
          <InlineCommandsTable
            value={inlineCommands}
            onChange={onInlineCommandsChange}
            onTest={onTest}
            persistedRowKeys={persistedRowKeys}
            autogenEnabled={autogenEnabled}
          />
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message={
              <span style={{ fontSize: 12 }}>
                <strong>text 格式</strong>支持 <code>{`\\r \\n \\t \\\\ \\xNN`}</code> 转义；
                <strong>hex 格式</strong>容忍空白和大小写按字节解码（如 <code>01 02 ff</code>）。
                <br />
                每行 <strong>[▶ 测试]</strong>{' '}
                {editingDeviceId
                  ? '调云端转发到展厅 App 即时发包，不持久化；保存后命令进入 effective-commands。'
                  : '需先保存设备拿到 ID，再到调试台「命令清单」tab 即时单测。'}
              </span>
            }
          />
        </div>
      )}
      {transport && !supportsInline && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message={`${transport} raw_transport 暂不支持 inline_commands（ADR-0017 V1.1 仅 TCP / UDP / Serial / OSC；artnet / modbus 留 V2）`}
        />
      )}
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

  // P9-B 前端补齐：preset 走 yaml connection_schema 自定义渲染（widget=vendor-credential-select
  // / fieldKey=deviceid 走特化 UI），不再退回 TransportBindEditor。
  // 兼容兜底：旧 preset 没写 connection_schema → 仍按 transport_kind 用 TransportBindEditor。
  if (kind === 'preset' && presetDetail) {
    const schema = (presetDetail.connection_schema as Record<string, unknown>) ?? {};
    const props = (schema.properties as Record<string, unknown> | undefined) ?? {};
    if (Object.keys(props).length > 0) {
      return <PresetConnectionConfigForm schema={schema} value={value} onChange={onChange} />;
    }
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
