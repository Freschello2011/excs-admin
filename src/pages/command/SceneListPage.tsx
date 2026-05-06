import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Select, Button, Modal, Form, Input, InputNumber,
  Popconfirm, Card, Divider, Space, Tag,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { commandApi } from '@/api/command';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import { useHallStore } from '@/stores/hallStore';
import type { SceneListItem, ActionStep } from '@/api/gen/client';
import type { DeviceListItem, ExhibitListItem } from '@/api/gen/client';
import ActionStepListEditor from './ActionStepListEditor';

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
  const [actions, setActions] = useState<ActionStep[]>([]);
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

  // Exhibits for content-type ActionStep target
  const { data: exhibits } = useQuery({
    queryKey: queryKeys.exhibits(selectedHallId!),
    queryFn: () => hallApi.getExhibits(selectedHallId!),
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
    let actionList: ActionStep[] = [];
    try {
      const res = await commandApi.getScene(scene.id);
      const detail = res.data.data;
      name = detail.name;
      icon = detail.icon;
      sortOrder = detail.sort_order;
      actionList = (detail.actions ?? []).map(normalizeActionStep);
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
      setActions((res.data.data.actions ?? []).map(normalizeActionStep));
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
      // 提交前补 sort_order（按当前数组顺序）
      const orderedActions = actions.map((a, i) => ({ ...a, sort_order: i }));
      const body = {
        hall_id: selectedHallId!,
        name: values.name,
        icon: values.icon,
        sort_order: values.sort_order,
        scene_type: 'preset' as const,
        actions: orderedActions,
      };
      if (editingScene) {
        updateMutation.mutate({ id: editingScene.id, data: body });
      } else {
        createMutation.mutate(body);
      }
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
        description="管理展厅场景与动作（ADR-0020：支持设备指令 + 展项播控混合编排）"
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
        width={780}
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

        <ActionStepListEditor
          value={actions}
          onChange={setActions}
          devices={devices ?? []}
          exhibits={(exhibits ?? []) as ExhibitListItem[]}
        />
      </Modal>

      {/* Detail Modal (view actions) */}
      <Modal
        title={`场景动作 — ${detailScene?.name ?? ''}`}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={640}
      >
        {actions.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ant-color-text-quaternary)', padding: 24 }}>
            暂无动作
          </div>
        ) : (
          actions.map((step, index) => (
            <ActionStepReadonlyCard
              key={index}
              index={index}
              step={step}
              devices={devices ?? []}
              exhibits={(exhibits ?? []) as ExhibitListItem[]}
            />
          ))
        )}
      </Modal>
    </div>
  );
}

/**
 * 老 SceneAction 数据兼容：旧记录可能没有 type 字段，server 反序列化时补默认 'device'，
 * 但 client 直接拿到的 JSON 也可能缺；统一在前端 normalize 一遍，避免 segmented 显示空。
 */
function normalizeActionStep(s: ActionStep): ActionStep {
  return {
    ...s,
    type: s.type ?? 'device',
    delay_from_start_ms: s.delay_from_start_ms ?? 0,
    precondition_block: s.precondition_block ?? false,
  };
}

function ActionStepReadonlyCard({
  index,
  step,
  devices,
  exhibits,
}: {
  index: number;
  step: ActionStep;
  devices: DeviceListItem[];
  exhibits: ExhibitListItem[];
}) {
  const stepType = step.type ?? 'device';
  const target =
    stepType === 'device'
      ? devices.find((d) => d.id === step.device_id)?.name ?? `device#${step.device_id ?? '?'}`
      : exhibits.find((e) => e.id === step.exhibit_id)?.name ?? `exhibit#${step.exhibit_id ?? '?'}`;
  const precondCount = (step.preconditions ?? []).length;

  return (
    <Card size="small" style={{ marginBottom: 8 }}>
      <Space wrap>
        <Tag color="default">Step {index + 1}</Tag>
        <Tag color={stepType === 'device' ? 'blue' : 'purple'}>
          {stepType === 'device' ? '设备指令' : '展项播控'}
        </Tag>
        <span>
          <strong>目标：</strong>
          {target}
        </span>
        <span>
          <strong>命令：</strong>
          {step.command || '—'}
        </span>
        {step.params && Object.keys(step.params).length > 0 && (
          <span>
            <strong>参数：</strong>
            <code style={{ fontSize: 11 }}>{JSON.stringify(step.params)}</code>
          </span>
        )}
        {step.delay_from_start_ms ? (
          <Tag color="gold">延时 {step.delay_from_start_ms}ms</Tag>
        ) : null}
        {precondCount > 0 && (
          <Tag color={step.precondition_block ? 'red' : 'orange'}>
            前置 {precondCount}{step.precondition_block ? '·阻塞' : '·跳过'}
          </Tag>
        )}
      </Space>
    </Card>
  );
}
