/**
 * WolFallbackSummary — ADR-0029 中控 App 兜底唤醒摘要行（panel 按钮编辑抽屉用）
 *
 * 当按钮的 actions 引用了任一 WOL 设备时，渲染该 WOL 设备的兜底配置状态摘要。
 * 用户点「跳转编辑设备」会带 ?openEdit={id} 跳到 /devices 列表页打开设备编辑抽屉
 * （DeviceListPage 已支持该 deep link，详见 DeviceListPage.tsx§openEdit handler）。
 *
 * 红线：本组件 **只读** + **跳转**，不在面板编辑抽屉里直接改设备 connection_config —
 * 数据落点是 device.connection_config（不入 panel_card binding，避免污染双端契约）。
 *
 * 未配置 ≠ 不可用：默认 control_app_fallback.enabled=false，admin 显式开启后才生效。
 */
import { useMemo } from 'react';
import { Card, Tag, Tooltip, Typography, Space } from 'antd';
import { ThunderboltOutlined, ArrowRightOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { DeviceListItem } from '@/api/gen/client';
import type { ActionStep } from '@/pages/_shared/runbook/types';

interface Props {
  actions: ActionStep[];
  /** 全 hall 设备列表（已含 connector_kind / connector_ref / connection_config）*/
  devices: DeviceListItem[];
}

interface WolDeviceRow {
  id: number;
  name: string;
  enabled: boolean;
  requireLanSanity: boolean;
  hasSubnetBroadcast: boolean;
}

function isWolDevice(d: DeviceListItem): boolean {
  if (d.connector_kind !== 'protocol') return false;
  const ref = d.connector_ref as { protocol?: string } | undefined;
  return ref?.protocol === 'wol';
}

function readFallback(d: DeviceListItem): WolDeviceRow {
  const cc = (d.connection_config ?? {}) as {
    control_app_fallback?: {
      enabled?: boolean;
      require_lan_sanity?: boolean;
      subnet_broadcast?: string;
    };
  };
  const fb = cc.control_app_fallback ?? {};
  return {
    id: d.id,
    name: d.name,
    enabled: !!fb.enabled,
    requireLanSanity: fb.require_lan_sanity !== false,
    hasSubnetBroadcast: !!(fb.subnet_broadcast && fb.subnet_broadcast.length > 0),
  };
}

export default function WolFallbackSummary({ actions, devices }: Props) {
  const rows = useMemo<WolDeviceRow[]>(() => {
    const wolMap = new Map<number, DeviceListItem>();
    for (const d of devices) {
      if (isWolDevice(d)) wolMap.set(d.id, d);
    }
    if (wolMap.size === 0) return [];

    const referenced = new Set<number>();
    for (const a of actions) {
      if (a.type === 'device' && a.device_id != null && wolMap.has(a.device_id)) {
        referenced.add(a.device_id);
      }
    }
    return Array.from(referenced).map((id) => readFallback(wolMap.get(id)!));
  }, [actions, devices]);

  if (rows.length === 0) return null;

  return (
    <Card
      size="small"
      variant="outlined"
      style={{ marginTop: 12, borderRadius: 12 }}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <ThunderboltOutlined style={{ color: '#faad14' }} />
          兜底唤醒（中控 App 本地）
          <Tooltip title="ADR-0029：当展厅所有展厅 App 关机时，由展厅 LAN 中的中控 App 本地 UDP 广播 magic packet。配置在设备的连接参数中编辑。">
            <InfoCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }} />
          </Tooltip>
          <span
            style={{
              marginLeft: 8,
              fontSize: 12,
              color: 'var(--ant-color-text-tertiary)',
              fontWeight: 400,
            }}
          >
            本按钮涉及 {rows.length} 台 WOL 设备
          </span>
        </span>
      }
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              borderRadius: 6,
              background: 'var(--ant-color-fill-quaternary)',
            }}
          >
            <Space size="small">
              <Typography.Text strong>{r.name}</Typography.Text>
              {r.enabled ? (
                <Tag color="success">已开启</Tag>
              ) : (
                <Tag>未配置</Tag>
              )}
              {r.enabled && !r.hasSubnetBroadcast && (
                <Tooltip title="未配 subnet_broadcast；多 NIC / VPN 场景可能广播路由错网卡，建议显式配置子网定向广播地址。">
                  <Tag color="warning">缺子网广播</Tag>
                </Tooltip>
              )}
              {r.enabled && !r.requireLanSanity && (
                <Tooltip title="require_lan_sanity 已关；中控不命中 expected_subnets 时仍允许 degraded delegate。">
                  <Tag color="warning">弱判定</Tag>
                </Tooltip>
              )}
            </Space>
            <Link
              to={`/devices?openEdit=${r.id}`}
              style={{ fontSize: 12, color: 'var(--ant-color-link)' }}
            >
              跳转编辑设备 <ArrowRightOutlined style={{ fontSize: 10 }} />
            </Link>
          </div>
        ))}
      </Space>
    </Card>
  );
}
