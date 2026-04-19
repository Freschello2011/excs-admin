import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Input, Select, Space, Button, Pagination } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import type { HallListItem, HallStatus } from '@/types/hall';

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '正常' },
  { value: 'grace', label: '宽限期' },
  { value: 'expired', label: '已过期' },
];

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
        <span>{record.online_instance_count} / {record.app_instance_count}</span>
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
