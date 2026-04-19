import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Input, Select, Space, Pagination, Tag, Button } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { SyncOutlined, UserAddOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { userApi } from '@/api/user';
import { queryKeys } from '@/api/queryKeys';
import type { UserListItem } from '@/types/auth';
import ImportSupplierModal from './ImportSupplierModal';
import dayjs from 'dayjs';

const ROLE_OPTIONS = [
  { value: 'all', label: '全部角色' },
  { value: 'admin', label: '管理员' },
  { value: 'technician', label: '技术员' },
  { value: 'narrator', label: '讲解员' },
  { value: 'producer', label: '制作人' },
];

const USER_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'employee', label: '员工' },
  { value: 'supplier', label: '供应商' },
];

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: '管理员', color: 'red' },
  technician: { label: '技术员', color: 'blue' },
  narrator: { label: '讲解员', color: 'green' },
  producer: { label: '制作人', color: 'purple' },
};

const USER_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  employee: { label: '员工', color: 'cyan' },
  supplier: { label: '供应商', color: 'orange' },
};

export default function UserListPage() {
  const { message, modal } = useMessage();
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState<string>('all');
  const [userType, setUserType] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const queryClient = useQueryClient();

  const params = {
    page,
    page_size: pageSize,
    ...(keyword ? { keyword } : {}),
    ...(role !== 'all' ? { role } : {}),
    ...(userType !== 'all' ? { user_type: userType } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.users(params as Record<string, unknown>),
    queryFn: () => userApi.getUsers(params),
    select: (res) => res.data.data,
  });

  const syncMutation = useMutation({
    mutationFn: () => userApi.syncMDMEmployees(),
    onSuccess: (res) => {
      const result = res.data.data;
      modal.success({
        title: 'MDM 员工同步完成',
        content: `共 ${result.total} 名员工，新增 ${result.created} 人，跳过 ${result.skipped} 人，失败 ${result.failed} 人`,
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      message.error('同步 MDM 员工失败');
    },
  });

  const list = data?.list ?? [];
  const total = data?.total ?? 0;

  const columns: TableColumnsType<UserListItem> = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Link to={`/users/${record.id}`}>{name}</Link>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      width: 200,
    },
    {
      title: '类型',
      dataIndex: 'user_type',
      width: 90,
      render: (t: string) => {
        const cfg = USER_TYPE_LABELS[t];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{t}</Tag>;
      },
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 100,
      render: (r: string) => {
        const cfg = ROLE_LABELS[r];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{r}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (s: string) => (
        <Tag color={s === 'active' ? 'green' : 'default'}>
          {s === 'active' ? '正常' : s}
        </Tag>
      ),
    },
    {
      title: '展厅数',
      dataIndex: 'hall_count',
      width: 80,
      align: 'center',
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record) => (
        <Link to={`/users/${record.id}`}>详情</Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="用户管理" description="管理系统用户和权限" />

      <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索姓名、邮箱、手机..."
            allowClear
            style={{ width: 260 }}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            onSearch={() => setPage(1)}
          />
          <Select
            style={{ width: 140 }}
            value={role}
            onChange={(v) => { setRole(v); setPage(1); }}
            options={ROLE_OPTIONS}
          />
          <Select
            style={{ width: 140 }}
            value={userType}
            onChange={(v) => { setUserType(v); setPage(1); }}
            options={USER_TYPE_OPTIONS}
          />
        </Space>
        <Space>
          <Button
            icon={<SyncOutlined />}
            loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            同步MDM员工
          </Button>
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => setImportModalOpen(true)}
          >
            导入供应商
          </Button>
        </Space>
      </Space>

      <Table<UserListItem>
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

      <ImportSupplierModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />
    </div>
  );
}
