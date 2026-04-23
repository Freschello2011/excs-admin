/**
 * HallAuthzPanel —— Phase 7.2「按资源视角」面板（展厅）。
 *
 * 嵌入 HallDetailPage 底部；用 `<Can action="user.view" mode="hide">` 包一层。
 *
 * 功能（PRD §8.4）：
 *   - 按角色模板分组显示有权人员
 *   - 一人多模板：每组重复出现
 *   - 每条【移除】只撤销对应那条 Grant（RiskyActionButton → critical 模板需 ≥5 字 reason）
 *
 * 数据来源：`GET /authz/resources/hall/:id/authz-view` → `direct_grants`
 *   - 由于 resource 视角返回的是「直接绑定到该资源的 Grant」，还会混入 scope=G 的全局授权
 *     —— 按照 PRD 该视角以「直接可作用于该展厅」的 active Grant 为主，所以本面板过滤 status=active。
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { useMessage } from '@/hooks/useMessage';
import { authzApi } from '@/api/authz';
import { userApi } from '@/api/user';
import { queryKeys } from '@/api/queryKeys';
import type { Grant, RoleTemplate } from '@/types/authz';
import type { UserListItem } from '@/types/auth';

const { Text } = Typography;

interface Props {
  hallId: number;
  hallName: string;
}

interface GroupedRow {
  template: RoleTemplate | null;
  templateId: number;
  grants: Grant[];
}

export default function HallAuthzPanel({ hallId, hallName }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const {
    data: view,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['authz', 'resource-view', 'hall', hallId],
    queryFn: () => authzApi.getResourceAuthzView('hall', String(hallId)),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  const { data: templates } = useQuery({
    queryKey: ['authz', 'role-templates'],
    queryFn: () => authzApi.listTemplates(),
    select: (res) => res.data.data?.list ?? [],
  });

  const { data: users } = useQuery({
    queryKey: queryKeys.users({ page: 1, page_size: 500 }),
    queryFn: () => userApi.getUsers({ page: 1, page_size: 500 }),
    select: (res) => res.data.data?.list ?? [],
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

  /** 按 role_template_id 分组；仅 status=active */
  const grouped: GroupedRow[] = useMemo(() => {
    const list = view?.direct_grants ?? [];
    const active = list.filter((g) => g.status === 'active');
    const map = new Map<number, Grant[]>();
    for (const g of active) {
      const arr = map.get(g.role_template_id) ?? [];
      arr.push(g);
      map.set(g.role_template_id, arr);
    }
    return Array.from(map.entries()).map(([tid, grants]) => ({
      templateId: tid,
      template: templateMap.get(tid) ?? null,
      grants,
    }));
  }, [view, templateMap]);

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      authzApi.revokeGrant(id, { reason }),
    onMutate: ({ id }) => setRevokingId(id),
    onSuccess: () => {
      message.success('已移除');
      queryClient.invalidateQueries({
        queryKey: ['authz', 'resource-view', 'hall', hallId],
      });
      queryClient.invalidateQueries({ queryKey: ['authz', 'grants'] });
      setRevokingId(null);
    },
    onError: (err: Error) => {
      message.error(err.message || '移除失败');
      setRevokingId(null);
    },
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  const totalUsers = new Set(grouped.flatMap((g) => g.grants.map((x) => x.user_id))).size;

  return (
    <Card
      size="small"
      title={`权限分布 · ${hallName}`}
      extra={
        <Space>
          <Text type="secondary">共 {totalUsers} 位成员</Text>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()}>
            刷新
          </Button>
        </Space>
      }
    >
      {grouped.length === 0 ? (
        <Empty description="该展厅无直接授权（全局管理员不在此列出）" />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {grouped.map((group) => (
            <div key={group.templateId}>
              <Space style={{ marginBottom: 8 }}>
                <strong>{group.template?.name_zh ?? `模板 #${group.templateId}`}</strong>
                <Tag>{group.template?.code ?? ''}</Tag>
                <Text type="secondary">{group.grants.length} 位成员</Text>
                {group.template?.has_critical && <Tag color="red">含 critical</Tag>}
              </Space>
              <Table<Grant>
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={group.grants}
                columns={[
                  {
                    title: '成员',
                    dataIndex: 'user_id',
                    render: (uid: number) => {
                      const u = userMap.get(uid);
                      return u ? (
                        <Space>
                          <Link to={`/platform/users/${uid}?tab=authz`}>{u.name}</Link>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {u.email ?? u.phone ?? ''}
                          </Text>
                        </Space>
                      ) : (
                        <span>#{uid}</span>
                      );
                    },
                  },
                  {
                    title: '授予时间',
                    dataIndex: 'granted_at',
                    width: 150,
                    render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
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
                    width: 120,
                    render: (_, record) => (
                      <RiskyActionButton
                        action="user.grant"
                        size="small"
                        type="link"
                        danger
                        loading={revokingId === record.id}
                        confirmTitle={`从「${hallName}」移除 #${record.user_id}`}
                        confirmContent={
                          group.template?.has_critical
                            ? '该模板含 critical action，需输入撤销原因（≥ 5 字）'
                            : '确认移除该成员的此条授权？'
                        }
                        forceRiskLevel={group.template?.has_critical ? 'critical' : 'high'}
                        onConfirm={async (reason) => {
                          await revokeMutation.mutateAsync({ id: record.id, reason });
                        }}
                      >
                        移除
                      </RiskyActionButton>
                    ),
                  },
                ]}
              />
            </div>
          ))}
        </Space>
      )}
    </Card>
  );
}
