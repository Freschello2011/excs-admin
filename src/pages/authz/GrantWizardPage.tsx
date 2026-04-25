/**
 * GrantWizardPage —— 高级模式：5 步授权向导（P1.6 重构 2026-04-25）。
 *
 * 5 步分工（原 4 步把 Step2「范围+过期+原因」拆为两步以容纳 per-template 配置）：
 *   0  选用户
 *   1  选模板（多选）
 *   2  逐模板配置「范围」（解除原来 all-or-nothing 限制；可全 G / 全 H / 混合）
 *   3  逐模板配置「过期」+ 共享「原因」
 *   4  确认 + 提交
 *
 * 与 QuickGrantDrawer 的分工：
 *   - Drawer：3 字段一次性，所有模板共用 scope/expires，覆盖 95% 场景
 *   - Wizard：per-template scope + 过期，覆盖 5% 复杂场景（如同时给 hall_admin@H:3 +
 *     technician@H:5；或一条 critical 永久 + 一条 vendor 180d）
 */
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
  Progress,
  Radio,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
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
import AccountTypeTag from '@/components/authz/common/AccountTypeTag';
import ScopeTag from '@/components/authz/common/ScopeTag';
import type { CreateGrantBody, RoleTemplate, ScopeType } from '@/types/authz';
import { resolveAccountType, type UserListItem } from '@/types/auth';
import { makeDefaultExpiry } from '@/lib/authz/expiry';

const { Text, Paragraph } = Typography;

type ScopeMode = 'G' | 'H';

interface PerTemplate {
  scopeMode: ScopeMode;
  scopeHallId?: number;
  expiresAt: Dayjs | null;
  /** 用户是否手动改过过期时间；未改时模板 critical/vendor 重算时覆盖 */
  expiryTouched: boolean;
}

interface WizardState {
  userId?: number;
  user?: UserListItem;
  templateIds: number[];
  /** key = templateId */
  perTemplate: Record<number, PerTemplate>;
  /** 共享授权原因（若任一模板含 critical 则必填 ≥ 5 字） */
  reason: string;
}

function defaultPerTemplate(template: RoleTemplate, isVendor: boolean): PerTemplate {
  return {
    scopeMode: 'G',
    scopeHallId: undefined,
    expiresAt: makeDefaultExpiry(template.has_critical, isVendor ? 'vendor' : 'internal'),
    expiryTouched: false,
  };
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
    perTemplate: {},
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

  const hallMap = useMemo(() => {
    const m = new Map<number, string>();
    (halls ?? []).forEach((h) => m.set(h.id, h.name));
    return m;
  }, [halls]);

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

  const hasCritical = selectedTemplates.some((t) => t.has_critical);
  const isVendor = resolveAccountType(state.user) === 'vendor';

  /** 选中模板列表变化时同步 perTemplate map（新增初始化默认 / 移除删除） */
  useEffect(() => {
    setState((prev) => {
      const next: Record<number, PerTemplate> = {};
      for (const t of selectedTemplates) {
        next[t.id] = prev.perTemplate[t.id] ?? defaultPerTemplate(t, isVendor);
      }
      return { ...prev, perTemplate: next };
    });
    // 仅在 templateIds 长度或 user vendor 状态变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.templateIds.length, isVendor]);

  /* -------- 步骤校验 -------- */

  const canNext = useMemo(() => {
    if (step === 0) return !!state.userId;
    if (step === 1) return state.templateIds.length > 0;
    if (step === 2) {
      // 范围步：H scope 必须选展厅
      for (const tid of state.templateIds) {
        const cfg = state.perTemplate[tid];
        if (!cfg) return false;
        if (cfg.scopeMode === 'H' && !cfg.scopeHallId) return false;
      }
      return true;
    }
    if (step === 3) {
      // 过期 + 原因：critical / vendor 必填过期；critical 必填原因 ≥ 5 字
      for (const t of selectedTemplates) {
        const cfg = state.perTemplate[t.id];
        if (!cfg) return false;
        if ((t.has_critical || isVendor) && !cfg.expiresAt) return false;
      }
      if (hasCritical && state.reason.trim().length < 5) return false;
      return true;
    }
    return true;
  }, [step, state, selectedTemplates, hasCritical, isVendor]);

  /* -------- 提交 -------- */

  async function handleSubmit() {
    if (!state.userId || state.templateIds.length === 0) return;

    const bodies: CreateGrantBody[] = [];
    for (const tid of state.templateIds) {
      const cfg = state.perTemplate[tid];
      if (!cfg) continue;
      const scopeType: ScopeType = cfg.scopeMode;
      const scopeId = scopeType === 'H' ? String(cfg.scopeHallId ?? '') : '';
      bodies.push({
        user_id: state.userId,
        template_id: tid,
        scope_type: scopeType,
        scope_id: scopeId,
        expires_at: cfg.expiresAt ? cfg.expiresAt.toISOString() : null,
        reason: state.reason.trim() || undefined,
      });
    }

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

    if (state.userId === currentUser?.id) {
      try { await refreshActionSet(); } catch { /* swallow */ }
    }

    if (okCount > 0) {
      navigate('/platform/authz/grants');
    }
  }

  /** 编辑某个 template 的配置 */
  function patchTemplate(templateId: number, patch: Partial<PerTemplate>) {
    setState((prev) => ({
      ...prev,
      perTemplate: {
        ...prev.perTemplate,
        [templateId]: { ...prev.perTemplate[templateId], ...patch },
      },
    }));
  }

  /* ====================== 渲染各步 ====================== */

  function renderStepUser() {
    const columns: TableColumnsType<UserListItem> = [
      { title: '姓名', dataIndex: 'name' },
      { title: '邮箱', dataIndex: 'email', width: 220 },
      {
        title: '类型',
        dataIndex: 'user_type',
        width: 100,
        render: (_t: string, row: UserListItem) => <AccountTypeTag user={row} />,
      },
      { title: '当前角色', dataIndex: 'role', width: 100 },
      { title: '状态', dataIndex: 'status', width: 80 },
    ];

    return (
      <Card size="small" title="第 1 步 / 共 5：选择用户">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="本向导只能对已导入 ExCS 的用户授权"
          description="若要给新的 SSO 员工/供应商授权，请先到「用户」同步 MDM 或导入供应商。"
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
            onClick: () => setState((prev) => ({ ...prev, userId: record.id, user: record })),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    );
  }

  function renderStepTemplates() {
    return (
      <Card size="small" title="第 2 步 / 共 5：选择角色模板（可多选）">
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
            <Divider style={{ marginTop: 20 }}>合并预览</Divider>
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
      <Card size="small" title="第 3 步 / 共 5：逐模板配置范围">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="解除 all-or-nothing 限制：每个模板可独立选择全局或单展厅范围"
          description="原 Phase 6 仅支持本次向导所有模板共用一个 scope；P1.6 起逐模板独立配置。"
        />
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {selectedTemplates.map((t) => {
            const cfg = state.perTemplate[t.id];
            if (!cfg) return null;
            return (
              <div
                key={t.id}
                style={{
                  padding: 12,
                  border: '1px solid var(--ant-color-border-secondary)',
                  borderRadius: 6,
                }}
              >
                <Space style={{ marginBottom: 8 }} wrap>
                  <strong>{t.name_zh}</strong>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t.code}
                  </Text>
                  {t.has_critical && <Tag color="red">含 critical</Tag>}
                </Space>
                <div>
                  <Radio.Group
                    value={cfg.scopeMode}
                    onChange={(e) =>
                      patchTemplate(t.id, {
                        scopeMode: e.target.value as ScopeMode,
                        scopeHallId: e.target.value === 'G' ? undefined : cfg.scopeHallId,
                      })
                    }
                  >
                    <Radio value="G">全局（所有展厅）</Radio>
                    <Radio value="H">单个展厅</Radio>
                  </Radio.Group>
                  {cfg.scopeMode === 'H' && (
                    <Select
                      style={{ width: 280, marginLeft: 16 }}
                      placeholder="请选择展厅"
                      loading={loadingHalls}
                      value={cfg.scopeHallId}
                      onChange={(v) => patchTemplate(t.id, { scopeHallId: v })}
                      options={(halls ?? []).map((h) => ({ value: h.id, label: h.name }))}
                      showSearch
                      optionFilterProp="label"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </Space>
      </Card>
    );
  }

  function renderStepExpiryReason() {
    return (
      <Card size="small" title="第 4 步 / 共 5：逐模板过期 + 共享原因">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="vendor 必须过期 / critical 必须过期 + 必填原因（≥ 5 字）"
        />
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {selectedTemplates.map((t) => {
            const cfg = state.perTemplate[t.id];
            if (!cfg) return null;
            const required = t.has_critical || isVendor;
            return (
              <div
                key={t.id}
                style={{
                  padding: 12,
                  border: '1px solid var(--ant-color-border-secondary)',
                  borderRadius: 6,
                }}
              >
                <Space style={{ marginBottom: 8 }} wrap>
                  <strong>{t.name_zh}</strong>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t.code}
                  </Text>
                  {t.has_critical && <Tag color="red">含 critical</Tag>}
                  {required && (
                    <Tag color="orange">过期必填</Tag>
                  )}
                </Space>
                <div>
                  <DatePicker
                    showTime
                    style={{ width: 260 }}
                    value={cfg.expiresAt}
                    placeholder={required ? '必填' : '留空 = 永久'}
                    onChange={(v) =>
                      patchTemplate(t.id, { expiresAt: v, expiryTouched: true })
                    }
                  />
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    {t.has_critical
                      ? '默认 90 天后（critical 强制）'
                      : isVendor
                        ? '默认 180 天后（vendor 强制）'
                        : '默认永久'}
                  </Text>
                </div>
              </div>
            );
          })}
        </Space>

        <Divider />

        <div>
          <strong>授权原因（共享，写入审计）</strong>
          {hasCritical && <Tag color="red" style={{ marginLeft: 8 }}>必填（≥ 5 字）</Tag>}
          <Input.TextArea
            style={{ marginTop: 8 }}
            rows={2}
            placeholder="为什么要授予这些权限？"
            value={state.reason}
            onChange={(e) => setState((prev) => ({ ...prev, reason: e.target.value }))}
            maxLength={500}
            showCount
          />
        </div>
      </Card>
    );
  }

  function renderStepPreview() {
    return (
      <Card size="small" title="第 5 步 / 共 5：确认并提交">
        <Alert
          type={hasCritical ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            hasCritical
              ? '此次授权含 critical action，提交即写入审计'
              : '请确认以下信息无误，提交后将立即生效'
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <div>
            <Text type="secondary">被授权用户</Text>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {state.user?.name}（{state.user?.email}）
            </div>
            {state.user && <AccountTypeTag user={state.user} />}
          </div>
          <div>
            <Text type="secondary">Action 总数</Text>
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              {mergedActions.length}（已去重）
            </div>
          </div>
        </div>

        <Divider>将创建 {state.templateIds.length} 条 Grant</Divider>
        <Space direction="vertical" style={{ width: '100%' }}>
          {selectedTemplates.map((t) => {
            const cfg = state.perTemplate[t.id];
            return (
              <div
                key={t.id}
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--ant-color-border-secondary)',
                  borderRadius: 4,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <strong>{t.name_zh}</strong>
                <Tag>{t.code}</Tag>
                {cfg && (
                  <ScopeTag
                    scopeType={cfg.scopeMode}
                    scopeId={cfg.scopeHallId ? String(cfg.scopeHallId) : ''}
                    hallNameMap={hallMap}
                  />
                )}
                <Text type="secondary">
                  {cfg?.expiresAt
                    ? `到期 ${cfg.expiresAt.format('YYYY-MM-DD HH:mm')}`
                    : '永久'}
                </Text>
                {t.has_critical && <Tag color="red">critical</Tag>}
              </div>
            );
          })}
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
    { title: '逐模板范围' },
    { title: '逐模板过期 + 原因' },
    { title: '确认' },
  ];

  return (
    <div>
      <PageHeader description="高级模式：5 步配置每个模板独立的 scope 与过期时间。简单场景请用列表行操作或权限 Tab 的「+ 授权」抽屉。" />

      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
        <Button
          type="link"
          onClick={() => {
            if (!state.userId) {
              message.info('请先选择用户');
              return;
            }
            navigate(`/platform/authz/users/${state.userId}?tab=authz`);
          }}
        >
          切换简单模式（QuickGrantDrawer）
        </Button>
      </Space>

      <Steps current={step} items={stepsItems} style={{ marginBottom: 24 }} />

      {step === 0 && renderStepUser()}
      {step === 1 && renderStepTemplates()}
      {step === 2 && renderStepScope()}
      {step === 3 && renderStepExpiryReason()}
      {step === 4 && renderStepPreview()}

      <Space style={{ marginTop: 16, width: '100%', justifyContent: 'flex-end' }}>
        {step > 0 && (
          <Button onClick={() => setStep((s) => s - 1)} disabled={submitting}>
            上一步
          </Button>
        )}
        {step < 4 && (
          <Button
            type="primary"
            disabled={!canNext}
            onClick={() => setStep((s) => s + 1)}
          >
            下一步
          </Button>
        )}
        {step === 4 && (
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
