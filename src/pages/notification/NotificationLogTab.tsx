import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Select, Space, Pagination, Tag, Empty } from 'antd';
import type { TableColumnsType } from 'antd';
import { notificationApi } from '@/api/notification';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type { NotificationLogItem } from '@/types/notification';
import dayjs from 'dayjs';

const EVENT_TYPE_OPTIONS = [
  { value: 'all', label: '全部事件' },
  { value: 'content_uploaded', label: '内容上传完成' },
  { value: 'content_encrypted', label: '内容加密完成' },
  { value: 'distribution_ready', label: '分发就绪' },
  { value: 'distribution_failed', label: '分发失败' },
  { value: 'service_expiring', label: '服务即将到期' },
  { value: 'service_expired', label: '服务已过期' },
  { value: 'app_offline', label: '应用离线' },
  // NAS 归档事件（Phase 5 新增，走 sys_configs.nas.alert_user_ids 接收人，hall_id=0）
  { value: 'nas_archived', label: 'NAS 归档完成' },
  { value: 'nas_sync_failed', label: 'NAS 归档失败' },
  { value: 'nas_agent_offline', label: 'NAS Agent 离线' },
  { value: 'nas_backlog_exceeded', label: 'OSS 积压超阈值' },
];

const EVENT_LABELS: Record<string, string> = {
  content_uploaded: '内容上传完成',
  content_encrypted: '内容加密完成',
  distribution_ready: '分发就绪',
  distribution_failed: '分发失败',
  service_expiring: '服务即将到期',
  service_expired: '服务已过期',
  app_offline: '应用离线',
  nas_archived: 'NAS 归档完成',
  nas_sync_failed: 'NAS 归档失败',
  nas_agent_offline: 'NAS Agent 离线',
  nas_backlog_exceeded: 'OSS 积压超阈值',
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'green',
  failed: 'red',
  pending: 'default',
};

export default function NotificationLogTab() {
  const hallId = useHallStore((s) => s.selectedHallId);
  const [eventType, setEventType] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params = {
    page,
    page_size: pageSize,
    ...(eventType !== 'all' ? { event_type: eventType } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.notificationLogs({ hall_id: hallId, ...params } as Record<string, unknown>),
    queryFn: () => notificationApi.getLogs(hallId!, params),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  const list = data?.list ?? [];
  const total = data?.total ?? 0;

  const columns: TableColumnsType<NotificationLogItem> = [
    {
      title: '事件',
      dataIndex: 'event_type',
      width: 140,
      render: (v: string) => EVENT_LABELS[v] || v,
    },
    {
      title: '接收人',
      dataIndex: 'recipient_phone',
      width: 140,
    },
    {
      title: '内容',
      dataIndex: 'content',
      ellipsis: true,
    },
    {
      title: '发送状态',
      dataIndex: 'send_status',
      width: 100,
      render: (s: string) => (
        <Tag color={STATUS_COLORS[s] || 'default'}>
          {s === 'sent' ? '已发送' : s === 'failed' ? '失败' : s}
        </Tag>
      ),
    },
    {
      title: '时间',
      dataIndex: 'sent_at',
      width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 160 }}
          value={eventType}
          onChange={(v) => { setEventType(v); setPage(1); }}
          options={EVENT_TYPE_OPTIONS}
        />
      </Space>

      {!hallId ? (
        <Empty description="请先在顶栏选择展厅" />
      ) : (
        <>
          <Table<NotificationLogItem>
            columns={columns}
            dataSource={list}
            loading={isLoading}
            pagination={false}
            rowKey="id"
            size="middle"
          />

          {total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                showTotal={(t) => `共 ${t} 条`}
                onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
