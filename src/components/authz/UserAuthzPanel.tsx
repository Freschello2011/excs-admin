/**
 * UserAuthzPanel —— Phase 7.1「按人视角」面板。
 *
 * 嵌入 UserDetailPage 的「权限」Tab 中；不另建独立路由。
 *
 * 功能（PRD §8.3）：
 *   - 用户基本信息 + 当前生效 Grant 列表（并排，每条独立续期 / 撤销）
 *   - "能做什么"汇总：按 scope 聚合展示（去重后的 action 集合）
 *   - 审计快照：最近 10 条以该用户为 actor 的事件（走 Phase 11.4 audit-logs API · actor_user_id 过滤）
 *
 * 撤销 / 续期走 `RiskyActionButton`（Phase 7.4 替换 Phase 6 手写 modal.confirm）。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  DatePicker,
  Empty,
  Modal,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
  ExclamationCircleFilled,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningFilled,
} from '@ant-design/icons';
import Can from '@/components/authz/Can';
import { useCan } from '@/lib/authz/can';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import ExpiryTag from '@/components/authz/common/ExpiryTag';
import ScopeTag from '@/components/authz/common/ScopeTag';
import QuickGrantDrawer, { type QuickGrantTarget } from '@/components/authz/QuickGrantDrawer';
import { useMessage } from '@/hooks/useMessage';
import { authzApi } from '@/api/authz';
import { hallApi } from '@/api/hall';
import { userApi } from '@/api/user';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useAuthzMetaStore } from '@/stores/authzMetaStore';
import { useDomainGroups, type DomainGrantedAction } from '@/lib/authz/useDomainGroups';
import { DOMAIN_LABELS, RISK_META } from '@/lib/authz/actionMeta';
import { formatResourceText } from '@/lib/authz/resourceMeta';
import { formatActionDisplay } from '@/lib/authz/auditFormatters';
import { resolveScopeText } from '@/components/authz/common/ScopeTag';
import type {
  AuditLogRow,
  Grant,
  GrantStatusType,
  RiskLevel,
  RoleTemplate,
  ScopeType,
} from '@/api/gen/client';

const { Text } = Typography;

const STATUS_META: Record<GrantStatusType, { label: string; color: string }> = {
  active: { label: '生效中', color: 'green' },
  expired: { label: '已过期', color: 'default' },
  revoked: { label: '已撤销', color: 'red' },
};

/** 审计快照（最近 10 条）状态色，与 AuditLogListPage 一致 */
const AUDIT_STATUS_COLOR: Record<string, string> = { success: 'green', failure: 'red' };

/** 一个 action 的彩色风险标签（critical/high 显式标注；medium/低风险仅 hover tip 显示） */
function RiskBadge({ risk }: { risk: RiskLevel }) {
  const meta = RISK_META[risk];
  if (risk === 'critical' || risk === 'high') {
    return (
      <Tag
        color={meta.color}
        icon={risk === 'critical' ? <ExclamationCircleFilled /> : <WarningFilled />}
        style={{ marginInlineEnd: 0 }}
      >
        {meta.label}
      </Tag>
    );
  }
  return null;
}

/** 单条 action 行：name_zh + 风险徽章 + scope 列表 + 元数据小标 + tooltip 显示 code/API/来源 */
function ActionRow({
  item,
  hallNameMap,
  templateMap,
}: {
  item: DomainGrantedAction;
  hallNameMap: Map<number, string>;
  templateMap: Map<number, RoleTemplate>;
}) {
  const tooltipContent = (
    <div style={{ maxWidth: 360 }}>
      <div style={{ fontFamily: 'monospace', marginBottom: 4 }}>{item.code}</div>
      {item.coveredApis.length > 0 && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
          覆盖：{item.coveredApis.join(' / ')}
        </div>
      )}
      {item.sources.length > 0 && (
        <div
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.85)',
            borderTop: '1px solid rgba(255,255,255,0.2)',
            paddingTop: 4,
            marginTop: 4,
          }}
        >
          📌 来源：
          {item.sources.map((s, i) => {
            // 通过 template_code 反查 templateMap（templateMap 是按 id 索引，需要遍历）
            const tpl = Array.from(templateMap.values()).find(
              (t) => t.code === s.template_code,
            );
            const label = tpl?.name_zh ?? s.template_code;
            return (
              <span key={s.grant_id}>
                {i === 0 ? ' ' : '、'}
                {label}（#{s.grant_id}）
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        padding: '4px 0',
      }}
    >
      <Tooltip title={tooltipContent}>
        <span style={{ fontWeight: 500, cursor: 'help' }}>{item.nameZh}</span>
      </Tooltip>
      <RiskBadge risk={item.risk} />
      {item.requireReason && (
        <Tooltip title="执行需填写原因（≥5 字）">
          <Tag color="default" style={{ marginInlineEnd: 0 }}>
            📝 需理由
          </Tag>
        </Tooltip>
      )}
      {item.requireConfirm && !item.requireReason && (
        <Tooltip title="执行前需二次确认">
          <Tag color="default" style={{ marginInlineEnd: 0 }}>
            ✅ 需确认
          </Tag>
        </Tooltip>
      )}
      {item.internalOnly && (
        <Tooltip title="仅内部员工可调用（vendor 账号即便 grant 命中亦被拒）">
          <Tag color="default" icon={<LockOutlined />} style={{ marginInlineEnd: 0 }}>
            内部
          </Tag>
        </Tooltip>
      )}
      <span style={{ flex: '0 0 auto', display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
        {item.scopes.map((s) => (
          <Tag
            key={`${s.type}:${s.id}`}
            color="blue"
            style={{ marginInlineEnd: 0, fontSize: 11 }}
          >
            {resolveScopeText({
              scopeType: s.type,
              scopeId: s.id,
              hallNameMap,
            })}
          </Tag>
        ))}
      </span>
    </div>
  );
}

interface Props {
  userId: number;
  /** 兼容旧入口：传则显示按钮但点开 QuickGrantDrawer；不传则不渲染按钮（如 self 视角） */
  onNavigateGrantWizard?: () => void;
}

export default function UserAuthzPanel({ userId, onNavigateGrantWizard }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const refreshActionSet = useAuthStore((s) => s.refreshActionSet);

  const [extending, setExtending] = useState<Grant | null>(null);
  const [extendValue, setExtendValue] = useState<Dayjs | null>(null);
  const [quickGrantOpen, setQuickGrantOpen] = useState(false);
  // 默认只看 active —— revoked/expired 是历史变更，按需展示，避免长尾累积污染主视图。
  // 历史动线由下方"审计快照"卡（最近 10 条 actor 事件）和「权限审计」全局页承载。
  const [viewMode, setViewMode] = useState<'active' | 'all'>('active');

  // 抓 user 摘要供 QuickGrantDrawer 决定 vendor 默认过期 + 抽屉标题展示
  const { data: user } = useQuery({
    queryKey: queryKeys.userDetail(userId),
    queryFn: () => userApi.getUser(userId),
    enabled: userId > 0,
  });
  const quickGrantTarget: QuickGrantTarget | null = user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        account_type: user.account_type,
        user_type: user.user_type,
      }
    : null;

  const {
    data: view,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['authz', 'user-view', userId],
    queryFn: () => authzApi.getUserAuthzView(userId),
    select: (res) => res.data.data,
    enabled: userId > 0,
  });

  const { data: templates } = useQuery({
    queryKey: ['authz', 'role-templates'],
    queryFn: () => authzApi.listTemplates(),
    select: (res) => res.data.data?.list ?? [],
  });

  const { data: halls } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 200 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 200 }),
    select: (res) => res.data.data?.list ?? [],
  });

  // 审计快照（最近 10 条以该用户为 actor 的事件）—— PRD §8.3 要求
  // 仅持 audit.view 才取，避免普通账号触发 403；非授权时整张卡藏掉
  const canViewAudit = useCan('audit.view');
  const {
    data: auditSnapshot,
    isFetching: auditFetching,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ['authz', 'user-audit-snapshot', userId],
    queryFn: () =>
      authzApi.queryAuditLogs({ actor_user_id: userId, page_size: 10, offset: 0 }),
    select: (res) => res.data.data,
    enabled: userId > 0 && canViewAudit,
    staleTime: 30_000,
  });
  const auditList: AuditLogRow[] = auditSnapshot?.list ?? [];
  const auditArchiveUsed = auditSnapshot?.archive_used ?? false;

  const templateMap = useMemo(() => {
    const m = new Map<number, RoleTemplate>();
    (templates ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [templates]);

  const hallMap = useMemo(() => {
    const m = new Map<number, string>();
    (halls ?? []).forEach((h) => m.set(h.id, h.name));
    return m;
  }, [halls]);

  const grants = view?.grants ?? [];
  const activeGrants = grants.filter((g) => g.status === 'active');
  const revokedGrants = grants.filter((g) => g.status === 'revoked');
  const expiredGrants = grants.filter((g) => g.status === 'expired');
  const visibleGrants = useMemo(
    () => (viewMode === 'active' ? activeGrants : grants),
    [viewMode, activeGrants, grants],
  );

  // Action 注册表元数据（name_zh / risk / covered_apis / require_*）。
  // 按需懒加载；TTL 10 分钟缓存，本面板挂载即触发，不阻塞首屏（先渲染 grants 再补元数据）。
  const actionDefs = useAuthzMetaStore((s) => s.actions);
  const loadActions = useAuthzMetaStore((s) => s.loadActions);
  useEffect(() => {
    loadActions().catch(() => {
      /* swallow：元数据失败时降级到代码字面量；下方组件已 graceful */
    });
  }, [loadActions]);

  // 按业务域聚合（替代之前的"按 scope 聚合"，更贴合操作员心智）。
  const domainGroups = useDomainGroups(view?.action_set?.entries, actionDefs);

  // Audit 行 code → ActionDef 映射，给"审计快照"卡的「操作」列做中文化用
  const actionDefsMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof actionDefs>[number]>();
    (actionDefs ?? []).forEach((a) => m.set(a.code, a));
    return m;
  }, [actionDefs]);

  // 一句话画像：active grants 摘要 + 最早到期 + 高危统计
  const personaSummary = useMemo(() => {
    const activeWithMeta = activeGrants.map((g) => {
      const t = templateMap.get(g.role_template_id);
      return { grant: g, template: t };
    });
    const criticalGrants = activeWithMeta.filter((x) => x.template?.has_critical).length;
    const datedGrants = activeWithMeta
      .filter((x) => x.grant.expires_at)
      .map((x) => ({ ...x, expiresAt: dayjs(x.grant.expires_at as string) }))
      .sort((a, b) => a.expiresAt.valueOf() - b.expiresAt.valueOf());
    const earliest = datedGrants[0]?.expiresAt ?? null;
    const hasPermanent = activeWithMeta.some((x) => !x.grant.expires_at);
    const daysToEarliest = earliest
      ? Math.max(0, Math.ceil(earliest.diff(dayjs(), 'day', true)))
      : null;
    return {
      activeWithMeta,
      criticalGrants,
      earliest,
      daysToEarliest,
      hasPermanent,
    };
  }, [activeGrants, templateMap]);

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      authzApi.revokeGrant(id, { reason }),
    onSuccess: async (_res, vars) => {
      message.success('授权已撤销');
      queryClient.invalidateQueries({ queryKey: ['authz', 'user-view', userId] });
      queryClient.invalidateQueries({ queryKey: ['authz', 'grants'] });
      if (userId === currentUser?.id) {
        try {
          await refreshActionSet();
        } catch {
          /* swallow */
        }
      }
      void vars;
    },
    onError: (err: Error) => message.error(err.message || '撤销失败'),
  });

  const extendMutation = useMutation({
    mutationFn: ({ id, newExpiresAt }: { id: number; newExpiresAt: string }) =>
      authzApi.extendGrant(id, { new_expires_at: newExpiresAt }),
    onSuccess: () => {
      message.success('已续期');
      queryClient.invalidateQueries({ queryKey: ['authz', 'user-view', userId] });
      queryClient.invalidateQueries({ queryKey: ['authz', 'grants'] });
      setExtending(null);
      setExtendValue(null);
    },
    onError: (err: Error) => message.error(err.message || '续期失败'),
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  // 一句话画像卡：把"3 张钥匙包 / 含 X 项高危 / Y 天后到期"和钥匙列表合在最顶部，
  // 让 admin 2 秒内能说出"这是谁 / 能做什么 / 紧不紧急"。
  const renderPersonaCard = () => {
    if (activeGrants.length === 0) {
      return (
        <Card
          size="small"
          style={{ marginBottom: 16 }}
          styles={{ body: { padding: 16 } }}
        >
          <Empty
            description={
              grants.length === 0
                ? '该用户暂无任何授权'
                : '当前无生效授权（切到"全部"查看历史）'
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      );
    }
    const expiringSoon =
      personaSummary.daysToEarliest != null && personaSummary.daysToEarliest <= 30;
    const summaryParts: React.ReactNode[] = [
      <span key="count">{activeGrants.length} 张钥匙包</span>,
    ];
    if (personaSummary.criticalGrants > 0) {
      summaryParts.push(
        <Text key="crit" type="danger" strong>
          含 {personaSummary.criticalGrants} 项高危模板
        </Text>,
      );
    }
    if (personaSummary.earliest) {
      summaryParts.push(
        <span key="exp" style={{ color: expiringSoon ? '#fa8c16' : undefined }}>
          {expiringSoon
            ? `⏰ ${personaSummary.daysToEarliest} 天内将到期`
            : `最早 ${personaSummary.earliest.format('YYYY-MM-DD')} 到期`}
        </span>,
      );
    } else if (personaSummary.hasPermanent) {
      summaryParts.push(<span key="perm">含永久授权</span>);
    }

    return (
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: 16 } }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space size={8} wrap>
            <KeyOutlined style={{ color: 'var(--ant-color-primary)' }} />
            <strong style={{ fontSize: 15 }}>{user?.name ?? `用户 #${userId}`}</strong>
            {user?.email && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {user.email}
              </Text>
            )}
          </Space>
          <Space size={[10, 4]} wrap>
            {summaryParts.map((p, i) => (
              <span key={i} style={{ fontSize: 13 }}>
                {p}
                {i < summaryParts.length - 1 && (
                  <Text type="secondary" style={{ marginLeft: 10 }}>
                    ·
                  </Text>
                )}
              </span>
            ))}
          </Space>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {personaSummary.activeWithMeta.map(({ grant, template }) => {
              const scopeText = resolveScopeText({
                scopeType: grant.scope_type as ScopeType,
                scopeId: grant.scope_id,
                hallNameMap: hallMap,
              });
              const tpl = template?.name_zh ?? `模板 #${grant.role_template_id}`;
              return (
                <div
                  key={grant.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    fontSize: 13,
                  }}
                >
                  <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                    {scopeText}
                  </Tag>
                  <span>·</span>
                  <span style={{ fontWeight: 500 }}>{tpl}</span>
                  {template?.has_critical && (
                    <Tag color="red" style={{ marginInlineEnd: 0 }}>
                      含极危
                    </Tag>
                  )}
                  <span style={{ marginLeft: 'auto' }}>
                    <ExpiryTag expiresAt={grant.expires_at ?? null} variant="compact" />
                  </span>
                </div>
              );
            })}
          </div>
        </Space>
      </Card>
    );
  };

  return (
    <div>
      {renderPersonaCard()}
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}
      >
        <Space wrap>
          <Button icon={<ReloadOutlined />} size="small" onClick={() => refetch()}>
            刷新
          </Button>
          <Text type="secondary">
            共 {grants.length} · 生效中 {activeGrants.length}
            {revokedGrants.length > 0 ? ` · 已撤销 ${revokedGrants.length}` : ''}
            {expiredGrants.length > 0 ? ` · 已过期 ${expiredGrants.length}` : ''}
          </Text>
          <Segmented
            size="small"
            value={viewMode}
            onChange={(v) => setViewMode(v as 'active' | 'all')}
            options={[
              { label: '只看生效中', value: 'active' },
              { label: '全部（含历史）', value: 'all' },
            ]}
          />
        </Space>
        {onNavigateGrantWizard && (
          <Can action="user.grant">
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setQuickGrantOpen(true)}
              disabled={!quickGrantTarget}
            >
              + 授权
            </Button>
          </Can>
        )}
      </Space>

      {/* 授权记录 */}
      <Card
        size="small"
        title="授权记录（每条独立续期 / 撤销）"
        style={{ marginBottom: 16 }}
      >
        {grants.length === 0 ? (
          <Empty description="该用户尚无任何授权" />
        ) : visibleGrants.length === 0 ? (
          <Empty
            description={
              viewMode === 'active'
                ? '当前无生效授权（切到"全部"查看历史）'
                : '无授权记录'
            }
          />
        ) : (
          <Table<Grant>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={visibleGrants}
            columns={[
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
                render: (_, record) => (
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
                width: 80,
                render: (s: GrantStatusType) => {
                  const meta = STATUS_META[s] ?? { label: s, color: 'default' };
                  return <Tag color={meta.color}>{meta.label}</Tag>;
                },
              },
              {
                title: '到期',
                dataIndex: 'expires_at',
                width: 180,
                render: (v?: string | null) => <ExpiryTag expiresAt={v} variant="compact" />,
              },
              {
                title: '操作',
                width: 180,
                render: (_, record) => {
                  if (record.status !== 'active') {
                    return <span style={{ color: 'var(--ant-color-text-tertiary)' }}>-</span>;
                  }
                  const t = templateMap.get(record.role_template_id);
                  return (
                    <Space size="small">
                      <Can action="user.grant">
                        <Button
                          size="small"
                          type="link"
                          onClick={() => {
                            setExtending(record);
                            setExtendValue(
                              record.expires_at
                                ? dayjs(record.expires_at).add(90, 'day')
                                : dayjs().add(90, 'day'),
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
                          confirmTitle={`撤销 #${record.id} · ${t?.name_zh ?? ''}`}
                          confirmContent={
                            t?.has_critical
                              ? '该模板含 critical action，需输入撤销原因（≥ 5 字）'
                              : '确认撤销此授权？'
                          }
                          forceRiskLevel={t?.has_critical ? 'critical' : 'high'}
                          onConfirm={async (reason) => {
                            await revokeMutation.mutateAsync({ id: record.id, reason });
                          }}
                        >
                          撤销
                        </RiskyActionButton>
                      </Can>
                    </Space>
                  );
                },
              },
            ]}
          />
        )}
      </Card>

      {/* 能做什么（按业务域聚合 · 风险色彩 · 可点开"未授予的关键能力"） */}
      <Card
        size="small"
        title="能做什么（按业务域）"
        extra={
          actionDefs == null && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              元数据加载中…
            </Text>
          )
        }
        style={{ marginBottom: 16 }}
      >
        {domainGroups.length === 0 ? (
          actionDefs == null ? (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin size="small" />
            </div>
          ) : (
            <Empty description="无生效 action" />
          )
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 10,
              alignItems: 'start',
            }}
          >
            {domainGroups.map((dg) => (
              <div
                key={dg.domain}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--ant-color-border-secondary)',
                  borderRadius: 6,
                }}
              >
                <Space
                  size={6}
                  align="center"
                  style={{ marginBottom: 4, rowGap: 2 }}
                  wrap
                >
                  <strong style={{ fontSize: 13 }}>{dg.domainLabel}</strong>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dg.granted.length} 项
                  </Text>
                  {dg.highRiskCount > 0 && (
                    <Tag
                      color="orange"
                      style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '16px' }}
                    >
                      含 {dg.highRiskCount} 项高危
                    </Tag>
                  )}
                </Space>
                <div>
                  {dg.granted.map((it) => (
                    <ActionRow
                      key={it.code}
                      item={it}
                      hallNameMap={hallMap}
                      templateMap={templateMap}
                    />
                  ))}
                </div>
                {dg.missingHighRisk.length > 0 && (
                  <Collapse
                    ghost
                    size="small"
                    style={{ marginTop: 2 }}
                    items={[
                      {
                        key: 'missing',
                        label: (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            ⊘ 该域未授予的关键能力（{dg.missingHighRisk.length}）
                          </Text>
                        ),
                        children: (
                          <Space size={[6, 6]} wrap>
                            {dg.missingHighRisk.map((m) => {
                              const meta = RISK_META[m.risk];
                              return (
                                <Tooltip key={m.code} title={m.code}>
                                  <Tag
                                    color={meta.color}
                                    style={{ marginInlineEnd: 0, opacity: 0.6 }}
                                  >
                                    {m.nameZh}
                                  </Tag>
                                </Tooltip>
                              );
                            })}
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 审计快照 —— Phase 11.4 audit-logs API · actor_user_id 过滤 · 最近 10 条
          非 audit.view 持有者整张卡藏起来，避免下拉看到一张 403 红卡 */}
      {canViewAudit && (
        <Card
          size="small"
          title="审计快照（最近 10 条）"
          extra={
            <Space size={4}>
              <Link to={`/platform/authz/audit?actor_user_id=${userId}`}>查看全部 →</Link>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={auditFetching}
                onClick={() => refetchAudit()}
              >
                刷新
              </Button>
            </Space>
          }
        >
          {auditArchiveUsed && (
            <Alert
              type="info"
              showIcon
              message="本次结果合并了 OSS 冷读"
              style={{ marginBottom: 8 }}
            />
          )}
          {auditList.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={auditFetching ? '加载中…' : '近期暂无以该用户为操作者的审计事件'}
            />
          ) : (
            <Table<AuditLogRow>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={auditList}
              columns={[
                {
                  title: '时间',
                  dataIndex: 'occurred_at',
                  width: 170,
                  render: (v: string) => (
                    <Tooltip title={dayjs(v).format('YYYY-MM-DD HH:mm:ss.SSS')}>
                      <span style={{ fontSize: 12 }}>
                        {dayjs(v).format('MM-DD HH:mm:ss')}
                      </span>
                    </Tooltip>
                  ),
                },
                {
                  title: '操作',
                  dataIndex: 'action_code',
                  render: (v: string) => {
                    const display = formatActionDisplay(v, actionDefsMap, DOMAIN_LABELS);
                    return (
                      <Tooltip title={display.label !== v ? `代码：${v}` : ''}>
                        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.25 }}>
                          <span style={{ fontSize: 12 }}>{display.label}</span>
                          {display.label !== v && (
                            <Text type="secondary" style={{ fontSize: 10 }}>
                              <code>{v}</code>
                            </Text>
                          )}
                        </span>
                      </Tooltip>
                    );
                  },
                },
                {
                  title: '资源',
                  width: 140,
                  render: (_, row) => {
                    if (!row.resource_type) {
                      return <Text type="secondary">—</Text>;
                    }
                    return (
                      <Tooltip
                        title={`代码：${row.resource_type}${row.resource_id ? `#${row.resource_id}` : ''}`}
                      >
                        <span style={{ fontSize: 12 }}>
                          {formatResourceText(row.resource_type, row.resource_id)}
                        </span>
                      </Tooltip>
                    );
                  },
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 70,
                  render: (v: string) => (
                    <Tag
                      color={AUDIT_STATUS_COLOR[v] ?? 'default'}
                      style={{ marginInlineEnd: 0 }}
                    >
                      {v === 'failure' ? '失败' : '成功'}
                    </Tag>
                  ),
                },
                {
                  title: '原因 / 错误',
                  render: (_, row) => {
                    const text = row.status === 'failure' ? row.error_msg : row.reason;
                    if (!text) {
                      return <Text type="secondary">—</Text>;
                    }
                    return (
                      <Tooltip title={text}>
                        <span
                          style={{
                            display: 'inline-block',
                            maxWidth: 240,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'middle',
                            fontSize: 12,
                          }}
                        >
                          {text}
                        </span>
                      </Tooltip>
                    );
                  },
                },
              ]}
            />
          )}
        </Card>
      )}

      {/* 续期 modal（沿用 Phase 6 的 DatePicker 简单入口；非风险操作） */}
      <Modal
        title={`续期授权 #${extending?.id ?? ''}`}
        open={!!extending}
        onCancel={() => {
          setExtending(null);
          setExtendValue(null);
        }}
        onOk={() => {
          if (!extending || !extendValue) return;
          extendMutation.mutate({
            id: extending.id,
            newExpiresAt: extendValue.toISOString(),
          });
        }}
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

      <QuickGrantDrawer
        open={quickGrantOpen}
        target={quickGrantTarget}
        onClose={() => setQuickGrantOpen(false)}
      />
    </div>
  );
}
