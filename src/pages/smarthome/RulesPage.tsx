import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Select, Space, Button, Modal, Form, Input, InputNumber,
  Popconfirm, Tag, Divider, Card,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, DeleteOutlined, PlusCircleOutlined, BugOutlined, PlayCircleOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { smarthomeApi } from '@/api/smarthome';
import { hallApi } from '@/api/hall';
import { commandApi } from '@/api/command';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type { HallListItem, DeviceListItem } from '@/api/gen/client';
import type {
  EventRuleDTO,
  CreateTriggerBody,
  CreateConditionBody,
  CreateActionBody,
  SmarthomeConditionType,
  SmarthomeActionType,
  DryRunResultDTO,
} from '@/api/gen/client';
import type { SceneListItem } from '@/api/gen/client';

/* ==================== 常量映射 ==================== */

const EVENT_TYPE_LABELS: Record<string, string> = {
  motion_detected: '检测到运动',
  motion_cleared: '运动消失',
  button_pressed: '按钮按下',
  switch_on: '开关打开',
  switch_off: '开关关闭',
  temperature_alarm: '温度报警',
  humidity_alarm: '湿度报警',
  device_online: '设备上线',
  device_offline: '设备离线',
};

const CONDITION_TYPE_LABELS: Record<SmarthomeConditionType, string> = {
  time_range: '时间范围',
  device_state: '设备状态',
  scene_state: '场景状态',
};

const ACTION_TYPE_LABELS: Record<SmarthomeActionType, string> = {
  switch_scene: '切换场景',
  device_cmd: '设备命令',
  delay: '延迟',
};

const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const CONDITION_TYPE_OPTIONS = Object.entries(CONDITION_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const ACTION_TYPE_OPTIONS = Object.entries(ACTION_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const WEEKDAY_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

/* ==================== 组件 ==================== */

export default function RulesPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const setSelectedHall = useHallStore((s) => s.setSelectedHall);
  const clearSelectedHall = useHallStore((s) => s.clearSelectedHall);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<EventRuleDTO | null>(null);
  const [form] = Form.useForm();
  const [triggers, setTriggers] = useState<CreateTriggerBody[]>([]);
  const [conditions, setConditions] = useState<CreateConditionBody[]>([]);
  const [actions, setActions] = useState<CreateActionBody[]>([]);
  const [dryRunResult, setDryRunResult] = useState<DryRunResultDTO | null>(null);
  const [dryRunModalOpen, setDryRunModalOpen] = useState(false);

  // Halls dropdown
  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 } as Record<string, unknown>),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data,
  });
  const halls = hallsData?.list ?? [];
  const hallOptions = halls.map((h: HallListItem) => ({ value: h.id, label: h.name }));

  // Rules
  const { data: rules = [], isLoading } = useQuery({
    queryKey: queryKeys.smarthomeRules(selectedHallId!),
    queryFn: () => smarthomeApi.listRules(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  // Devices for trigger dropdowns
  const { data: devices = [] } = useQuery({
    queryKey: queryKeys.devices({ hall_id: selectedHallId! } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: selectedHallId! }),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });
  const deviceOptions = devices.map((d: DeviceListItem) => ({ value: d.id, label: `${d.name}（${d.subcategory_name ?? d.model_name ?? ''}）` }));

  // Scenes for action dropdowns
  const { data: scenes = [] } = useQuery({
    queryKey: queryKeys.scenes(selectedHallId!),
    queryFn: () => commandApi.getScenes(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });
  const sceneOptions = scenes.map((s: SceneListItem) => ({ value: s.id, label: s.name }));

  // Mutations
  const createMutation = useMutation({
    mutationFn: smarthomeApi.createRule,
    onSuccess: () => {
      message.success('规则创建成功');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'rules'] });
      closeModal();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof smarthomeApi.updateRule>[1] }) =>
      smarthomeApi.updateRule(id, data),
    onSuccess: () => {
      message.success('规则更新成功');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'rules'] });
      closeModal();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: smarthomeApi.deleteRule,
    onSuccess: () => {
      message.success('规则已删除');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'rules'] });
    },
  });
  const enableMutation = useMutation({
    mutationFn: smarthomeApi.enableRule,
    onSuccess: () => {
      message.success('规则已启用');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'rules'] });
    },
  });
  const disableMutation = useMutation({
    mutationFn: smarthomeApi.disableRule,
    onSuccess: () => {
      message.success('规则已禁用');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'rules'] });
    },
  });
  const debugMutation = useMutation({
    mutationFn: ({ id, debug }: { id: string; debug: boolean }) => smarthomeApi.setDebugMode(id, debug),
    onSuccess: (_, vars) => {
      message.success(vars.debug ? '已开启调试模式' : '已关闭调试模式');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'rules'] });
    },
  });
  const dryRunMutation = useMutation({
    mutationFn: smarthomeApi.dryRunRule,
    onSuccess: (res) => {
      setDryRunResult(res.data.data);
      setDryRunModalOpen(true);
    },
  });

  /* ===== Modal ===== */
  const openCreate = () => {
    setEditingRule(null);
    form.resetFields();
    form.setFieldsValue({ cooldown_sec: 60 });
    setTriggers([{ device_id: 0, event_type: '' }]);
    setConditions([]);
    setActions([]);
    setModalOpen(true);
  };

  const openEdit = (record: EventRuleDTO) => {
    setEditingRule(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      cooldown_sec: record.cooldown_sec,
    });
    setTriggers(record.triggers.map((t) => ({
      device_id: t.device_id,
      event_type: t.event_type,
      event_filter: t.event_filter ?? undefined,
    })));
    setConditions(record.conditions.map((c) => ({
      condition_type: c.condition_type,
      params: c.params,
    })));
    setActions(record.actions.map((a) => ({
      sort_order: a.sort_order,
      action_type: a.action_type,
      params: a.params,
    })));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingRule(null);
    form.resetFields();
    setTriggers([]);
    setConditions([]);
    setActions([]);
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (triggers.length === 0 || triggers.some((t) => !t.device_id || !t.event_type)) {
        message.error('请至少添加一个有效的触发器');
        return;
      }
      if (editingRule) {
        updateMutation.mutate({
          id: editingRule.id,
          data: { ...values, triggers, conditions, actions },
        });
      } else {
        createMutation.mutate({
          ...values,
          hall_id: selectedHallId!,
          triggers,
          conditions,
          actions,
        });
      }
    });
  };

  /* ===== Trigger helpers ===== */
  const addTrigger = () => setTriggers([...triggers, { device_id: 0, event_type: '' }]);
  const removeTrigger = (idx: number) => setTriggers(triggers.filter((_, i) => i !== idx));
  const updateTrigger = (idx: number, field: string, value: unknown) => {
    const next = [...triggers];
    next[idx] = { ...next[idx], [field]: value };
    setTriggers(next);
  };

  /* ===== Condition helpers ===== */
  const addCondition = () => setConditions([...conditions, { condition_type: 'time_range', params: {} }]);
  const removeCondition = (idx: number) => setConditions(conditions.filter((_, i) => i !== idx));
  const updateCondition = (idx: number, field: string, value: unknown) => {
    const next = [...conditions];
    next[idx] = { ...next[idx], [field]: value };
    setConditions(next);
  };

  /* ===== Action helpers ===== */
  const addAction = () => setActions([...actions, { sort_order: actions.length, action_type: 'switch_scene', params: {} }]);
  const removeAction = (idx: number) => setActions(actions.filter((_, i) => i !== idx).map((a, i) => ({ ...a, sort_order: i })));
  const updateAction = (idx: number, field: string, value: unknown) => {
    const next = [...actions];
    next[idx] = { ...next[idx], [field]: value };
    setActions(next);
  };

  /* ===== Columns ===== */
  const columns: TableColumnsType<EventRuleDTO> = [
    { title: '规则名称', dataIndex: 'name', width: 180 },
    {
      title: '状态', width: 140,
      render: (_: unknown, record: EventRuleDTO) => {
        if (!record.enabled) return <Tag color="default">禁用</Tag>;
        if (record.debug_mode) return <Tag color="orange" icon={<BugOutlined />}>调试</Tag>;
        return <Tag color="success">启用</Tag>;
      },
    },
    {
      title: '触发器数', width: 90, align: 'center',
      render: (_: unknown, record: EventRuleDTO) => record.triggers.length,
    },
    {
      title: '动作数', width: 80, align: 'center',
      render: (_: unknown, record: EventRuleDTO) => record.actions.length,
    },
    {
      title: '防抖 (秒)', dataIndex: 'cooldown_sec', width: 100, align: 'center',
    },
    {
      title: '更新时间', dataIndex: 'updated_at', width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作', width: 280,
      render: (_: unknown, record: EventRuleDTO) => (
        <Space size="small" wrap>
          <a onClick={() => openEdit(record)}>编辑</a>
          {record.enabled ? (
            <a onClick={() => disableMutation.mutate(record.id)}>禁用</a>
          ) : (
            <a onClick={() => enableMutation.mutate(record.id)}>启用</a>
          )}
          <a onClick={() => debugMutation.mutate({ id: record.id, debug: !record.debug_mode })}>
            {record.debug_mode ? '关闭调试' : '调试模式'}
          </a>
          <a onClick={() => dryRunMutation.mutate(record.id)}>
            <PlayCircleOutlined /> Dry-run
          </a>
          <Popconfirm title="确定删除该规则？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="规则管理"
        description="配置智能家居事件规则，实现设备联动自动化"
        extra={
          selectedHallId ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建规则</Button>
          ) : undefined
        }
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="选择展厅"
          style={{ width: 220 }}
          value={selectedHallId}
          onChange={(v) => {
            const hall = halls.find((h: HallListItem) => h.id === v);
            if (hall) setSelectedHall(v, hall.name);
          }}
          onClear={clearSelectedHall}
          allowClear
          options={hallOptions}
        />
      </Space>

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>请先选择展厅</div>
      ) : (
        <Table
          columns={columns}
          dataSource={rules}
          loading={isLoading}
          pagination={false}
          rowKey="id"
          size="middle"
          scroll={{ x: 1200 }}
          locale={{ emptyText: '暂无规则，点击右上角新建' }}
        />
      )}

      {/* Rule Editor Modal */}
      <Modal
        title={editingRule ? '编辑规则' : '新建规则'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={720}
        forceRender
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="如：走廊感应开灯" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="规则说明（可选）" />
          </Form.Item>

          {/* Triggers */}
          <Divider plain>触发器（任一满足即触发）</Divider>
          {triggers.map((trigger, idx) => (
            <Card key={idx} size="small" style={{ marginBottom: 8 }}>
              <Space wrap>
                <span>当</span>
                <Select
                  style={{ width: 200 }}
                  placeholder="选择设备"
                  value={trigger.device_id || undefined}
                  onChange={(v) => updateTrigger(idx, 'device_id', v)}
                  options={deviceOptions}
                  showSearch
                  optionFilterProp="label"
                />
                <span>发生</span>
                <Select
                  style={{ width: 180 }}
                  placeholder="事件类型"
                  value={trigger.event_type || undefined}
                  onChange={(v) => updateTrigger(idx, 'event_type', v)}
                  options={EVENT_TYPE_OPTIONS}
                />
                {triggers.length > 1 && (
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeTrigger(idx)} />
                )}
              </Space>
            </Card>
          ))}
          <Button type="dashed" block icon={<PlusCircleOutlined />} onClick={addTrigger} style={{ marginBottom: 16 }}>
            添加触发器
          </Button>

          {/* Conditions */}
          <Divider plain>附加条件（所有条件均满足才执行）</Divider>
          {conditions.map((cond, idx) => (
            <Card key={idx} size="small" style={{ marginBottom: 8 }}>
              <Space wrap>
                <span>且</span>
                <Select
                  style={{ width: 140 }}
                  value={cond.condition_type}
                  onChange={(v) => updateCondition(idx, 'condition_type', v)}
                  options={CONDITION_TYPE_OPTIONS}
                />
                {cond.condition_type === 'time_range' && (
                  <>
                    <Input
                      style={{ width: 90 }}
                      placeholder="09:00"
                      value={(cond.params as { start?: string }).start ?? ''}
                      onChange={(e) => updateCondition(idx, 'params', { ...cond.params, start: e.target.value })}
                    />
                    <span>至</span>
                    <Input
                      style={{ width: 90 }}
                      placeholder="21:00"
                      value={(cond.params as { end?: string }).end ?? ''}
                      onChange={(e) => updateCondition(idx, 'params', { ...cond.params, end: e.target.value })}
                    />
                    <Select
                      mode="multiple"
                      style={{ width: 280 }}
                      placeholder="工作日"
                      value={(cond.params as { weekdays?: number[] }).weekdays ?? []}
                      onChange={(v) => updateCondition(idx, 'params', { ...cond.params, weekdays: v })}
                      options={WEEKDAY_OPTIONS}
                    />
                  </>
                )}
                {cond.condition_type === 'scene_state' && (
                  <>
                    <Select
                      style={{ width: 180 }}
                      placeholder="选择场景"
                      value={(cond.params as { scene_id?: number }).scene_id}
                      onChange={(v) => updateCondition(idx, 'params', { ...cond.params, scene_id: v, op: 'eq', value: 'active' })}
                      options={sceneOptions}
                    />
                  </>
                )}
                {cond.condition_type === 'device_state' && (
                  <>
                    <Select
                      style={{ width: 180 }}
                      placeholder="选择设备"
                      value={(cond.params as { device_id?: number }).device_id}
                      onChange={(v) => updateCondition(idx, 'params', { ...cond.params, device_id: v })}
                      options={deviceOptions}
                      showSearch
                      optionFilterProp="label"
                    />
                  </>
                )}
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeCondition(idx)} />
              </Space>
            </Card>
          ))}
          <Button type="dashed" block icon={<PlusCircleOutlined />} onClick={addCondition} style={{ marginBottom: 16 }}>
            添加条件
          </Button>

          {/* Actions */}
          <Divider plain>执行动作（按顺序执行）</Divider>
          {actions.map((action, idx) => (
            <Card key={idx} size="small" style={{ marginBottom: 8 }}>
              <Space wrap>
                <span>{idx + 1}.</span>
                <Select
                  style={{ width: 140 }}
                  value={action.action_type}
                  onChange={(v) => updateAction(idx, 'action_type', v)}
                  options={ACTION_TYPE_OPTIONS}
                />
                {action.action_type === 'switch_scene' && (
                  <Select
                    style={{ width: 200 }}
                    placeholder="选择场景"
                    value={(action.params as { scene_id?: number }).scene_id}
                    onChange={(v) => updateAction(idx, 'params', { scene_id: v })}
                    options={sceneOptions}
                  />
                )}
                {action.action_type === 'device_cmd' && (
                  <>
                    <Select
                      style={{ width: 180 }}
                      placeholder="选择设备"
                      value={(action.params as { device_id?: number }).device_id}
                      onChange={(v) => updateAction(idx, 'params', { ...action.params, device_id: v })}
                      options={deviceOptions}
                      showSearch
                      optionFilterProp="label"
                    />
                    <Input
                      style={{ width: 140 }}
                      placeholder="命令名"
                      value={(action.params as { command?: string }).command ?? ''}
                      onChange={(e) => updateAction(idx, 'params', { ...action.params, command: e.target.value })}
                    />
                  </>
                )}
                {action.action_type === 'delay' && (
                  <InputNumber
                    style={{ width: 120 }}
                    placeholder="毫秒"
                    min={0}
                    value={(action.params as { milliseconds?: number }).milliseconds}
                    onChange={(v) => updateAction(idx, 'params', { milliseconds: v })}
                    addonAfter="ms"
                  />
                )}
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeAction(idx)} />
              </Space>
            </Card>
          ))}
          <Button type="dashed" block icon={<PlusCircleOutlined />} onClick={addAction} style={{ marginBottom: 16 }}>
            添加动作
          </Button>

          {/* Cooldown */}
          <Form.Item name="cooldown_sec" label="防抖设置（触发后多少秒内不重复触发）">
            <InputNumber min={0} max={86400} style={{ width: 200 }} addonAfter="秒" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Dry-run Result Modal */}
      <Modal
        title="Dry-run 预测结果"
        open={dryRunModalOpen}
        onCancel={() => { setDryRunModalOpen(false); setDryRunResult(null); }}
        footer={null}
        width={560}
        destroyOnClose
      >
        {dryRunResult && (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <div>规则: <strong>{dryRunResult.rule_name}</strong></div>
            <div>
              状态:{' '}
              {dryRunResult.enabled ? <Tag color="success">启用</Tag> : <Tag color="default">禁用</Tag>}
            </div>
            <div>条件检查: {dryRunResult.condition_check ? <Tag color="success">通过</Tag> : <Tag color="error">未通过</Tag>}</div>
            <div>防抖检查: {dryRunResult.cooldown_check ? <Tag color="success">通过</Tag> : <Tag color="warning">冷却中</Tag>}</div>
            <div>
              预测结果:{' '}
              {dryRunResult.would_execute ? (
                <Tag color="success">将会执行</Tag>
              ) : (
                <Tag color="error">不会执行</Tag>
              )}
            </div>
            {dryRunResult.block_reason && (
              <div>阻止原因: <Tag color="warning">{dryRunResult.block_reason}</Tag></div>
            )}
            {dryRunResult.actions.length > 0 && (
              <>
                <Divider>预计执行动作</Divider>
                {dryRunResult.actions.map((a, i) => (
                  <div key={i}>
                    {i + 1}. {ACTION_TYPE_LABELS[a.action_type as SmarthomeActionType] ?? a.action_type} — {JSON.stringify(a.params)}
                  </div>
                ))}
              </>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
