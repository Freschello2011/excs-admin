import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Table, Tag, Space, Popconfirm } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import type { AppInstanceListItem } from '@/api/gen/client';

interface AppInstanceTabProps {
  hallId: number;
}

export default function AppInstanceTab({ hallId }: AppInstanceTabProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();

  // ADR-0021：按 action + scope 判定，禁用 isAdmin() 字面量门禁
  const hallScope = { type: 'hall' as const, id: String(hallId) };
  const canView = useCan('app.view', hallScope);
  const canManage = useCan('app.manage', hallScope);

  const { data: instances = [], isLoading } = useQuery({
    queryKey: queryKeys.appInstances(hallId),
    queryFn: () => hallApi.getAppInstances(hallId),
    select: (res) => res.data.data,
    enabled: canView,
  });

  const unpairMutation = useMutation({
    mutationFn: (instanceId: number) => hallApi.unpairAppInstance(hallId, instanceId),
    onSuccess: () => {
      message.success('解绑成功');
      queryClient.invalidateQueries({ queryKey: queryKeys.appInstances(hallId) });
    },
  });

  const columns: TableColumnsType<AppInstanceListItem> = [
    { title: '机器码', dataIndex: 'machine_code', width: 200, ellipsis: true },
    { title: '绑定展项', dataIndex: 'exhibit_name', width: 140 },
    {
      title: '主控',
      dataIndex: 'is_hall_master',
      width: 80,
      align: 'center',
      render: (v: boolean) => v ? <Tag color="blue">主控</Tag> : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (s: string) => <StatusTag status={s} />,
    },
    {
      title: '设备信息',
      dataIndex: 'device_info',
      width: 200,
      ellipsis: true,
      render: (info: Record<string, unknown>) => {
        if (!info) return '-';
        const parts = [info.os, info.hostname].filter(Boolean);
        return parts.join(' / ') || '-';
      },
    },
    {
      title: '配对时间',
      dataIndex: 'paired_at',
      width: 180,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '最后心跳',
      dataIndex: 'last_heartbeat_at',
      width: 180,
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    ...(canManage ? [{
      title: '操作',
      width: 100,
      render: (_: unknown, record: AppInstanceListItem) => (
        <Space size="small">
          <Popconfirm
            title="确认解绑？"
            description="解绑后在线设备将收到断开通知"
            onConfirm={() => unpairMutation.mutate(record.id)}
            okButtonProps={{ loading: unpairMutation.isPending }}
          >
            <a style={{ color: 'var(--color-error, #ff4d4f)' }}>解绑</a>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  if (!canView) {
    return (
      <Card>
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 40 }}>
          您没有查看 App 实例的权限。请联系管理员授权当前展厅的「查看展厅 App（app.view）」。
        </div>
      </Card>
    );
  }

  return (
    <Card title={`App 实例（${instances.length}）`}>
      <Table<AppInstanceListItem>
        columns={columns}
        dataSource={instances}
        loading={isLoading}
        pagination={false}
        rowKey="id"
        size="middle"
      />
    </Card>
  );
}
