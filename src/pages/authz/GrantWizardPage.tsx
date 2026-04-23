import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Divider,
  Input,
  Radio,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
  Progress,
} from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import { useAuthStore } from '@/stores/authStore';
import { userApi } from '@/api/user';
import { hallApi } from '@/api/hall';
import { authzApi } from '@/api/authz';
import { queryKeys } from '@/api/queryKeys';
import type { CreateGrantBody, RoleTemplate, ScopeType } from '@/types/authz';
import type { UserListItem } from '@/types/auth';
import { makeDefaultExpiry } from '@/lib/authz/expiry';

const { Text, Paragraph } = Typography;

type ScopeMode = 'G' | 'H';

interface WizardState {
  /** 被授权用户 */
  userId?: number;
  user?: UserListItem;
  /** 已选模板 id */
  templateIds: number[];
  /** 范围选择 */
  scopeMode: ScopeMode;
  scopeHallId?: number;
  /** 过期时间（null = 永久；critical/vendor 不允许空） */
  expiresAt: Dayjs | null;
  /** 操作原因 */
  reason: string;
}

export default function GrantWizardPage() {
  const { userId: userIdParam } = useParams<{ userId?: string }>();
  const initialUserId = userIdParam ? Number(userIdParam) : undefined;

  const navigate = useNavigate();
  const { message, modal } = useMessage();
  const currentUser = useAuthStore((s) => s.user);
  const refreshActionSet = useAuthStore((s) => s.refreshActionSet);

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    userId: initialUserId,
    templateIds: [],
    scopeMode: 'G',
    expiresAt: null,
    reason: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{ done: number; total: number } | null>(null);

  /* -------- 数据查询 -------- */

  const [userKeyword, setUserKeyword] = useState('');
  const { data: userListRes, isLoading: loadingUsers } = useQuery({
    queryKey: queryKeys.users({ page: 1, page_size: 50, keyword: userKeyword }),
    queryFn: () =>
      userApi.getUsers({
        page: 1,
        page_size: 50,
        ...(userKeyword ? { keyword: userKeyword } : {}),
      }),
    select: (res) => res.data.data?.list ?? [],
  });

  const { data: preFilledUser } = useQuery({
    queryKey: queryKeys.userDetail(initialUserId ?? 0),
    queryFn: () => userApi.getUser(initialUserId!),
    select: (res) => res.data.data,
    enabled: !!initialUserId && !state.user,
  });

  useEffect(() => {
    if (preFilledUser && !state.user) {
      setState((prev) => ({
        ...prev,
        userId: preFilledUser.id,
        user: {
          id: preFilledUser.id,
          sso_user_id: preFilledUser.sso_user_id,
          name: preFilledUser.name,
          email: preFilledUser.email,
          phone: preFilledUser.phone,
          role: preFilledUser.role,
          user_type: preFilledUser.user_type,
          status: preFilledUser.status,
          hall_count: preFilledUser.hall_permissions?.length ?? 0,
          created_at: preFilledUser.created_at,
          last_login_at: preFilledUser.last_login_at,
        },
      }));
    }
  }, [preFilledUser, state.user]);

  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ['authz', 'role-templates'],
    queryFn: () => authzApi.listTemplates(),
    select: (res) => res.data.data?.list ?? [],
  });

  const { data: halls, isLoading: loadingHalls } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data?.list ?? [],
  });

  /* -------- 派生数据 -------- */

  const selectedTemplates = useMemo<RoleTemplate[]>(
    () => (templates ?? []).filter((t) => state.templateIds.includes(t.id)),
    [templates, state.templateIds],
  );

  const mergedActions = useMemo(() => {
    const set = new Set<string>();
    for (const t of selectedTemplates) {
      (t.action_codes ?? []).forEach((c) => set.add(c));
    }
    return Array.from(set).sort();
  }, [selectedTemplates]);

  const hasCritical = useMemo(
    () => selectedTemplates.some((t) => t.has_critical),
    [selectedTemplates],
  );

  const isVendor = state.user?.user_type === 'supplier';

  // 模板确定后按规则设默认过期时间（只在用户未手动填时覆盖）
  const [expiryTouched, setExpiryTouched] = useState(false);
  useEffect(() => {
    if (expiryTouched) return;
    if (state.templateIds.length === 0) return;
    const def = makeDefaultExpiry(hasCritical, isVendor ? 'vendor' : 'internal');
    setState((prev) => ({ ...prev, expiresAt: def }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCritical, isVendor, state.templateIds.length]);

  /* -------- 步骤校验 -------- */

  const canNext = useMemo(() => {
    if (step === 0) return !!state.userId;
    if (step === 1) return state.templateIds.length > 0;
    if (step === 2) {
      if (state.scopeMode === 'H' && !state.scopeHallId) return false;
      if ((hasCritical || isVendor) && !state.expiresAt) return false;
      if (hasCritical && state.reason.trim().length < 5) return false;
      return true;
    }
    return true;
  }, [step, state, hasCritical, isVendor]);

  /* -------- 提交 -------- */

  async function handleSubmit() {
    if (!state.userId || state.templateIds.length === 0) return;

    const scopeType: ScopeType = state.scopeMode;
    const scopeId = scopeType === 'H' ? String(state.scopeHallId ?? '') : '';
    const expiresAt = state.expiresAt ? state.expiresAt.toISOString() : null;

    const bodies: CreateGrantBody[] = state.templateIds.map((tid) => ({
      user_id: state.userId!,
      template_id: tid,
      scope_type: scopeType,
      scope_id: scopeId,
      expires_at: expiresAt,
      reason: state.reason || undefined,
    }));

    setSubmitting(true);
    setSubmitProgress({ done: 0, total: bodies.length });

    const results: Array<{ body: CreateGrantBody; ok: boolean; error?: string }> = [];
    for (let i = 0; i < bodies.length; i++) {
      try {
        await authzApi.createGrant(bodies[i]);
        results.push({ body: bodies[i], ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        results.push({ body: bodies[i], ok: false, error: msg });
      }
      setSubmitProgress({ done: i + 1, total: bodies.length });
    }

    setSubmitting(false);

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    if (failCount === 0) {
      message.success(`已创建 ${okCount} 条授权`);
    } else if (okCount === 0) {
      message.error(`全部 ${failCount} 条失败：${results[0].error ?? ''}`);
    } else {
      modal.warning({
        title: `${okCount} 条成功 / ${failCount} 条失败`,
        content: (
          <div>
            {results
              .filter((r) => !r.ok)
              .map((r, idx) => (
                <div key={idx} style={{ color: 'var(--ant-color-error)' }}>
                  模板 {r.body.template_id}: {r.error}
                </div>
              ))}
          </div>
        ),
      });
    }

    // 若给自己授权 → 立即刷新 action set
    if (state.userId === currentUser?.id) {
      try {
        await refreshActionSet();
      } catch {
        // swallow
      }
    }

    if (okCount > 0) {
      navigate('/platform/authz/grants');
    }
  }

  /* ====================== 渲染各步 ====================== */

  function renderStepUser() {
    const columns: TableColumnsType<UserListItem> = [
      {
        title: '姓名',
        dataIndex: 'name',
      },
      { title: '邮箱', dataIndex: 'email', width: 220 },
      {
        title: '类型',
        dataIndex: 'user_type',
        width: 90,
        render: (t: string) => <Tag>{t === 'supplier' ? '供应商' : '员工'}</Tag>,
      },
      { title: '当前角色', dataIndex: 'role', width: 100 },
      { title: '状态', dataIndex: 'status', width: 80 },
    ];

    return (
      <Card size="small" title="第 1 步：选择用户">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="本向导只能对已导入 ExCS 的用户授权"
          description="若要给新的 SSO 员工/供应商授权，请先到「用户管理」同步 MDM 或导入供应商。"
        />
        <Input.Search
          placeholder="搜索姓名、邮箱、手机..."
          style={{ width: 320, marginBottom: 12 }}
          allowClear
          value={userKeyword}
          onChange={(e) => setUserKeyword(e.target.value)}
        />
        <Table<UserListItem>
          columns={columns}
          dataSource={userListRes ?? []}
          loading={loadingUsers}
          rowKey="id"
          size="small"
          pagination={false}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: state.userId ? [state.userId] : [],
            onChange: (_, rows) => {
              const u = rows[0];
              if (u) setState((prev) => ({ ...prev, userId: u.id, user: u }));
            },
          }}
          onRow={(record) => ({
            onClick: () =>
              setState((prev) => ({ ...prev, userId: record.id, user: record })),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    );
  }

  function renderStepTemplates() {
    return (
      <Card size="small" title="第 2 步：选择角色模板（可多选）">
        {loadingTemplates ? (
          <Spin />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {(templates ?? []).map((t) => {
              const checked = state.templateIds.includes(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      templateIds: checked
                        ? prev.templateIds.filter((x) => x !== t.id)
                        : [...prev.templateIds, t.id],
                    }))
                  }
                  style={{
                    padding: 12,
                    border: '1px solid var(--ant-color-border)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: checked ? 'var(--ant-color-primary-bg)' : undefined,
                  }}
                >
                  <Space style={{ marginBottom: 4 }}>
                    <Checkbox checked={checked} />
                    <strong>{t.name_zh}</strong>
                    {t.is_builtin && <Tag color="blue">内置</Tag>}
                    {t.has_critical && <Tag color="red">含 critical</Tag>}
                  </Space>
                  <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
                    {t.code} · {t.action_codes?.length ?? 0} actions
                  </div>
                  {t.description && (
                    <Paragraph
                      type="secondary"
                      style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}
                      ellipsis={{ rows: 2 }}
                    >
                      {t.description}
                    </Paragraph>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selectedTemplates.length > 0 && (
          <>
            <Divider style={{ marginTop: 20 }}>
              合并预览
            </Divider>
            <Space wrap>
              <Tag>共 {mergedActions.length} 条 action（已去重）</Tag>
              {hasCritical && <Tag color="red">含 critical</Tag>}
            </Space>
          </>
        )}
      </Card>
    );
  }

  function renderStepScope() {
    return (
      <Card size="small" title="第 3 步：选择范围 + 过期时间">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="范围粒度 Phase 6 仅支持「全局」或「单展厅」"
          description="展项（E）/ 归属（O）等细粒度 scope 由 Phase 8 Vendor 场景接入。"
        />

        <div style={{ marginBottom: 16 }}>
          <strong>授权范围</strong>
          <div style={{ marginTop: 8 }}>
            <Radio.Group
              value={state.scopeMode}
              onChange={(e) =>
                setState((prev) => ({ ...prev, scopeMode: e.target.value as ScopeMode }))
              }
            >
              <Radio value="G">全局（所有展厅）</Radio>
              <Radio value="H">单个展厅</Radio>
            </Radio.Group>
          </div>

          {state.scopeMode === 'H' && (
            <div style={{ marginTop: 12 }}>
              <Select
                style={{ width: 320 }}
                placeholder="请选择展厅"
                loading={loadingHalls}
                value={state.scopeHallId}
                onChange={(v) => setState((prev) => ({ ...prev, scopeHallId: v }))}
                options={(halls ?? []).map((h) => ({ value: h.id, label: h.name }))}
              />
            </div>
          )}
        </div>

        <Divider />

        <div style={{ marginBottom: 16 }}>
          <strong>过期时间</strong>
          {(hasCritical || isVendor) && (
            <Tag color="red" style={{ marginLeft: 8 }}>
              必填
            </Tag>
          )}
          <div style={{ marginTop: 8 }}>
            <DatePicker
              showTime
              style={{ width: 260 }}
              value={state.expiresAt}
              placeholder={hasCritical || isVendor ? '必填（强制过期）' : '留空 = 永久'}
              onChange={(v) => {
                setExpiryTouched(true);
                setState((prev) => ({ ...prev, expiresAt: v }));
              }}
            />
            {hasCritical && <Text type="secondary" style={{ marginLeft: 8 }}>默认 90 天后</Text>}
            {!hasCritical && isVendor && (
              <Text type="secondary" style={{ marginLeft: 8 }}>
                供应商默认 180 天后
              </Text>
            )}
          </div>
        </div>

        <Divider />

        <div>
          <strong>操作原因</strong>
          {hasCritical && <Tag color="red" style={{ marginLeft: 8 }}>必填（至少 5 字）</Tag>}
          <Input.TextArea
            style={{ marginTop: 8 }}
            rows={2}
            placeholder="用于审计：为什么要授予此权限？"
            value={state.reason}
            onChange={(e) => setState((prev) => ({ ...prev, reason: e.target.value }))}
          />
        </div>
      </Card>
    );
  }

  function renderStepPreview() {
    const selectedHall = halls?.find((h) => h.id === state.scopeHallId);
    return (
      <Card size="small" title="第 4 步：确认并提交">
        <Alert
          type={hasCritical ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            hasCritical
              ? '此次授权含 critical action，需二次确认'
              : '请确认以下信息无误，提交后将立即生效'
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <div>
            <Text type="secondary">被授权用户</Text>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {state.user?.name}（{state.user?.email}）
            </div>
            <Tag>{state.user?.user_type === 'supplier' ? '供应商' : '员工'}</Tag>
          </div>
          <div>
            <Text type="secondary">授权范围</Text>
            <div>
              {state.scopeMode === 'G' ? (
                <Tag color="purple">全局</Tag>
              ) : (
                <Tag color="blue">展厅 · {selectedHall?.name ?? state.scopeHallId}</Tag>
              )}
            </div>
          </div>
          <div>
            <Text type="secondary">过期时间</Text>
            <div>
              {state.expiresAt ? (
                state.expiresAt.format('YYYY-MM-DD HH:mm')
              ) : (
                <Tag>永久</Tag>
              )}
            </div>
          </div>
          <div>
            <Text type="secondary">Action 总数</Text>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{mergedActions.length}（已去重）</div>
          </div>
        </div>

        <Divider>将创建 {state.templateIds.length} 条 Grant</Divider>
        <Space direction="vertical" style={{ width: '100%' }}>
          {selectedTemplates.map((t) => (
            <div
              key={t.id}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--ant-color-border-secondary)',
                borderRadius: 4,
              }}
            >
              <Space>
                <strong>{t.name_zh}</strong>
                <Tag>{t.code}</Tag>
                <Text type="secondary">{t.action_codes?.length ?? 0} actions</Text>
                {t.has_critical && <Tag color="red">critical</Tag>}
              </Space>
            </div>
          ))}
        </Space>

        {state.reason && (
          <>
            <Divider>操作原因（审计备注）</Divider>
            <Paragraph>{state.reason}</Paragraph>
          </>
        )}

        {submitProgress && (
          <div style={{ marginTop: 16 }}>
            <Progress
              percent={Math.round((submitProgress.done / submitProgress.total) * 100)}
              status={submitProgress.done < submitProgress.total ? 'active' : 'success'}
              format={() => `${submitProgress.done}/${submitProgress.total}`}
            />
          </div>
        )}
      </Card>
    );
  }

  const stepsItems = [
    { title: '选择用户' },
    { title: '选择模板' },
    { title: '范围 + 过期' },
    { title: '确认' },
  ];

  return (
    <div>
      <PageHeader description="四步向导：选用户 → 选模板 → 选范围 → 确认。模板可多选，系统会合并去重后创建独立 Grant。" />

      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
      </Space>

      <Steps current={step} items={stepsItems} style={{ marginBottom: 24 }} />

      {step === 0 && renderStepUser()}
      {step === 1 && renderStepTemplates()}
      {step === 2 && renderStepScope()}
      {step === 3 && renderStepPreview()}

      <Space style={{ marginTop: 16, width: '100%', justifyContent: 'flex-end' }}>
        {step > 0 && (
          <Button onClick={() => setStep((s) => s - 1)} disabled={submitting}>
            上一步
          </Button>
        )}
        {step < 3 && (
          <Button
            type="primary"
            disabled={!canNext}
            onClick={() => setStep((s) => s + 1)}
          >
            下一步
          </Button>
        )}
        {step === 3 && (
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={submitting}
            onClick={handleSubmit}
          >
            提交授权
          </Button>
        )}
      </Space>
    </div>
  );
}
