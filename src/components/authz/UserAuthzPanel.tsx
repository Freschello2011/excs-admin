/**
 * UserAuthzPanel —— Phase 7.1「按人视角」面板。
 *
 * 嵌入 UserDetailPage 的「权限」Tab 中；不另建独立路由。
 *
 * 功能（PRD §8.3）：
 *   - 用户基本信息 + 当前生效 Grant 列表（并排，每条独立续期 / 撤销）
 *   - "能做什么"汇总：按 scope 聚合展示（去重后的 action 集合）
 *   - 审计快照：最近 10 条与该用户相关的事件（Phase 11 审计 API 上线后填充）
 *
 * 撤销 / 续期走 `RiskyActionButton`（Phase 7.4 替换 Phase 6 手写 modal.confirm）。
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import Can from '@/components/authz/Can';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { useMessage } from '@/hooks/useMessage';
import { authzApi } from '@/api/authz';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useScopeGroups } from '@/lib/authz/useScopeGroups';
import type {
  Grant,
  GrantStatusType,
  RoleTemplate,
  ScopeType,
} from '@/types/authz';

const { Text } = Typography;

const STATUS_META: Record<GrantStatusType, { label: string; color: string }> = {
  active: { label: '生效中', color: 'green' },
  expired: { label: '已过期', color: 'default' },
  revoked: { label: '已撤销', color: 'red' },
};

const SCOPE_LABELS: Record<ScopeType, string> = {
  G: '全局',
  T: '租户',
  H: '展厅',
  E: '展项',
  O: '归属',
};

interface Props {
  userId: number;
  /** 跳转到向导时用（不传则不显示「+ 授权」入口） */
  onNavigateGrantWizard?: () => void;
}

export default function UserAuthzPanel({ userId, onNavigateGrantWizard }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const refreshActionSet = useAuthStore((s) => s.refreshActionSet);

  const [extending, setExtending] = useState<Grant | null>(null);
  const [extendValue, setExtendValue] = useState<Dayjs | null>(null);

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

  // 按 scope 聚合：已抽到 @/lib/authz/useScopeGroups 共用（PRD §8.8.8）。
  // Part 0 0-grant 白屏兜底在 hook 内部实现（entries ?? []）。
  const scopeGroups = useScopeGroups(view?.action_set?.entries);

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

  return (
    <div>
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}
      >
        <Space>
          <Button icon={<ReloadOutlined />} size="small" onClick={() => refetch()}>
            刷新
          </Button>
          <Text type="secondary">
            共 {grants.length} 条 Grant · 生效中 {activeGrants.length}
          </Text>
        </Space>
        {onNavigateGrantWizard && (
          <Can action="user.grant">
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={onNavigateGrantWizard}
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
        ) : (
          <Table<Grant>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={grants}
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
                render: (_, record) => {
                  if (record.scope_type === 'G') return <Tag color="purple">全局</Tag>;
                  if (record.scope_type === 'H') {
                    const name = hallMap.get(Number(record.scope_id));
                    return <Tag color="blue">展厅 · {name ?? record.scope_id}</Tag>;
                  }
                  return (
                    <Tag>
                      {SCOPE_LABELS[record.scope_type]} · {record.scope_id}
                    </Tag>
                  );
                },
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
                width: 140,
                render: (v?: string | null) =>
                  v ? dayjs(v).format('YYYY-MM-DD') : <Tag>永久</Tag>,
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

      {/* 能做什么 */}
      <Card size="small" title="能做什么（按范围聚合去重）" style={{ marginBottom: 16 }}>
        {scopeGroups.length === 0 ? (
          <Empty description="无生效 action" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {scopeGroups.map((g) => {
              const scopeLabel =
                g.scopeType === 'G'
                  ? '全局'
                  : g.scopeType === 'H'
                    ? `展厅 · ${hallMap.get(Number(g.scopeId)) ?? g.scopeId}`
                    : `${SCOPE_LABELS[g.scopeType]} · ${g.scopeId}`;
              return (
                <div
                  key={g.key}
                  style={{
                    padding: 8,
                    border: '1px solid var(--ant-color-border-secondary)',
                    borderRadius: 4,
                  }}
                >
                  <Space style={{ marginBottom: 6 }}>
                    <Tag color={g.scopeType === 'G' ? 'purple' : 'blue'}>{scopeLabel}</Tag>
                    <Text type="secondary">{g.actions.length} actions</Text>
                  </Space>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {g.actions.map((code) => (
                      <Tag key={code} style={{ marginInlineEnd: 0 }}>
                        {code}
                      </Tag>
                    ))}
                  </div>
                </div>
              );
            })}
          </Space>
        )}
      </Card>

      {/* 审计快照（Phase 11 审计 UI 上线前先留占位） */}
      <Card size="small" title="审计快照（最近 10 条）">
        <Alert
          type="info"
          showIcon
          message="审计日志 UI 将在 Phase 11 上线"
          description={
            <span>
              届时此处展示与该用户相关的授权变更、关键操作最近 10 条；现阶段可在
              <Link to="/platform/authz/audit"> 审计日志</Link> 查看占位页。
            </span>
          }
        />
      </Card>

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
    </div>
  );
}
