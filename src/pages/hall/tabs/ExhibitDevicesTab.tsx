/**
 * P9-A → P9-C.2 — 展项详情 [展项设备] tab v1
 *
 * v1 增强（per PRD-field-deployment §3.3.3 + mockup device-mgmt-v2.1/02）：
 *   - 顶部 4 卡心跳健康统计（本展项设备 / 在线 / 离线 / 未知）
 *   - 接入方式列：⛀ 已支持型号 / ⛁ 协议 / ⛂ 通用传输 / ⛃ 插件 / "v1 老设备"（灰）
 *   - 行操作：[调试][编辑][克隆]；v1 老设备只留 [调试]
 *   - 底部 [+ 新建设备（绑定本展项）]：跳 /devices?openCreate=1&exhibit_id=<id>
 *     由 DeviceListPage 读 query 自动开抽屉并预选 exhibit_id
 *
 * v2.1 review 撤销：布局照片 + Pin 标定 + device.location 字段（2026-04-28）
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Empty, Space, Table, Tag, Tooltip } from 'antd';
import type { TableColumnsType } from 'antd';
import {
  ToolOutlined,
  CopyOutlined,
  PlusOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { hallApi } from '@/api/hall';
import { deviceV2Api } from '@/api/deviceConnector';
import { queryKeys } from '@/api/queryKeys';
import { useMessage } from '@/hooks/useMessage';
import StatusTag from '@/components/common/StatusTag';
import type { DeviceListItem } from '@/api/gen/client';
import type { ConnectorKind, ConnectorRef } from '@/types/deviceConnector';
import {
  CONNECTOR_KIND_LABEL,
  CONNECTOR_KIND_ICON,
} from '@/lib/deviceConnectorLabels';

interface DeviceListItemV2 extends DeviceListItem {
  connector_kind?: ConnectorKind;
  connector_ref?: ConnectorRef;
  last_heartbeat_at?: string | null;
}

interface Props {
  hallId: number;
  exhibitId: number;
  canManage: boolean;
  /** P9-A 老 callback：父页面 inner-tab 切到 'debug'。P9-C.2 起改跳 /devices/:id/debug。 */
  onOpenDebug?: (deviceId: number) => void;
}

interface HealthStats {
  total: number;
  online: number;
  offline: number;
  unknown: number;
}

function calcStats(devices: DeviceListItemV2[]): HealthStats {
  let online = 0;
  let offline = 0;
  let unknown = 0;
  for (const d of devices) {
    if (d.status === 'online') online++;
    else if (d.status === 'offline') offline++;
    else unknown++;
  }
  return { total: devices.length, online, offline, unknown };
}

export default function ExhibitDevicesTab({ hallId, exhibitId, canManage, onOpenDebug }: Props) {
  const navigate = useNavigate();
  const { message } = useMessage();
  const queryClient = useQueryClient();
  void onOpenDebug;

  const { data: devices = [], isLoading } = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId, exhibit_id: exhibitId } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: hallId, exhibit_id: exhibitId }),
    select: (res) => res.data.data as DeviceListItemV2[],
    enabled: hallId > 0 && exhibitId > 0,
  });

  const stats = useMemo(() => calcStats(devices), [devices]);

  const cloneMutation = useMutation({
    mutationFn: (deviceId: number) => deviceV2Api.clone(deviceId),
    onSuccess: () => {
      message.success('设备已克隆，请到全局设备管理重命名 + 改连接参数');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const goCreateBoundToExhibit = () => {
    navigate(`/devices?openCreate=1&exhibit_id=${exhibitId}`);
  };

  const goEdit = (deviceId: number) => {
    navigate(`/devices?openEdit=${deviceId}`);
  };

  const columns: TableColumnsType<DeviceListItemV2> = [
    {
      title: '设备名称 / 序列号',
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
      dataIndex: 'connector_kind',
      width: 160,
      render: (k: ConnectorKind | undefined) => <ConnectorKindBadge kind={k} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (s: string) => <StatusTag status={s} />,
    },
    {
      title: '最近上行',
      dataIndex: 'last_heartbeat_at',
      width: 130,
      render: (v?: string | null) =>
        v ? <span style={{ fontSize: 12 }}>{formatRelTime(v)}</span> : '-',
    },
    {
      title: '操作',
      width: 180,
      align: 'right',
      render: (_, r) => {
        const isV1 = !r.connector_kind;
        return (
          <Space size="small">
            <a onClick={() => navigate(`/devices/${r.id}/debug`)}>
              <ToolOutlined /> 调试
            </a>
            {!isV1 && canManage && (
              <>
                <a onClick={() => goEdit(r.id)}>编辑</a>
                <Tooltip title="保留 connector + 命令清单，留空 name + 连接参数；适合批量录入同型号设备">
                  <a onClick={() => cloneMutation.mutate(r.id)}>
                    <CopyOutlined /> 克隆
                  </a>
                </Tooltip>
              </>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      {/* 健康统计 4 卡 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <HealthCard label="本展项设备" value={stats.total} variant="total" />
        <HealthCard label="在线" value={stats.online} variant="online" />
        <HealthCard label="离线" value={stats.offline} variant="offline" />
        <HealthCard label="未知（心跳超时）" value={stats.unknown} variant="unknown" />
      </div>

      {devices.length === 0 && !isLoading ? (
        <Empty
          description="本展项尚未绑定任何设备"
          style={{ padding: '40px 0' }}
        >
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={goCreateBoundToExhibit}>
              新建设备（绑定本展项）
            </Button>
          )}
        </Empty>
      ) : (
        <Table<DeviceListItemV2>
          columns={columns}
          dataSource={devices}
          loading={isLoading}
          pagination={false}
          rowKey="id"
          size="middle"
        />
      )}

      {/* 底部操作区 — 空状态已有 [新建] CTA，这里只在已有设备时再露一遍主按钮 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {canManage && devices.length > 0 && (
          <Button type="primary" icon={<PlusOutlined />} onClick={goCreateBoundToExhibit}>
            新建设备（绑定本展项）
          </Button>
        )}
        <Button icon={<ArrowRightOutlined />} onClick={() => navigate('/devices')}>
          前往全局设备管理
        </Button>
      </div>
    </div>
  );
}

/* ==================== 子组件 ==================== */

function HealthCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'total' | 'online' | 'offline' | 'unknown';
}) {
  const palette: Record<typeof variant, { bg: string; fg: string }> = {
    total: { bg: 'var(--color-primary-container, #EFEBFE)', fg: 'var(--color-on-primary-container, #2A1A7A)' },
    online: { bg: 'rgba(47, 158, 90, 0.12)', fg: 'var(--color-success, #2F9E5A)' },
    offline: { bg: 'rgba(216, 76, 94, 0.12)', fg: 'var(--color-error, #D84C5E)' },
    unknown: { bg: 'var(--color-surface-container-high, #E4E4EF)', fg: 'var(--color-on-surface-variant, #4A4D63)' },
  };
  const { bg, fg } = palette[variant];
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        background: bg,
      }}
    >
      <div style={{ fontSize: 11.5, color: fg, opacity: 0.85 }}>{label}</div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.1,
          color: fg,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ConnectorKindBadge({ kind }: { kind?: ConnectorKind }) {
  if (!kind) {
    return (
      <Tag
        style={{
          background: 'var(--color-surface-container-high, #E4E4EF)',
          color: 'var(--color-on-surface-variant, #4A4D63)',
          border: 'none',
        }}
      >
        v1 老设备
      </Tag>
    );
  }
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

function formatRelTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}
