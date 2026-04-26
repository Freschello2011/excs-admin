import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table, Select, Space, Tag, DatePicker, Pagination, Tooltip,
} from 'antd';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { smarthomeApi } from '@/api/smarthome';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type { HallListItem } from '@/api/gen/client';
import type { TriggerLogDTO, EventRuleDTO } from '@/api/gen/client';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

/* ==================== 常量映射 ==================== */

const EVENT_TYPE_LABELS: Record<string, string> = {
  motion_detected: '检测到运动',
  motion_cleared: '运动消失',
  button_pressed: '按钮按下',
  switch_on: '开关打开',
  switch_off: '开关关闭',
  temperature_alarm: '温度报警',
  humidity_alarm: '湿度报警',
  device_online: '设备上线',
  device_offline: '设备离线',
};

const SKIP_REASON_LABELS: Record<string, string> = {
  cooldown: '防抖冷却',
  condition_not_met: '条件不满足',
  state_unchanged: '状态未变',
  debug_mode: '调试模式',
};

type FilterMode = 'all' | 'triggered' | 'skipped';

/* ==================== 组件 ==================== */

export default function TriggerLogsPage() {
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const setSelectedHall = useHallStore((s) => s.setSelectedHall);
  const clearSelectedHall = useHallStore((s) => s.clearSelectedHall);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [ruleId, setRuleId] = useState<string | undefined>();
  const [eventType, setEventType] = useState<string | undefined>();
  const [timeRange, setTimeRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  // Halls dropdown
  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 } as Record<string, unknown>),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data,
  });
  const halls = hallsData?.list ?? [];
  const hallOptions = halls.map((h: HallListItem) => ({ value: h.id, label: h.name }));

  // Rules list for filter dropdown
  const { data: rules = [] } = useQuery({
    queryKey: queryKeys.smarthomeRules(selectedHallId!),
    queryFn: () => smarthomeApi.listRules(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });
  const ruleOptions = [
    { value: '', label: '全部规则' },
    ...rules.map((r) => ({ value: r.id, label: r.name })),
  ];

  // Build params
  const params = {
    hall_id: selectedHallId!,
    page,
    page_size: pageSize,
    ...(filterMode === 'triggered' ? { triggered_only: true } : {}),
    ...(filterMode === 'skipped' ? { skip_only: true } : {}),
    ...(ruleId ? { rule_id: ruleId } : {}),
    ...(eventType ? { event_type: eventType } : {}),
    ...(timeRange?.[0] ? { since: timeRange[0].toISOString() } : {}),
    ...(timeRange?.[1] ? { until: timeRange[1].toISOString() } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.triggerLogs(params as Record<string, unknown>),
    queryFn: () => smarthomeApi.listTriggerLogs(params),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  const list = data?.list ?? [];
  const total = data?.total ?? 0;

  const handlePageChange = (p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
  };

  const columns: TableColumnsType<TriggerLogDTO> = [
    {
      title: '时间', dataIndex: 'created_at', width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '规则', dataIndex: 'rule_id', width: 140,
      render: (v: string | null) => {
        if (!v) return <Tag>手动</Tag>;
        const rule = rules.find((r: EventRuleDTO) => r.id === v);
        return <span title={v}>{rule?.name ?? v.slice(0, 8) + '...'}</span>;
      },
    },
    { title: '设备 ID', dataIndex: 'device_id', width: 90, align: 'center' },
    {
      title: '事件类型', dataIndex: 'event_type', width: 130,
      render: (v: string) => EVENT_TYPE_LABELS[v] ?? v,
    },
    {
      title: '结果', width: 140,
      render: (_: unknown, record: TriggerLogDTO) => {
        if (record.triggered) {
          return <Tag color="success">已触发</Tag>;
        }
        const reason = SKIP_REASON_LABELS[record.skip_reason] ?? record.skip_reason;
        const isDebug = record.skip_reason === 'debug_mode';
        return (
          <Space size={4}>
            <Tag color={isDebug ? 'orange' : 'default'}>
              {isDebug && '[调试] '}已过滤
            </Tag>
            <span style={{ fontSize: 12, color: '#999' }}>{reason}</span>
          </Space>
        );
      },
    },
    {
      title: '事件数据', dataIndex: 'event_data', width: 200, ellipsis: true,
      render: (v: Record<string, unknown> | null) => {
        if (!v) return '-';
        const json = JSON.stringify(v, null, 2);
        return (
          <Tooltip title={<pre style={{ margin: 0, maxHeight: 300, overflow: 'auto', fontSize: 12 }}>{json}</pre>} overlayStyle={{ maxWidth: 480 }}>
            <span style={{ cursor: 'pointer' }}>{JSON.stringify(v)}</span>
          </Tooltip>
        );
      },
    },
  ];

  const eventTypeOptions = [
    { value: '', label: '全部事件' },
    ...Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  ];

  return (
    <div>
      <PageHeader title="触发日志" description="查看智能家居规则触发和事件记录" />

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="选择展厅"
          style={{ width: 220 }}
          value={selectedHallId}
          onChange={(v) => {
            const hall = halls.find((h: HallListItem) => h.id === v);
            if (hall) { setSelectedHall(v, hall.name); setPage(1); }
          }}
          onClear={() => { clearSelectedHall(); }}
          allowClear
          options={hallOptions}
        />
        <Select
          style={{ width: 140 }}
          value={filterMode}
          onChange={(v) => { setFilterMode(v); setPage(1); }}
          options={[
            { value: 'all', label: '全部' },
            { value: 'triggered', label: '仅触发' },
            { value: 'skipped', label: '仅过滤' },
          ]}
        />
        <Select
          style={{ width: 180 }}
          value={ruleId ?? ''}
          onChange={(v) => { setRuleId(v || undefined); setPage(1); }}
          options={ruleOptions}
        />
        <Select
          style={{ width: 160 }}
          placeholder="事件类型"
          value={eventType}
          onChange={(v) => { setEventType(v || undefined); setPage(1); }}
          allowClear
          options={eventTypeOptions}
        />
        <RangePicker
          showTime
          placeholder={['开始时间', '结束时间']}
          onChange={(dates) => {
            setTimeRange(dates as [Dayjs | null, Dayjs | null] | null);
            setPage(1);
          }}
        />
      </Space>

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>请先选择展厅</div>
      ) : (
        <>
          <Table
            columns={columns}
            dataSource={list}
            loading={isLoading}
            pagination={false}
            rowKey="id"
            size="middle"
            scroll={{ x: 1000 }}
            locale={{ emptyText: '暂无触发日志' }}
          />
          {total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                showTotal={(t) => `共 ${t} 条`}
                onChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
