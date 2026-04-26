import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Table, Modal, Select, Tag, Space } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { ControlAppSessionItem, HallListItem } from '@/api/gen/client';

interface ControlAppTabProps {
  hallId: number;
  isAdmin: boolean;
}

export default function ControlAppTab({ hallId, isAdmin }: ControlAppTabProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [switchingSession, setSwitchingSession] = useState<ControlAppSessionItem | null>(null);
  const [targetHallId, setTargetHallId] = useState<number | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.controlAppSessions(hallId),
    queryFn: () => hallApi.listControlAppSessions(hallId),
    select: (res) => res.data.data,
    enabled: isAdmin,
  });

  const { data: halls = [] } = useQuery({
    queryKey: queryKeys.halls({}),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data.list,
  });

  const switchMutation = useMutation({
    mutationFn: ({ sessionId, newHallId }: { sessionId: number; newHallId: number }) =>
      hallApi.switchControlAppHall(hallId, sessionId, { new_hall_id: newHallId }),
    onSuccess: () => {
      message.success('展厅切换成功');
      queryClient.invalidateQueries({ queryKey: queryKeys.controlAppSessions(hallId) });
      setSwitchModalOpen(false);
    },
    onError: () => {
      message.error('切换失败');
    },
  });

  const openSwitch = (record: ControlAppSessionItem) => {
    setSwitchingSession(record);
    setTargetHallId(null);
    setSwitchModalOpen(true);
  };

  const handleSwitch = () => {
    if (!switchingSession || !targetHallId) return;
    switchMutation.mutate({ sessionId: switchingSession.id, newHallId: targetHallId });
  };

  const hallOptions = halls
    .filter((h: HallListItem) => h.id !== hallId)
    .map((h: HallListItem) => ({ value: h.id, label: h.name }));

  const columns: TableColumnsType<ControlAppSessionItem> = [
    { title: '用户', dataIndex: 'user_name', width: 120 },
    { title: '设备', dataIndex: 'device_uuid', width: 180, ellipsis: true },
    {
      title: '允许切换',
      dataIndex: 'allow_hall_switch',
      width: 90,
      align: 'center',
      render: (v: boolean) => v ? <Tag color="blue">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (s: string) => <StatusTag status={s} />,
    },
    { title: '连接时间', dataIndex: 'connected_at', width: 180 },
    { title: '最后活跃', dataIndex: 'last_active_at', width: 180 },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: ControlAppSessionItem) => (
        <Space size="small">
          {record.allow_hall_switch && (
            <a onClick={() => openSwitch(record)}>切换展厅</a>
          )}
        </Space>
      ),
    },
  ];

  if (!isAdmin) {
    return (
      <Card>
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 40 }}>
          仅管理员可查看中控会话
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card title={`中控会话（${sessions.length}）`}>
        <Table<ControlAppSessionItem>
          columns={columns}
          dataSource={sessions}
          loading={isLoading}
          pagination={false}
          rowKey="id"
          size="middle"
        />
      </Card>

      <Modal
        title={`切换展厅 - ${switchingSession?.user_name}`}
        open={switchModalOpen}
        onOk={handleSwitch}
        onCancel={() => setSwitchModalOpen(false)}
        confirmLoading={switchMutation.isPending}
        okButtonProps={{ disabled: !targetHallId }}
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          <Select
            style={{ width: '100%' }}
            placeholder="选择目标展厅"
            options={hallOptions}
            value={targetHallId}
            onChange={setTargetHallId}
          />
        </div>
      </Modal>
    </>
  );
}
