import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Input, Select, Space, Button, Pagination, Tag, Popover, Spin } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { ExclamationCircleFilled, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import type {
  HallListItem,
  HallStatus,
  MasterCandidateDTO,
} from '@/api/gen/client';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '正常' },
  { value: 'grace', label: '宽限期' },
  { value: 'expired', label: '已过期' },
];

const REASON_ZH: Record<string, string> = {
  bootstrap: '服务启动',
  master_offline: '原主控离线',
  priority_promote: '优先级调整',
  manual_override: '管理员手动',
  no_candidate: '候补全离线',
};

/** Hover 卡片：lazy 拉 master-status 显示候补队列 */
function MasterCandidatesPopover({ hallId }: { hallId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.hallMasterStatus(hallId),
    queryFn: () => hallApi.getHallMasterStatus(hallId),
    select: (res) => res.data.data,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <div style={{ width: 240, padding: 8 }}>
        <Spin size="small" /> 加载候补队列...
      </div>
    );
  }
  if (!data) return null;
  return (
    <div style={{ width: 280, maxHeight: 320, overflowY: 'auto' }}>
      <div style={{ marginBottom: 8, color: 'rgba(0,0,0,0.55)', fontSize: 12 }}>
        候补队列（按优先级 / sort_order）
      </div>
      {(data.candidates ?? []).length === 0 ? (
        <div style={{ color: 'rgba(0,0,0,0.45)' }}>该展厅尚无展项</div>
      ) : (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {(data.candidates ?? []).map((c: MasterCandidateDTO) => (
            <div
              key={c.exhibit_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 6px',
                background: c.is_current_master ? 'rgba(22,119,255,0.06)' : undefined,
                borderRadius: 4,
              }}
            >
              <span style={{ flex: 1 }}>{c.exhibit_name}</span>
              {c.is_current_master && <Tag color="blue">主控</Tag>}
              {c.is_online ? <Tag color="green">在线</Tag> : <Tag>离线</Tag>}
            </div>
          ))}
        </Space>
      )}
      {data.last_election_at && (
        <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
          上次切换：{dayjs(data.last_election_at).fromNow()}
          {data.last_election_reason
            ? ` · ${REASON_ZH[data.last_election_reason] ?? data.last_election_reason}`
            : ''}
        </div>
      )}
    </div>
  );
}

interface CurrentMasterCellProps {
  hall: HallListItem;
}

function CurrentMasterCell({ hall }: CurrentMasterCellProps) {
  const masterId = hall.current_master_exhibit_id ?? null;
  const masterName = hall.current_master_exhibit_name ?? '';
  const reason = hall.last_election_reason;
  const noCandidate = reason === 'no_candidate';
  // master_auto_failback 在 v2 后端是 NOT NULL DEFAULT true，但 hall_master v2 部署前
  // 老 list 接口不返该字段（undefined）；这里兜底 true 避免误标"manual"。
  const autoFailback = hall.master_auto_failback ?? true;

  const tooltipReason = reason ? REASON_ZH[reason] ?? reason : '';
  const cell = (
    <Space size={4}>
      {masterId == null ? (
        <Tag color={noCandidate ? 'error' : 'default'}>
          {noCandidate ? <ExclamationCircleFilled style={{ marginRight: 4 }} /> : null}
          无主控
        </Tag>
      ) : (
        <Tag color="blue">{masterName || `#${masterId}`}</Tag>
      )}
      <Tag color={autoFailback ? 'success' : 'warning'}>
        {autoFailback ? 'auto' : 'manual'}
      </Tag>
      {tooltipReason && reason !== 'no_candidate' && (
        <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>{tooltipReason}</span>
      )}
    </Space>
  );

  return (
    <Popover
      content={<MasterCandidatesPopover hallId={hall.id} />}
      trigger={['hover']}
      placement="left"
      mouseEnterDelay={0.2}
    >
      <span style={{ cursor: 'help' }}>{cell}</span>
    </Popover>
  );
}

export default function HallListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<HallStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params = {
    page,
    page_size: pageSize,
    ...(keyword ? { keyword } : {}),
    ...(status !== 'all' ? { status } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.halls(params as Record<string, unknown>),
    queryFn: () => hallApi.getHalls(params),
    select: (res) => res.data.data,
    refetchInterval: 30_000, // 跟选举器 30s 兜底定时器同节奏
  });

  const syncMutation = useMutation({
    mutationFn: () => hallApi.syncMdm(),
    onSuccess: (res) => {
      const d = res.data.data;
      message.success(`同步完成：新增 ${d.created}，更新 ${d.updated}`);
      queryClient.invalidateQueries({ queryKey: ['halls'] });
    },
  });

  const list = data?.list ?? [];
  const total = data?.total ?? 0;

  const columns: TableColumnsType<HallListItem> = [
    {
      title: '编号',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: '展厅名称',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Link to={`/halls/${record.id}`}>{name}</Link>
      ),
    },
    {
      title: '服务状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <StatusTag status={s === 'active' ? 'normal' : s} />,
    },
    {
      title: '当前主控',
      width: 260,
      render: (_: unknown, record) => <CurrentMasterCell hall={record} />,
    },
    {
      title: '展项数',
      dataIndex: 'exhibit_count',
      width: 80,
      align: 'center',
    },
    {
      title: '设备数',
      dataIndex: 'device_count',
      width: 80,
      align: 'center',
    },
    {
      title: '在线实例',
      width: 100,
      align: 'center',
      render: (_: unknown, record) => (
        <span>{record.online_instance_count ?? 0} / {record.app_instance_count}</span>
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record) => (
        <Link to={`/halls/${record.id}`}>详情</Link>
      ),
    },
  ];

  const handlePageChange = (p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
  };

  return (
    <div>
      <PageHeader
        title="展厅列表"
        description="管理所有展厅"
        extra={
          isAdmin() ? (
            <Button
              icon={<SyncOutlined />}
              loading={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              MDM 同步
            </Button>
          ) : undefined
        }
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索展厅名称..."
          allowClear
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          onSearch={() => setPage(1)}
        />
        <Select
          style={{ width: 140 }}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={STATUS_OPTIONS}
        />
      </Space>

      <Table<HallListItem>
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
            onChange={handlePageChange}
          />
        </div>
      )}
    </div>
  );
}

