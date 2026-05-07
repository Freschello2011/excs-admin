/**
 * SceneListPage —— ADR-0020-v2 Stage 5 admin Phase B 改造（行内展开模式废弃）
 *
 * 行内 actions 编辑 + 详情查看 Modal 都改为跳转 SceneEditPage v2
 * （路由 /halls/:hallId/scenes/:sceneId/edit）。
 *
 * 仅"新建场景"仍保留 Modal —— 创建后立即跳到编辑页继续编排动作。
 *
 * S5-10 Phase D：v1 SceneActionRow / DeviceCommandCardEditor / DeviceCommandActionRow 已下架。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Select, Button, Modal, Form, Input, InputNumber,
  Popconfirm, Space,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { commandApi } from '@/api/command';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import { useHallStore } from '@/stores/hallStore';
import type { SceneListItem } from '@/api/gen/client';
import { SCENE_ICON_OPTIONS } from './components/_constants';

export default function SceneListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const canManage = useCan(
    'scene.edit',
    selectedHallId ? { type: 'hall', id: String(selectedHallId) } : undefined,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  // Scenes query
  const { data: scenes, isLoading } = useQuery({
    queryKey: queryKeys.scenes(selectedHallId!),
    queryFn: () => commandApi.getScenes(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof commandApi.createScene>[0]) => commandApi.createScene(data),
    onSuccess: (res) => {
      message.success('场景已创建');
      queryClient.invalidateQueries({ queryKey: ['scenes'] });
      setCreateOpen(false);
      form.resetFields();
      const created = res.data.data;
      if (created && selectedHallId) {
        navigate(`/halls/${selectedHallId}/scenes/${created.id}/edit`);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => commandApi.deleteScene(id),
    onSuccess: () => {
      message.success('场景已删除');
      queryClient.invalidateQueries({ queryKey: ['scenes'] });
    },
  });

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      icon: 'bulb',
      sort_order: (scenes?.length ?? 0) + 1,
      scene_type: 'preset',
    });
    setCreateOpen(true);
  };

  const submitCreate = () => {
    form.validateFields().then((values) => {
      createMutation.mutate({
        hall_id: selectedHallId!,
        name: values.name,
        icon: values.icon,
        sort_order: values.sort_order,
        scene_type: 'preset',
        actions: [],
      });
    });
  };

  const goEdit = (record: SceneListItem) => {
    if (!selectedHallId) return;
    navigate(`/halls/${selectedHallId}/scenes/${record.id}/edit`);
  };

  const columns: TableColumnsType<SceneListItem> = [
    { title: '编号', dataIndex: 'id', width: 70 },
    { title: '名称', dataIndex: 'name' },
    { title: '图标', dataIndex: 'icon', width: 80 },
    { title: '排序', dataIndex: 'sort_order', width: 70, align: 'center' },
    { title: '动作数', dataIndex: 'action_count', width: 80, align: 'center' },
    {
      title: '当前场景',
      dataIndex: 'is_current',
      width: 90,
      render: (v: boolean) => v ? <span style={{ color: 'var(--ant-color-success)' }}>当前</span> : '-',
    },
    {
      title: '操作',
      width: 180,
      render: (_: unknown, record) => (
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <a onClick={() => goEdit(record)}>编辑 ›</a>
          {canManage && (
            <Popconfirm title="确认删除此场景？" onConfirm={() => deleteMutation.mutate(record.id)}>
              <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="场景管理"
        description="管理展厅场景与动作"
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!selectedHallId}>
              新建场景
            </Button>
          ) : undefined
        }
      />

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅查看场景列表
        </div>
      ) : (
        <Table<SceneListItem>
          columns={columns}
          dataSource={scenes ?? []}
          loading={isLoading}
          pagination={false}
          rowKey="id"
          size="middle"
          onRow={(record) => ({
            onClick: () => goEdit(record),
            style: { cursor: 'pointer' },
            'data-testid': `scene-row-${record.id}`,
          } as React.HTMLAttributes<HTMLTableRowElement>)}
        />
      )}

      {/* 仅保留"新建"Modal —— 创建后跳 SceneEditPage 编排动作 */}
      <Modal
        title="新建场景"
        open={createOpen}
        onOk={submitCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={createMutation.isPending}
        width={520}
        destroyOnClose
        okText="创建并编辑"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="场景名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={50} placeholder="例：日间模式" />
          </Form.Item>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="icon" label="图标" rules={[{ required: true }]}>
              <Select options={SCENE_ICON_OPTIONS} />
            </Form.Item>
            <Form.Item name="sort_order" label="排序" rules={[{ required: true }]}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
