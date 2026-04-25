/**
 * UserActionSetSummaryCard —— 基本信息 Tab 右栏第 2 块：「能做什么」按 scope 折叠展开（PRD §8.8.2）。
 *
 * 职责：
 *   - 复用 useScopeGroups hook（从 UserAuthzPanel 抽出）做去重聚合
 *   - antd <Collapse> 每 scope 一块，body 是 action chip cloud
 *   - chip 点击跳 /authz/explain?user_id=X&action=Y（新 tab 打开）
 *   - critical action chip 红色边框（从 ActionRegistry.risk='critical' 判断）
 */
import { useEffect, useMemo } from 'react';
import { Card, Collapse, Empty, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { authzApi } from '@/api/authz';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useScopeGroups } from '@/lib/authz/useScopeGroups';
import { useAuthzMetaStore } from '@/stores/authzMetaStore';
import ScopeTag from '@/components/authz/common/ScopeTag';

const { Text } = Typography;

interface Props {
  userId: number;
}

export default function UserActionSetSummaryCard({ userId }: Props) {
  const { data: view, isLoading } = useQuery({
    queryKey: ['authz', 'user-view', userId],
    queryFn: () => authzApi.getUserAuthzView(userId),
    select: (res) => res.data.data,
    enabled: userId > 0,
  });
  const { data: halls } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 200 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 200 }),
    select: (res) => res.data.data?.list ?? [],
  });

  // 懒加载 action 注册表（用于 critical 高亮）
  const actions = useAuthzMetaStore((s) => s.actions);
  const loadActions = useAuthzMetaStore((s) => s.loadActions);
  useEffect(() => {
    loadActions().catch(() => undefined);
  }, [loadActions]);

  const scopeGroups = useScopeGroups(view?.action_set?.entries);
  const hallMap = new Map((halls ?? []).map((h) => [h.id, h.name]));
  const criticalSet = useMemo(() => {
    const s = new Set<string>();
    (actions ?? []).forEach((a) => {
      if (a.risk === 'critical') s.add(a.code);
    });
    return s;
  }, [actions]);

  if (isLoading) {
    return (
      <Card size="small" title="能做什么（跨 scope 去重汇总）" style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  const totalActions = new Set<string>();
  scopeGroups.forEach((g) => g.actions.forEach((a) => totalActions.add(a)));

  return (
    <Card
      size="small"
      title={`能做什么（跨 scope 共 ${totalActions.size} 项 action）`}
      style={{ marginBottom: 16 }}
    >
      {scopeGroups.length === 0 ? (
        <Empty description="暂无可执行的 action（该用户当前无任何生效 Grant）" />
      ) : (
        <Collapse
          size="small"
          defaultActiveKey={scopeGroups.map((g) => g.key)}
          items={scopeGroups.map((g) => {
            return {
              key: g.key,
              label: (
                <Space>
                  <ScopeTag
                    scopeType={g.scopeType}
                    scopeId={g.scopeId}
                    hallNameMap={hallMap}
                  />
                  <Text type="secondary">{g.actions.length} actions</Text>
                </Space>
              ),
              children: (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {g.actions.map((code) => {
                    const isCritical = criticalSet.has(code);
                    return (
                      <Tooltip key={code} title={isCritical ? 'critical · 高风险操作' : code}>
                        <Tag
                          style={{
                            marginInlineEnd: 0,
                            cursor: 'pointer',
                            borderColor: isCritical ? 'var(--ant-color-error)' : undefined,
                            color: isCritical ? 'var(--ant-color-error)' : undefined,
                          }}
                          onClick={() => {
                            const url = `/platform/authz/explain?user_id=${userId}&action=${encodeURIComponent(
                              code,
                            )}`;
                            window.open(url, '_blank', 'noopener');
                          }}
                        >
                          {code}
                        </Tag>
                      </Tooltip>
                    );
                  })}
                </div>
              ),
            };
          })}
        />
      )}
    </Card>
  );
}
