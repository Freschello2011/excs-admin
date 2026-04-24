/**
 * GrantSummaryCard —— 基本信息 Tab 右栏第 1 块：当前 Grant 按 scope 汇总（PRD §8.8.2）。
 *
 * 职责：
 *   - 仅显示 active grants（expired / revoked 去「权限」Tab 看）
 *   - 按 scope_type 分组：G → T → H → E → O
 *   - 每行：模板名 / code·v? / scope 解析（H scope 走 hallMap）/ 到期（橙 ≤30d / 红 过期）
 *     / 授权人 #id / reason
 *   - 空：Empty + 大 CTA「+ 立即授权」
 */
import { Button, Card, Empty, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { KeyOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import Can from '@/components/authz/Can';
import { authzApi } from '@/api/authz';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { Grant, ScopeType } from '@/types/authz';

const { Text } = Typography;

interface Props {
  userId: number;
  onGrantWizard: () => void;
  /** self 视角下隐藏 +授权 CTA（防自锁 —— 前端不引导自授权） */
  isSelf?: boolean;
}

const SCOPE_ORDER: ScopeType[] = ['G', 'T', 'H', 'E', 'O'];
const SCOPE_META: Record<ScopeType, { label: string; color: string }> = {
  G: { label: '全局', color: 'purple' },
  T: { label: '租户', color: 'cyan' },
  H: { label: '展厅', color: 'blue' },
  E: { label: '展项', color: 'geekblue' },
  O: { label: '归属', color: 'orange' },
};

/** 到期渲染：≤30 天橙色 / 已过期红色 / 永久 gray tag */
function ExpiryTag({ expiresAt }: { expiresAt?: string | null }) {
  if (!expiresAt) return <Tag>永久</Tag>;
  const now = dayjs();
  const exp = dayjs(expiresAt);
  const diffDays = exp.diff(now, 'day');
  const label = exp.format('YYYY-MM-DD');
  if (diffDays < 0) {
    return <Tag color="error">已过期 {label}</Tag>;
  }
  if (diffDays <= 30) {
    return <Tag color="warning">{label}（剩 {diffDays} 天）</Tag>;
  }
  return <Tag>到期 {label}</Tag>;
}

export default function GrantSummaryCard({ userId, onGrantWizard, isSelf = false }: Props) {
  const { data: view, isLoading } = useQuery({
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

  if (isLoading) {
    return (
      <Card size="small" title="当前授权（Grant）" style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  const activeGrants = (view?.grants ?? []).filter((g) => g.status === 'active');
  const templateMap = new Map((templates ?? []).map((t) => [t.id, t]));
  const hallMap = new Map((halls ?? []).map((h) => [h.id, h.name]));

  // 按 scope_type 分组 + 组内按 role_template_id 稳定排序
  const groups = SCOPE_ORDER.map((scopeType) => ({
    scopeType,
    items: activeGrants
      .filter((g) => g.scope_type === scopeType)
      .sort((a, b) => a.role_template_id - b.role_template_id),
  })).filter((g) => g.items.length > 0);

  const empty = activeGrants.length === 0;

  return (
    <Card
      size="small"
      title={`当前授权（Grant · ${activeGrants.length} 条生效）`}
      extra={
        !empty && !isSelf && (
          <Can action="user.grant">
            <Button type="link" size="small" onClick={onGrantWizard}>
              + 授权
            </Button>
          </Can>
        )
      }
      style={{ marginBottom: 16 }}
    >
      {empty ? (
        <Empty
          description="该用户尚无任何授权（未登录前可能为 0-grant 初始态）"
          style={{ padding: '16px 0' }}
        >
          {!isSelf && (
            <Can action="user.grant">
              <Button type="primary" icon={<KeyOutlined />} onClick={onGrantWizard}>
                + 立即授权
              </Button>
            </Can>
          )}
        </Empty>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {groups.map((g) => (
            <div key={g.scopeType}>
              <Space size={6} style={{ marginBottom: 6 }}>
                <Tag color={SCOPE_META[g.scopeType].color}>
                  {SCOPE_META[g.scopeType].label}
                </Tag>
                <Text type="secondary">{g.items.length} 条</Text>
              </Space>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {g.items.map((grant) => (
                  <GrantRow
                    key={grant.id}
                    grant={grant}
                    templateMap={templateMap}
                    hallMap={hallMap}
                  />
                ))}
              </Space>
            </div>
          ))}
        </Space>
      )}
    </Card>
  );
}

function GrantRow({
  grant,
  templateMap,
  hallMap,
}: {
  grant: Grant;
  templateMap: Map<number, { id: number; code: string; name_zh: string }>;
  hallMap: Map<number, string>;
}) {
  const tpl = templateMap.get(grant.role_template_id);
  const scopeMeta = SCOPE_META[grant.scope_type];
  let scopeText = scopeMeta.label;
  if (grant.scope_type === 'H') {
    scopeText = `展厅 · ${hallMap.get(Number(grant.scope_id)) ?? grant.scope_id}`;
  } else if (grant.scope_type !== 'G') {
    scopeText = `${scopeMeta.label} · ${grant.scope_id}`;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        padding: '8px 10px',
        border: '1px solid var(--ant-color-border-secondary)',
        borderRadius: 4,
      }}
    >
      <Space size={4}>
        <strong>{tpl?.name_zh ?? `#${grant.role_template_id}`}</strong>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {tpl?.code ?? ''} · v{grant.role_template_version}
        </Text>
      </Space>
      <Tag>{scopeText}</Tag>
      <ExpiryTag expiresAt={grant.expires_at} />
      <Tooltip title={`授权人 user #${grant.granted_by}`}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          by #{grant.granted_by}
        </Text>
      </Tooltip>
      {grant.reason && (
        <Tooltip title={grant.reason}>
          <Text
            type="secondary"
            style={{
              fontSize: 12,
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            · {grant.reason}
          </Text>
        </Tooltip>
      )}
    </div>
  );
}
