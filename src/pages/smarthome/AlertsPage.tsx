import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Select, Space, Button, Tag,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { smarthomeApi } from '@/api/smarthome';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type { HallListItem } from '@/types/hall';
import type { AlertDTO, AlertLevel } from '@/types/smarthome';

/* ==================== 常量映射 ==================== */

const ALERT_LEVEL_MAP: Record<AlertLevel, { color: string; text: string }> = {
  p0_critical: { color: 'red', text: 'P0 紧急' },
  p1_important: { color: 'orange', text: 'P1 重要' },
  p2_info: { color: 'blue', text: 'P2 提示' },
};

const ALERT_EVENT_LABELS: Record<string, string> = {
  smarthome_gateway_offline: '网关离线',
  smarthome_batch_device_offline: '多设备同时离线',
  smarthome_device_offline: '设备离线',
  smarthome_sensor_battery_low: '传感器低电量',
  smarthome_rule_anomaly: '规则触发异常',
  smarthome_firmware_update: '固件更新可用',
  smarthome_ip_changed: '网关 IP 变更',
};

/* ==================== 组件 ==================== */

const ALERT_LEVEL_OPTIONS = [
  { value: '', label: '全部级别' },
  { value: 'p0_critical', label: 'P0 紧急' },
  { value: 'p1_important', label: 'P1 重要' },
  { value: 'p2_info', label: 'P2 提示' },
];

const ALERT_EVENT_OPTIONS = [
  { value: '', label: '全部类型' },
  ...Object.entries(ALERT_EVENT_LABELS).map(([value, label]) => ({ value, label })),
];

export default function AlertsPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const setSelectedHall = useHallStore((s) => s.setSelectedHall);
  const clearSelectedHall = useHallStore((s) => s.clearSelectedHall);
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterEventType, setFilterEventType] = useState<string>('');

  // Halls dropdown
  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 } as Record<string, unknown>),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data,
  });
  const halls = hallsData?.list ?? [];
  const hallOptions = halls.map((h: HallListItem) => ({ value: h.id, label: h.name }));

  // Alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: queryKeys.smarthomeAlerts(selectedHallId!),
    queryFn: () => smarthomeApi.listAlerts(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
    refetchInterval: 30_000,
  });

  // Ack mutation
  const ackMutation = useMutation({
    mutationFn: smarthomeApi.ackAlert,
    onSuccess: () => {
      message.success('告警已确认');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'alerts'] });
    },
    onError: () => {
      message.error('确认告警失败，请重试');
    },
  });

  // Apply client-side filters
  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (filterLevel) result = result.filter((a) => a.level === filterLevel);
    if (filterEventType) result = result.filter((a) => a.event_type === filterEventType);
    return result;
  }, [alerts, filterLevel, filterEventType]);

  const columns: TableColumnsType<AlertDTO> = [
    {
      title: '级别', dataIndex: 'level', width: 110,
      render: (v: AlertLevel) => {
        const cfg = ALERT_LEVEL_MAP[v] ?? { color: 'default', text: v };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
      sorter: (a, b) => {
        const order: Record<string, number> = { p0_critical: 0, p1_important: 1, p2_info: 2 };
        return (order[a.level] ?? 3) - (order[b.level] ?? 3);
      },
      defaultSortOrder: 'ascend',
    },
    {
      title: '告警类型', dataIndex: 'event_type', width: 180,
      render: (v: string) => ALERT_EVENT_LABELS[v] ?? v,
    },
    {
      title: '描述', dataIndex: 'message', ellipsis: true,
    },
    {
      title: '关联设备', width: 120,
      render: (_: unknown, record: AlertDTO) => {
        if (record.device_id) return `设备 #${record.device_id}`;
        if (record.gateway_id) return `网关 #${record.gateway_id}`;
        return '-';
      },
    },
    {
      title: '发生时间', dataIndex: 'created_at', width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作', width: 100,
      render: (_: unknown, record: AlertDTO) => (
        <Button
          type="link"
          icon={<CheckOutlined />}
          loading={ackMutation.isPending}
          onClick={() => ackMutation.mutate(record.key)}
        >
          确认
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="告警列表" description="查看和处理智能家居系统告警" />

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
        <Select
          style={{ width: 130 }}
          value={filterLevel}
          onChange={setFilterLevel}
          options={ALERT_LEVEL_OPTIONS}
        />
        <Select
          style={{ width: 160 }}
          value={filterEventType}
          onChange={setFilterEventType}
          options={ALERT_EVENT_OPTIONS}
        />
        {selectedHallId && !isLoading && (
          <Tag color={filteredAlerts.length > 0 ? 'red' : 'default'}>
            {filteredAlerts.length}/{alerts.length} 条告警
          </Tag>
        )}
      </Space>

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>请先选择展厅</div>
      ) : (
        <Table
          columns={columns}
          dataSource={filteredAlerts}
          loading={isLoading}
          pagination={false}
          rowKey="key"
          locale={{ emptyText: '暂无告警' }}
          size="middle"
          scroll={{ x: 900 }}
        />
      )}
    </div>
  );
}
