import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select, Space, Badge, Card, Tag, Modal, Timeline, Spin, Button,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { smarthomeApi } from '@/api/smarthome';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type { HallListItem } from '@/types/hall';
import type { DeviceHealthDTO, GatewayHealthDTO, GatewayStatus } from '@/types/smarthome';

/* ==================== 常量 ==================== */

const LOW_BATTERY_THRESHOLD = 20;

const GATEWAY_STATUS_MAP: Record<GatewayStatus, { color: string; text: string }> = {
  online: { color: 'success', text: '在线' },
  offline: { color: 'error', text: '离线' },
  pairing: { color: 'processing', text: '配对中' },
};

function getDeviceStatusColor(device: DeviceHealthDTO): string {
  if (!device.online && device.error_count_1h > 0) return '#ff4d4f'; // 红色告警
  if (!device.online) return '#d9d9d9'; // 灰色离线
  if (device.battery_level != null && device.battery_level < LOW_BATTERY_THRESHOLD) return '#faad14'; // 橙色低电
  return '#52c41a'; // 绿色在线
}

function getDeviceStatusText(device: DeviceHealthDTO): string {
  if (!device.online && device.error_count_1h > 0) return '告警';
  if (!device.online) return '离线';
  if (device.battery_level != null && device.battery_level < LOW_BATTERY_THRESHOLD) return '低电量';
  return '在线';
}

/* ==================== 组件 ==================== */

export default function DeviceHealthPage() {
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const setSelectedHall = useHallStore((s) => s.setSelectedHall);
  const clearSelectedHall = useHallStore((s) => s.clearSelectedHall);

  const [detailDevice, setDetailDevice] = useState<DeviceHealthDTO | null>(null);

  // Halls dropdown
  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 } as Record<string, unknown>),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data,
  });
  const halls = hallsData?.list ?? [];
  const hallOptions = halls.map((h: HallListItem) => ({ value: h.id, label: h.name }));

  // Gateway health
  // 注意：解构默认 `= []` 只在 undefined 时生效；后端空结果可能回 `data: null`，
  // 必须在使用处再 ?? [] 兜一层，否则 .map() 会抛 TypeError 导致白屏。
  const { data: rawGateways, isLoading: gwLoading } = useQuery({
    queryKey: queryKeys.gatewayHealth(selectedHallId!),
    queryFn: () => smarthomeApi.getGatewayHealth(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
    refetchInterval: 30_000,
  });
  const gateways = rawGateways ?? [];

  // Device health
  const { data: rawDeviceHealthList, isLoading: dhLoading, refetch } = useQuery({
    queryKey: queryKeys.deviceHealth(selectedHallId!),
    queryFn: () => smarthomeApi.getDeviceHealth(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
    refetchInterval: 30_000,
  });
  const deviceHealthList = rawDeviceHealthList ?? [];

  // Device history (for detail modal)
  const { data: rawDeviceHistory, isLoading: historyLoading } = useQuery({
    queryKey: queryKeys.deviceHealthHistory(detailDevice?.device_id ?? 0),
    queryFn: () => smarthomeApi.getDeviceHealthHistory(detailDevice!.device_id),
    select: (res) => res.data.data,
    enabled: !!detailDevice,
  });
  const deviceHistory = rawDeviceHistory ?? [];

  const isLoading = gwLoading || dhLoading;

  return (
    <div>
      <PageHeader
        title="设备全景"
        description="实时监控所有智能家居设备状态"
        extra={
          selectedHallId ? (
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button>
          ) : undefined
        }
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="选择展厅"
          style={{ width: 220 }}
          value={selectedHallId}
          onChange={(v) => {
            const hall = halls.find((h: HallListItem) => h.id === v);
            if (hall) setSelectedHall(v, hall.name);
          }}
          onClear={clearSelectedHall}
          allowClear
          options={hallOptions}
        />
        {selectedHallId && !isLoading && (
          <span style={{ color: '#999', fontSize: 13 }}>
            自动刷新间隔：30 秒
          </span>
        )}
      </Space>

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>请先选择展厅</div>
      ) : isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin /></div>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {gateways.map((gw: GatewayHealthDTO) => {
            const statusCfg = GATEWAY_STATUS_MAP[gw.status] ?? { color: 'default', text: gw.status };
            // In V1 we don't have per-gateway device grouping from API, so we show all devices
            // Future: filter deviceHealthList by gateway association
            return (
              <Card
                key={`${gw.type}-${gw.id}`}
                title={
                  <Space>
                    <span>{gw.type === 'hue' || gw.type === 'hue_bridge' ? 'Hue Bridge' : '小米网关'}</span>
                    <span style={{ fontWeight: 600 }}>{gw.name}</span>
                    <Badge status={statusCfg.color as 'success' | 'error' | 'default' | 'processing'} text={statusCfg.text} />
                    <span style={{ color: '#999', fontSize: 13 }}>
                      固件: {gw.firmware_version || '-'} | {gw.device_count} 个设备
                    </span>
                  </Space>
                }
                size="small"
              >
                {/* Placeholder: V1 shows all devices flat under the first gateway */}
              </Card>
            );
          })}

          {/* Device list card */}
          <Card title={`所有设备（${deviceHealthList.length}）`} size="small">
            {deviceHealthList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>暂无设备数据</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {deviceHealthList.map((device: DeviceHealthDTO) => {
                  const color = getDeviceStatusColor(device);
                  const statusText = getDeviceStatusText(device);
                  return (
                    <Card
                      key={device.device_id}
                      size="small"
                      style={{
                        width: 220,
                        borderLeft: `3px solid ${color}`,
                        cursor: 'pointer',
                      }}
                      onClick={() => setDetailDevice(device)}
                      hoverable
                    >
                      <div style={{ marginBottom: 4 }}>
                        <Tag color={color} style={{ color: color === '#d9d9d9' ? '#999' : '#fff' }}>
                          {statusText}
                        </Tag>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>设备 #{device.device_id}</span>
                      </div>
                      {device.battery_level != null && (
                        <div style={{ fontSize: 12, color: device.battery_level < LOW_BATTERY_THRESHOLD ? '#faad14' : '#999' }}>
                          电量: {device.battery_level}%
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: '#999' }}>
                        最后通信: {new Date(device.last_seen_at).toLocaleString('zh-CN')}
                      </div>
                      {device.error_count_1h > 0 && (
                        <div style={{ fontSize: 12, color: '#ff4d4f' }}>
                          近 1 小时错误: {device.error_count_1h}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>
        </Space>
      )}

      {/* Device Detail Modal */}
      <Modal
        title={`设备 #${detailDevice?.device_id ?? ''} 详情`}
        open={!!detailDevice}
        onCancel={() => setDetailDevice(null)}
        footer={null}
        width={560}
        destroyOnClose
      >
        {detailDevice && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Tag color={getDeviceStatusColor(detailDevice)}>{getDeviceStatusText(detailDevice)}</Tag>
            </div>
            <div>最后通信: {new Date(detailDevice.last_seen_at).toLocaleString('zh-CN')}</div>
            {detailDevice.last_event_at && (
              <div>最后事件: {new Date(detailDevice.last_event_at).toLocaleString('zh-CN')}</div>
            )}
            {detailDevice.battery_level != null && <div>电量: {detailDevice.battery_level}%</div>}
            {detailDevice.signal_quality != null && <div>信号质量: {detailDevice.signal_quality}%</div>}
            {detailDevice.firmware_version && <div>固件版本: {detailDevice.firmware_version}</div>}
            <div>近 1 小时错误次数: {detailDevice.error_count_1h}</div>

            <div style={{ marginTop: 16 }}>
              <strong>健康历史（最近 24 小时）</strong>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
              ) : deviceHistory.length === 0 ? (
                <div style={{ color: '#999', padding: 8 }}>暂无历史数据</div>
              ) : (
                <Timeline style={{ marginTop: 12 }} items={
                  deviceHistory.slice(0, 20).map((h: DeviceHealthDTO) => ({
                    color: h.online ? 'green' : 'gray',
                    children: (
                      <span>
                        {new Date(h.updated_at).toLocaleString('zh-CN')} —{' '}
                        {h.online ? '在线' : '离线'}
                        {h.battery_level != null ? ` | 电量 ${h.battery_level}%` : ''}
                      </span>
                    ),
                  }))
                } />
              )}
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
}
