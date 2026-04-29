/**
 * P9-A — 展项详情 [展项设备] tab（占位 v0）
 *
 * 当前能力（最小实现）：
 *   - 列出本展项绑定的设备（按 hall_id + exhibit_id 过滤）
 *   - 行操作 [调试] 切换父页面 innerTab 到 'debug' 并预填 deviceId
 *   - 顶栏 [前往设备管理] 跳到 /devices（带 hall 上下文）以新建/编辑/克隆/删除
 *
 * 后续 P9-C 增强（per PRD-field-deployment）：
 *   - 顶部布局照片 + Pin 标定
 *   - 嵌入设备调试台快捷入口
 *   - 行内联编辑 location（机柜位置）
 *   - 心跳健康统计卡片（在线 N / 离线 N / unknown N）
 */
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Space, Table, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import { ToolOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import StatusTag from '@/components/common/StatusTag';
import type { DeviceListItem } from '@/api/gen/client';
import type { ConnectorKind } from '@/types/deviceConnector';
import { CONNECTOR_KIND_LABEL } from '@/lib/deviceConnectorLabels';

interface DeviceListItemV2 extends DeviceListItem {
  connector_kind?: ConnectorKind;
  last_heartbeat_at?: string | null;
}

interface Props {
  hallId: number;
  exhibitId: number;
  canManage: boolean;
  /**
   * 行操作 [调试] 触发——P9-C.2 起改为跳全屏调试台 /devices/:id/debug。
   * 老 callback 形态保留以兼容父页面 inner-tab 切换路径（暂不再使用，留作 escape hatch）。
   */
  onOpenDebug?: (deviceId: number) => void;
}

export default function ExhibitDevicesTab({ hallId, exhibitId, canManage, onOpenDebug }: Props) {
  const navigate = useNavigate();
  void onOpenDebug;

  const { data: devices = [], isLoading } = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId, exhibit_id: exhibitId } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: hallId, exhibit_id: exhibitId }),
    select: (res) => res.data.data as DeviceListItemV2[],
    enabled: hallId > 0 && exhibitId > 0,
  });

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
      dataIndex: 'connector_kind',
      width: 140,
      render: (k?: ConnectorKind) =>
        k ? <Tag>{CONNECTOR_KIND_LABEL[k] ?? k}</Tag> : <span style={{ color: 'var(--ant-color-text-tertiary)' }}>v1 老设备</span>,
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
    {
      title: '操作',
      width: 140,
      render: (_, r) => (
        <Space size="small">
          <a onClick={() => navigate(`/devices/${r.id}/debug`)}>
            <ToolOutlined /> 调试
          </a>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowRightOutlined />}
          onClick={() => navigate('/devices')}
          disabled={!canManage}
        >
          前往设备管理（新建 / 编辑 / 删除）
        </Button>
      </Space>

      {devices.length === 0 && !isLoading ? (
        <Empty description="本展项尚未绑定任何设备 — 请前往设备管理页新建并选择此展项" />
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
    </div>
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
