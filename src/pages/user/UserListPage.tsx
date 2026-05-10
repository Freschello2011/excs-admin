import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Input, Select, Space, Pagination, Tag, Button } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { KeyOutlined, SyncOutlined, UserAddOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import AccountTypeTag from '@/components/authz/common/AccountTypeTag';
import Can from '@/components/authz/Can';
import QuickGrantDrawer, { type QuickGrantTarget } from '@/components/authz/QuickGrantDrawer';
import { userApi } from '@/api/user';
import { queryKeys } from '@/api/queryKeys';
import type { UserListItem } from '@/api/gen/client';
import ImportSupplierModal from './ImportSupplierModal';
import dayjs from 'dayjs';

const ROLE_OPTIONS = [
  { value: 'all', label: '全部角色' },
  { value: 'admin', label: '管理员' },
  { value: 'technician', label: '技术员' },
  { value: 'narrator', label: '讲解员' },
  { value: 'producer', label: '制作人' },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'internal', label: '内部员工' },
  { value: 'vendor', label: '供应商' },
  { value: 'customer', label: '客户' },
];

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: '管理员', color: 'red' },
  technician: { label: '技术员', color: 'blue' },
  narrator: { label: '讲解员', color: 'green' },
  producer: { label: '制作人', color: 'purple' },
};

/** 旧后端 user_type 字段 → 新统一 account_type 的双向映射（PRD §4.4） */
const USER_TYPE_TO_ACCOUNT: Record<string, string> = {
  employee: 'internal',
  supplier: 'vendor',
};
const ACCOUNT_TO_USER_TYPE: Record<string, string> = {
  internal: 'employee',
  vendor: 'supplier',
};

export default function UserListPage({ embedded }: { embedded?: boolean } = {}) {
  const { message, modal } = useMessage();
  const [searchParams, setSearchParams] = useSearchParams();

  /* P2.1（2026-04-25）：URL 同步 ?keyword=&role=&account_type=&page=&size= */
  const keyword = searchParams.get('keyword') ?? '';
  const role = searchParams.get('role') ?? 'all';
  /** UI 层一律以 account_type 为准（internal / vendor / customer），向后端发请求时映射回 user_type */
  const accountType = searchParams.get('account_type') ?? 'all';
  const page = Number(searchParams.get('page') ?? 1) || 1;
  const pageSize = useMemo(() => {
    const ps = Number(searchParams.get('size') ?? 20);
    return [20, 50, 100].includes(ps) ? ps : 20;
  }, [searchParams]);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [quickGrantTarget, setQuickGrantTarget] = useState<QuickGrantTarget | null>(null);

  /** 局部输入态：搜索框防抖前的同步绑定（按回车 / blur 才推 URL，避免每键一发） */
  const [keywordDraft, setKeywordDraft] = useState(keyword);
  useEffect(() => { setKeywordDraft(keyword); }, [keyword]);

  function patchSearch(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === '' || v === 'all') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  const setKeyword = (v: string) => patchSearch({ keyword: v, page: '1' });
  const setRole = (v: string) => patchSearch({ role: v, page: '1' });
  const setAccountType = (v: string) => patchSearch({ account_type: v, page: '1' });
  const setPage = (p: number) => patchSearch({ page: p === 1 ? undefined : String(p) });
  const setPageSize = (ps: number) => patchSearch({ size: ps === 20 ? undefined : String(ps), page: '1' });

  const queryClient = useQueryClient();

  const params = {
    page,
    page_size: pageSize,
    ...(keyword ? { keyword } : {}),
    ...(role !== 'all' ? { role } : {}),
    ...(accountType !== 'all'
      ? { user_type: ACCOUNT_TO_USER_TYPE[accountType] ?? accountType }
      : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.users(params as Record<string, unknown>),
    queryFn: () => userApi.getUsers(params),
  });

  const syncMutation = useMutation({
    mutationFn: () => userApi.syncMDMEmployees(),
    onSuccess: (result) => {
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
        <Link to={`/platform/authz/users/${record.id}`}>{name}</Link>
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
      width: 100,
      render: (t: string) => (
        <AccountTypeTag accountType={USER_TYPE_TO_ACCOUNT[t] ?? t} />
      ),
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
      width: 180,
      render: (_: unknown, record) => (
        <Space size={8}>
          <Link to={`/platform/authz/users/${record.id}`}>详情</Link>
          <Can action="user.grant">
            <Button
              size="small"
              type="link"
              icon={<KeyOutlined />}
              onClick={() => setQuickGrantTarget({
                id: record.id,
                name: record.name,
                email: record.email,
                user_type: record.user_type,
              })}
            >
              快速授权
            </Button>
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {!embedded && <PageHeader title="用户管理" description="管理系统用户和权限" />}

      <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索姓名 / 邮箱 / 手机 / user_id"
            allowClear
            style={{ width: 280 }}
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            onSearch={(v) => setKeyword(v)}
            onBlur={() => { if (keywordDraft !== keyword) setKeyword(keywordDraft); }}
          />
          <Select
            style={{ width: 140 }}
            value={role}
            onChange={setRole}
            options={ROLE_OPTIONS}
          />
          <Select
            style={{ width: 140 }}
            value={accountType}
            onChange={setAccountType}
            options={ACCOUNT_TYPE_OPTIONS}
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
            pageSizeOptions={['20', '50', '100']}
            total={total}
            showSizeChanger
            showTotal={(t) => `共 ${t} 条`}
            onChange={(p, ps) => {
              if (ps !== pageSize) setPageSize(ps);
              else setPage(p);
            }}
          />
        </div>
      )}

      <ImportSupplierModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />

      <QuickGrantDrawer
        open={!!quickGrantTarget}
        target={quickGrantTarget}
        onClose={() => setQuickGrantTarget(null)}
      />
    </div>
  );
}
