import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Select, Button, Modal, Form, Input, InputNumber,
  Popconfirm, Card, Divider, Space,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, PlusCircleOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { commandApi } from '@/api/command';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import { useHallStore } from '@/stores/hallStore';
import type { SceneListItem, SceneAction } from '@/types/command';
import type { DeviceListItem } from '@/types/hall';
import SceneActionRow from './SceneActionRow';

const ICON_OPTIONS = [
  { value: 'bulb', label: '灯泡' },
  { value: 'sun', label: '日光' },
  { value: 'moon', label: '月光' },
  { value: 'coffee', label: '休息' },
  { value: 'play', label: '播放' },
  { value: 'poweroff', label: '关机' },
  { value: 'setting', label: '设置' },
  { value: 'home', label: '主页' },
];

export default function SceneListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();

  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const canManage = useCan(
    'scene.edit',
    selectedHallId ? { type: 'hall', id: String(selectedHallId) } : undefined,
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<SceneListItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailScene, setDetailScene] = useState<SceneListItem | null>(null);
  const [actions, setActions] = useState<SceneAction[]>([]);
  const [form] = Form.useForm();

  // Scenes query
  const { data: scenes, isLoading } = useQuery({
    queryKey: queryKeys.scenes(selectedHallId!),
    queryFn: () => commandApi.getScenes(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  // Devices for action editing
  const { data: devices } = useQuery({
    queryKey: queryKeys.devices({ hall_id: selectedHallId! } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: selectedHallId! }),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });
  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof commandApi.createScene>[0]) => commandApi.createScene(data),
    onSuccess: () => {
      message.success('场景创建成功');
      queryClient.invalidateQueries({ queryKey: ['scenes'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof commandApi.updateScene>[1] }) =>
      commandApi.updateScene(id, data),
    onSuccess: () => {
      message.success('场景更新成功');
      queryClient.invalidateQueries({ queryKey: ['scenes'] });
      closeModal();
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
    setEditingScene(null);
    setActions([]);
    form.resetFields();
    form.setFieldsValue({ icon: 'bulb', sort_order: (scenes?.length ?? 0) + 1, scene_type: 'preset' });
    setModalOpen(true);
  };

  const openEdit = async (scene: SceneListItem) => {
    setEditingScene(scene);
    let name = scene.name;
    let icon = scene.icon;
    let sortOrder = scene.sort_order;
    let actionList: SceneAction[] = [];
    try {
      const res = await commandApi.getScene(scene.id);
      const detail = res.data.data;
      name = detail.name;
      icon = detail.icon;
      sortOrder = detail.sort_order;
      actionList = detail.actions ?? [];
    } catch {
      // fallback to list data
    }
    setActions(actionList);
    setModalOpen(true);
    // destroyOnClose 需要等 Modal 挂载后才能 setFieldsValue
    setTimeout(() => {
      form.setFieldsValue({ name, icon, sort_order: sortOrder });
    }, 0);
  };

  const openDetail = async (scene: SceneListItem) => {
    setDetailScene(scene);
    try {
      const res = await commandApi.getScene(scene.id);
      setActions(res.data.data.actions ?? []);
    } catch {
      setActions([]);
    }
    setDetailModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingScene(null);
    setActions([]);
    form.resetFields();
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const body = {
        hall_id: selectedHallId!,
        name: values.name,
        icon: values.icon,
        sort_order: values.sort_order,
        scene_type: 'preset' as const,
        actions,
      };
      if (editingScene) {
        updateMutation.mutate({ id: editingScene.id, data: body });
      } else {
        createMutation.mutate(body);
      }
    });
  };

  // Action list management
  const addAction = () => {
    setActions([...actions, { device_id: 0, command: '', params: {} }]);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const patchAction = (index: number, patch: Partial<SceneAction>) => {
    setActions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch } as SceneAction;
      return next;
    });
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
        <Space size="small">
          <a onClick={() => openDetail(record)}>查看动作</a>
          {canManage && <a onClick={() => openEdit(record)}>编辑</a>}
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
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        title={editingScene ? '编辑场景' : '新建场景'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="name" label="场景名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input maxLength={50} placeholder="例：日间模式" />
            </Form.Item>
            <Form.Item name="icon" label="图标" rules={[{ required: true }]}>
              <Select options={ICON_OPTIONS} />
            </Form.Item>
            <Form.Item name="sort_order" label="排序" rules={[{ required: true }]}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>

        <Divider plain>动作列表</Divider>

        {actions.map((action, index) => (
          <SceneActionRow
            key={index}
            action={action}
            index={index}
            devices={devices ?? []}
            onChange={(patch) => patchAction(index, patch)}
            onRemove={() => removeAction(index)}
          />
        ))}

        <Button type="dashed" block icon={<PlusCircleOutlined />} onClick={addAction}>
          添加动作
        </Button>
      </Modal>

      {/* Detail Modal (view actions) */}
      <Modal
        title={`场景动作 — ${detailScene?.name ?? ''}`}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={600}
      >
        {actions.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ant-color-text-quaternary)', padding: 24 }}>
            暂无动作
          </div>
        ) : (
          actions.map((action, index) => {
            const device = (devices ?? []).find((d: DeviceListItem) => d.id === action.device_id);
            return (
              <Card key={index} size="small" style={{ marginBottom: 8 }}>
                <Space>
                  <span><strong>设备：</strong>{device?.name ?? `#${action.device_id}`}</span>
                  <span><strong>指令：</strong>{action.command}</span>
                  {Object.keys(action.params).length > 0 && (
                    <span><strong>参数：</strong>{JSON.stringify(action.params)}</span>
                  )}
                </Space>
              </Card>
            );
          })
        )}
      </Modal>
    </div>
  );
}
