import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  Button,
  DatePicker,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import { useAuthStore } from '@/stores/authStore';
import Can from '@/components/authz/Can';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import ExpiryTag from '@/components/authz/common/ExpiryTag';
import ScopeTag from '@/components/authz/common/ScopeTag';
import QuickGrantDrawer, { type QuickGrantTarget } from '@/components/authz/QuickGrantDrawer';
import { authzApi } from '@/api/authz';
import { hallApi } from '@/api/hall';
import { userApi } from '@/api/user';
import { queryKeys } from '@/api/queryKeys';
import type { Grant, GrantStatusType, RoleTemplate, ScopeType } from '@/api/gen/client';
import type { UserListItem } from '@/api/gen/client';

const STATUS_META: Record<GrantStatusType, { label: string; color: string }> = {
  active: { label: '生效中', color: 'green' },
  expired: { label: '已过期', color: 'default' },
  revoked: { label: '已撤销', color: 'red' },
};

export default function GrantListPage({ embedded }: { embedded?: boolean } = {}) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const refreshActionSet = useAuthStore((s) => s.refreshActionSet);

  /* P2.2（2026-04-25）：URL 同步 ?status=&scope=&hall=&keyword=&template=&phase5a= */
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = (searchParams.get('status') ?? 'active') as 'all' | GrantStatusType;
  const scopeFilter = (searchParams.get('scope') ?? 'all') as 'all' | ScopeType;
  const scopeHallId = searchParams.get('hall')
    ? Number(searchParams.get('hall'))
    : undefined;
  const userKeyword = searchParams.get('keyword') ?? '';
  const templateKeyword = searchParams.get('template') ?? '';
  const phase5aOnly = searchParams.get('phase5a') === '1';

  function patch(p: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(p).forEach(([k, v]) => {
      if (v == null || v === '' || v === 'all' || v === '0') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }
  const setStatusFilter = (v: 'all' | GrantStatusType) => patch({ status: v === 'active' ? undefined : v });
  const setScopeFilter = (v: 'all' | ScopeType) =>
    patch({ scope: v, hall: v === 'H' ? searchParams.get('hall') ?? undefined : undefined });
  const setScopeHallId = (v: number | undefined) => patch({ hall: v ? String(v) : undefined });
  const setUserKeyword = (v: string) => patch({ keyword: v });
  const setTemplateKeyword = (v: string) => patch({ template: v });
  const setPhase5aOnly = (v: boolean) => patch({ phase5a: v ? '1' : undefined });

  const [userKeywordDraft, setUserKeywordDraft] = useState(userKeyword);
  const [templateKeywordDraft, setTemplateKeywordDraft] = useState(templateKeyword);
  useEffect(() => { setUserKeywordDraft(userKeyword); }, [userKeyword]);
  useEffect(() => { setTemplateKeywordDraft(templateKeyword); }, [templateKeyword]);

  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [extending, setExtending] = useState<Grant | null>(null);
  const [extendValue, setExtendValue] = useState<Dayjs | null>(null);
  const [quickGrantTarget, setQuickGrantTarget] = useState<QuickGrantTarget | null>(null);
  const [quickGrantPickOpen, setQuickGrantPickOpen] = useState(false);

  const { data: grants, isLoading } = useQuery({
    queryKey: ['authz', 'grants', { include_inactive: statusFilter !== 'active' }],
    queryFn: () =>
      authzApi.listGrants({ include_inactive: statusFilter !== 'active' }),
    select: (res) => res.data.data?.list ?? [],
  });

  const { data: templates } = useQuery({
    queryKey: ['authz', 'role-templates'],
    queryFn: () => authzApi.listTemplates(),
    select: (res) => res.data.data?.list ?? [],
  });

  const { data: halls } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data?.list ?? [],
  });

  const { data: users } = useQuery({
    queryKey: queryKeys.users({ page: 1, page_size: 200 }),
    queryFn: () => userApi.getUsers({ page: 1, page_size: 200 }),
    select: (res) => res.list ?? [],
  });

  const templateMap = useMemo(() => {
    const m = new Map<number, RoleTemplate>();
    (templates ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [templates]);

  const userMap = useMemo(() => {
    const m = new Map<number, UserListItem>();
    (users ?? []).forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const hallMap = useMemo(() => {
    const m = new Map<number, string>();
    (halls ?? []).forEach((h) => m.set(h.id, h.name));
    return m;
  }, [halls]);

  const filtered = useMemo(() => {
    const list = grants ?? [];
    return list.filter((g) => {
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (scopeFilter !== 'all' && g.scope_type !== scopeFilter) return false;
      // 进一步：scope=H 时若指定了 hall，过滤 scope_id 匹配
      if (scopeFilter === 'H' && scopeHallId && Number(g.scope_id) !== scopeHallId) return false;
      if (phase5aOnly) {
        const reason = g.reason ?? '';
        if (!reason.includes('migrate_hall_permissions')) return false;
      }
      if (userKeyword) {
        const u = userMap.get(g.user_id);
        const hay = [u?.name, u?.email, u?.phone, String(g.user_id)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(userKeyword.toLowerCase())) return false;
      }
      if (templateKeyword) {
        const t = templateMap.get(g.role_template_id);
        const hay = [t?.name_zh, t?.code, String(g.role_template_id)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(templateKeyword.toLowerCase())) return false;
      }
      return true;
    });
  }, [grants, statusFilter, scopeFilter, scopeHallId, userKeyword, userMap, phase5aOnly, templateKeyword, templateMap]);

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      authzApi.revokeGrant(id, { reason }),
    onMutate: ({ id }) => setRevokingId(id),
    onSuccess: async (_res, vars) => {
      message.success('授权已撤销');
      queryClient.invalidateQueries({ queryKey: ['authz', 'grants'] });
      const g = grants?.find((x) => x.id === vars.id);
      if (g && g.user_id === currentUser?.id) {
        try {
          await refreshActionSet();
        } catch {
          // swallow
        }
      }
      setRevokingId(null);
    },
    onError: (err: Error) => {
      message.error(err.message || '撤销失败');
      setRevokingId(null);
    },
  });

  const extendMutation = useMutation({
    mutationFn: ({ id, newExpiresAt }: { id: number; newExpiresAt: string }) =>
      authzApi.extendGrant(id, { new_expires_at: newExpiresAt }),
    onSuccess: () => {
      message.success('已续期');
      queryClient.invalidateQueries({ queryKey: ['authz', 'grants'] });
      setExtending(null);
      setExtendValue(null);
    },
    onError: (err: Error) => message.error(err.message || '续期失败'),
  });

  function confirmExtend() {
    if (!extending || !extendValue) return;
    extendMutation.mutate({
      id: extending.id,
      newExpiresAt: extendValue.toISOString(),
    });
  }

  const columns: TableColumnsType<Grant> = [
    {
      title: '用户',
      dataIndex: 'user_id',
      render: (uid: number) => {
        const u = userMap.get(uid);
        return u ? (
          <Link to={`/platform/authz/users/${uid}`}>{u.name}</Link>
        ) : (
          <span>#{uid}</span>
        );
      },
    },
    {
      title: '模板',
      dataIndex: 'role_template_id',
      render: (tid: number, record) => {
        const t = templateMap.get(tid);
        return (
          <Space direction="vertical" size={0}>
            <strong>{t?.name_zh ?? `#${tid}`}</strong>
            <span style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
              {t?.code ?? ''} · v{record.role_template_version}
            </span>
          </Space>
        );
      },
    },
    {
      title: '范围',
      render: (_: unknown, record) => (
        <ScopeTag
          scopeType={record.scope_type as ScopeType}
          scopeId={record.scope_id}
          hallNameMap={hallMap}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: GrantStatusType) => {
        const meta = STATUS_META[s] ?? { label: s, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '授予时间',
      dataIndex: 'granted_at',
      width: 150,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '到期',
      dataIndex: 'expires_at',
      width: 200,
      render: (v?: string | null) => <ExpiryTag expiresAt={v} variant="full" />,
    },
    {
      title: '授予人',
      dataIndex: 'granted_by',
      width: 120,
      render: (uid: number) => userMap.get(uid)?.name ?? `#${uid}`,
    },
    {
      title: '操作',
      width: 180,
      render: (_: unknown, record) => (
        <Space size="small">
          {record.status === 'active' && (
            <>
              <Can action="user.grant">
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    setExtending(record);
                    setExtendValue(
                      record.expires_at ? dayjs(record.expires_at).add(90, 'day') : dayjs().add(90, 'day'),
                    );
                  }}
                >
                  续期
                </Button>
              </Can>
              <Can action="user.grant">
                <RiskyActionButton
                  action="user.grant"
                  size="small"
                  type="link"
                  danger
                  loading={revokingId === record.id}
                  confirmTitle={`撤销授权 #${record.id}`}
                  confirmContent={(() => {
                    const t = templateMap.get(record.role_template_id);
                    const u = userMap.get(record.user_id);
                    return t?.has_critical
                      ? `被撤销用户：${u?.name ?? `#${record.user_id}`}；模板「${t.name_zh}」含 critical，需输入撤销原因（≥ 5 字）`
                      : `被撤销用户：${u?.name ?? `#${record.user_id}`}；模板「${t?.name_zh ?? `#${record.role_template_id}`}」`;
                  })()}
                  forceRiskLevel={
                    templateMap.get(record.role_template_id)?.has_critical ? 'critical' : 'high'
                  }
                  onConfirm={async (reason) => {
                    await revokeMutation.mutateAsync({ id: record.id, reason });
                  }}
                >
                  撤销
                </RiskyActionButton>
              </Can>
            </>
          )}
          {record.status !== 'active' && (
            <span style={{ color: 'var(--ant-color-text-tertiary)' }}>-</span>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {!embedded && <PageHeader description="授权总览：查看所有用户的授权记录，支持续期、撤销。" />}

      <Space
        wrap
        style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}
      >
        <Space wrap>
          <Input.Search
            placeholder="搜索用户姓名 / 邮箱 / 手机 / user_id"
            allowClear
            style={{ width: 260 }}
            value={userKeywordDraft}
            onChange={(e) => setUserKeywordDraft(e.target.value)}
            onSearch={(v) => setUserKeyword(v)}
            onBlur={() => { if (userKeywordDraft !== userKeyword) setUserKeyword(userKeywordDraft); }}
          />
          <Input.Search
            placeholder="搜索模板名 / code"
            allowClear
            style={{ width: 200 }}
            value={templateKeywordDraft}
            onChange={(e) => setTemplateKeywordDraft(e.target.value)}
            onSearch={(v) => setTemplateKeyword(v)}
            onBlur={() => { if (templateKeywordDraft !== templateKeyword) setTemplateKeyword(templateKeywordDraft); }}
          />
          <Select
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: 'active', label: '仅生效中' },
              { value: 'all', label: '全部状态' },
              { value: 'expired', label: '已过期' },
              { value: 'revoked', label: '已撤销' },
            ]}
          />
          <Select
            style={{ width: 140 }}
            value={scopeFilter}
            onChange={(v) => setScopeFilter(v)}
            options={[
              { value: 'all', label: '全部范围' },
              { value: 'G', label: '全局 G' },
              { value: 'H', label: '展厅 H' },
              { value: 'E', label: '展项 E' },
              { value: 'T', label: '租户 T' },
              { value: 'O', label: '归属 O' },
            ]}
          />
          {scopeFilter === 'H' && (
            <Select
              style={{ width: 200 }}
              placeholder="筛选具体展厅"
              allowClear
              value={scopeHallId}
              onChange={setScopeHallId}
              options={(halls ?? []).map((h) => ({ value: h.id, label: h.name }))}
              showSearch
              optionFilterProp="label"
            />
          )}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['authz', 'grants'] })}
          >
            刷新
          </Button>
          <Tooltip title="仅显示 Phase 5a migrate_hall_permissions 脚本创建的 Grant，便于批量复核">
            <Space>
              <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
                仅 Phase 5 迁移
              </span>
              <Switch
                size="small"
                checked={phase5aOnly}
                onChange={setPhase5aOnly}
              />
            </Space>
          </Tooltip>
        </Space>
        <Can action="user.grant">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setQuickGrantPickOpen(true)}
          >
            新建授权
          </Button>
        </Can>
      </Space>

      <Table<Grant>
        columns={columns}
        dataSource={filtered}
        loading={isLoading}
        rowKey="id"
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        size="middle"
      />

      <Modal
        title={`续期授权 #${extending?.id ?? ''}`}
        open={!!extending}
        onCancel={() => {
          setExtending(null);
          setExtendValue(null);
        }}
        onOk={confirmExtend}
        okText="续期"
        okButtonProps={{ loading: extendMutation.isPending, disabled: !extendValue }}
      >
        <p>
          当前到期：
          {extending?.expires_at
            ? dayjs(extending.expires_at).format('YYYY-MM-DD HH:mm')
            : '永久'}
        </p>
        <DatePicker
          showTime
          style={{ width: 320 }}
          value={extendValue}
          onChange={setExtendValue}
          placeholder="新到期时间"
        />
      </Modal>

      {/* 新建授权：先选用户 → 打开 QuickGrantDrawer（P2.2 优化） */}
      <Modal
        title="选择被授权用户"
        open={quickGrantPickOpen}
        onCancel={() => setQuickGrantPickOpen(false)}
        footer={null}
        width={640}
        destroyOnHidden
      >
        <Input.Search
          placeholder="按姓名 / 邮箱 / 手机过滤（仅本页搜索；未在列表的请先去用户页导入）"
          allowClear
          style={{ marginBottom: 12 }}
          onChange={(e) => setUserKeyword(e.target.value)}
        />
        <Table<UserListItem>
          size="small"
          rowKey="id"
          pagination={{ pageSize: 10, size: 'small' }}
          dataSource={users ?? []}
          columns={[
            { title: '姓名', dataIndex: 'name' },
            { title: '邮箱', dataIndex: 'email' },
            { title: 'ID', dataIndex: 'id', width: 60 },
          ]}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => {
              setQuickGrantTarget({
                id: record.id,
                name: record.name,
                email: record.email,
                user_type: record.user_type,
              });
              setQuickGrantPickOpen(false);
            },
          })}
        />
      </Modal>

      <QuickGrantDrawer
        open={!!quickGrantTarget}
        target={quickGrantTarget}
        onClose={() => setQuickGrantTarget(null)}
      />
    </div>
  );
}
