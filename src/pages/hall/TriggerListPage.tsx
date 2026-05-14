/**
 * device-mgmt-v2 P6 — 触发器管理页 /halls/:hallId/triggers
 *
 * 列表 + 新建/编辑抽屉（listener / timer）+ 5 类 action 编辑 + _check_conflict + reload
 */
import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Dropdown,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { MenuProps, TableColumnsType } from 'antd';
import { PlusOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useMessage } from '@/hooks/useMessage';
import PageHeader from '@/components/common/PageHeader';
import DangerConfirm from '@/components/common/DangerConfirm';
import { triggerApi } from '@/api/triggers';
import { diagApi } from '@/api/diag';
import { hallApi } from '@/api/hall';
import { presetCatalogApi, deviceV2Api } from '@/api/deviceConnector';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type {
  Trigger,
  TriggerKind,
  ListenerSource,
  ListenerPattern,
  TimerSchedule,
  TriggerAction,
  ActionKind,
  ScheduleKind,
  PatternKind,
  ConflictReport,
  CreateTriggerBody,
  TransportKind,
  DocumentedListenerPattern,
} from '@/types/deviceConnector';
import {
  PATTERN_KIND_LABEL,
  PATTERN_KIND_HELP,
  ACTION_KIND_LABEL,
  SCHEDULE_KIND_LABEL,
  TRANSPORT_LABEL,
  transportToResourceKind,
  formatResourceIdentifier,
  RESOURCE_KIND_LABEL,
} from '@/lib/deviceConnectorLabels';
import TransportBindEditor from '@/components/device/TransportBindEditor';

interface DeviceListItemV2 {
  id: number;
  name: string;
  exhibit_id?: number | null;
  exhibit_name?: string | null;
  connector_kind?: 'preset' | 'protocol' | 'raw_transport' | 'plugin';
  connector_ref?: { preset_key?: string; transport?: TransportKind };
  status?: string;
}

type DeviceBindingGroup = {
  deviceId: number;
  deviceName: string;
  totalBindings: number;
  boundCount: number;
  totalSlots: number;
};

export default function TriggerListPage() {
  const { hallId: hallIdStr } = useParams<{ hallId: string }>();
  const hallId = Number(hallIdStr);
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const effectiveHallId = hallId || selectedHallId || 0;
  const navigate = useNavigate();
  const { message } = useMessage();
  const queryClient = useQueryClient();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [filterKind, setFilterKind] = useState<'all' | TriggerKind>('all');
  const [bindingSelectOpen, setBindingSelectOpen] = useState(false);
  const [bindingDeviceId, setBindingDeviceId] = useState<number | null>(null);

  const { data: triggers = [], isLoading } = useQuery({
    queryKey: ['triggers', { hall_id: effectiveHallId }],
    queryFn: () => triggerApi.list({ hall_id: effectiveHallId }),
    select: (res) => res.data.data?.list ?? [],
    enabled: effectiveHallId > 0,
  });

  const { data: devices = [] } = useQuery({
    queryKey: queryKeys.devices({ hall_id: effectiveHallId } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: effectiveHallId }),
    select: (res) => (res.data.data ?? []) as DeviceListItemV2[],
    enabled: effectiveHallId > 0,
  });

  const { data: exhibits = [] } = useQuery({
    queryKey: queryKeys.exhibits(effectiveHallId),
    queryFn: () => hallApi.getExhibits(effectiveHallId),
    select: (res) => res.data.data ?? [],
    enabled: effectiveHallId > 0,
  });

  const deviceBindingGroups = useMemo<DeviceBindingGroup[]>(() => {
    const byDevice = new Map<number, Trigger[]>();
    for (const trigger of triggers) {
      if (trigger.kind !== 'device_event_binding' || trigger.device_id == null) continue;
      byDevice.set(trigger.device_id, [...(byDevice.get(trigger.device_id) ?? []), trigger]);
    }
    return Array.from(byDevice.entries()).map(([deviceId, deviceTriggers]) => ({
      deviceId,
      deviceName: devices.find((device) => device.id === deviceId)?.name ?? `设备 #${deviceId}`,
      totalBindings: deviceTriggers.length,
      boundCount: new Set(deviceTriggers.map((t) => readSourceEventIndex(t.source)).filter(isNumber)).size,
      totalSlots: 0,
    }));
  }, [triggers, devices]);

  const filtered = useMemo(
    () =>
      triggers.filter((trigger) => {
        if (trigger.kind === 'device_event_binding') return false;
        if (filterKind === 'all') return true;
        return trigger.kind === filterKind;
      }),
    [triggers, filterKind],
  );

  const bindingMenuItems: MenuProps['items'] = [
    {
      key: 'device-event-binding',
      label: (
        <div>
          <div>🔘 设备消息触发器</div>
          <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
            按设备 × 接收点矩阵批量配置（适合激光笔等多点触发设备）
          </div>
        </div>
      ),
    },
  ];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => triggerApi.delete(id),
    onSuccess: async (_, id) => {
      message.success('触发器已删除');
      queryClient.invalidateQueries({ queryKey: ['triggers'] });
      // try to reload展厅 App
      const t = triggers.find((x) => x.id === id);
      if (t?.exhibit_id && effectiveHallId > 0) {
        try {
          await diagApi.triggersReload(effectiveHallId, t.exhibit_id);
        } catch {
          // 展厅 App 可能离线，仅 console warn
          console.warn('triggersReload failed (展厅 App offline)');
        }
      }
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => triggerApi.test(id),
    onSuccess: () => message.success('已发送一次测试信号'),
  });

  const columns: TableColumnsType<Trigger> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (n: string, r) => (
        <Space>
          <span style={{ fontWeight: 500 }}>{n}</span>
          {!r.enabled && <Tag>已停用</Tag>}
        </Space>
      ),
    },
    {
      title: '触发方式',
      dataIndex: 'kind',
      width: 150,
      render: (k: TriggerKind) =>
        k === 'listener' ? (
          <Tag color="blue">📡 设备消息触发</Tag>
        ) : (
          <Tag color="purple">⏰ 定时触发</Tag>
        ),
    },
    {
      title: '什么条件触发',
      width: 280,
      render: (_, r) => <SourceSummary trigger={r} devices={devices} />,
    },
    {
      title: '做什么',
      width: 200,
      render: (_, r) => <ActionSummary action={r.action} />,
    },
    {
      title: '最近触发',
      dataIndex: 'last_fired_at',
      width: 140,
      render: (v?: string | null) =>
        v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '-',
    },
    {
      title: '操作',
      width: 200,
      render: (_, r) => (
        <Space size="small">
          <a
            onClick={() => {
              setEditingTrigger(r);
              setDrawerOpen(true);
            }}
          >
            编辑
          </a>
          <Tooltip title="发一次假信号，看动作能不能跑通">
            <a onClick={() => testMutation.mutate(r.id)}>
              <ExperimentOutlined /> 测试
            </a>
          </Tooltip>
          <DangerConfirm
            title="确定删除此触发器？"
            onConfirm={() => deleteMutation.mutate(r.id)}
          >
            <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
          </DangerConfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="触发器"
        description="当设备发来数据，或到点了，自动切场景 / 发命令 / 播放媒体"
        extra={
          <Dropdown.Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!effectiveHallId}
            menu={{
              items: bindingMenuItems,
              onClick: ({ key }) => {
                if (key !== 'device-event-binding') return;
                setBindingDeviceId(null);
                setBindingSelectOpen(true);
              },
            }}
            onClick={() => {
              setEditingTrigger(null);
              setDrawerOpen(true);
            }}
          >
            新建触发器
          </Dropdown.Button>
        }
      />

      {!effectiveHallId && (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅
        </div>
      )}

      {effectiveHallId > 0 && (
        <>
          {deviceBindingGroups.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <Typography.Title level={5} style={{ marginBottom: 12 }}>
                🔘 设备消息触发器（按设备）
              </Typography.Title>
              <Row gutter={[12, 12]}>
                {deviceBindingGroups.map((group) => (
                  <Col key={group.deviceId} xs={24} sm={12} md={8}>
                    <Card
                      size="small"
                      hoverable
                      onClick={() =>
                        navigate(
                          `/halls/${effectiveHallId}/triggers/device-event-binding/${group.deviceId}/edit`,
                        )
                      }
                      style={{ borderRadius: 8, cursor: 'pointer' }}
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <strong>
                          {group.deviceName}（#{group.deviceId}）
                        </strong>
                        <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
                          已配 {group.boundCount} 个接收点 · 共 {group.totalBindings} 条 binding
                        </span>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          )}
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            ⚙ 通用触发器（监听 / 定时）
          </Typography.Title>
          <Space style={{ marginBottom: 16 }}>
            <Radio.Group value={filterKind} onChange={(e) => setFilterKind(e.target.value)}>
              <Radio.Button value="all">全部</Radio.Button>
              <Radio.Button value="listener">📡 设备消息触发</Radio.Button>
              <Radio.Button value="timer">⏰ 定时触发</Radio.Button>
            </Radio.Group>
          </Space>
          <Table
            columns={columns}
            dataSource={filtered}
            loading={isLoading}
            rowKey="id"
            pagination={{ pageSize: 30 }}
            size="middle"
          />
        </>
      )}

      <TriggerDrawer
        open={drawerOpen}
        editing={editingTrigger}
        hallId={effectiveHallId}
        devices={devices}
        exhibits={exhibits}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['triggers'] });
          setDrawerOpen(false);
        }}
      />

      <Modal
        open={bindingSelectOpen}
        title="选择设备"
        okText="去配置"
        cancelText="取消"
        okButtonProps={{ disabled: !bindingDeviceId }}
        onCancel={() => setBindingSelectOpen(false)}
        onOk={() => {
          if (!bindingDeviceId || !effectiveHallId) return;
          setBindingSelectOpen(false);
          navigate(`/halls/${effectiveHallId}/triggers/device-event-binding/${bindingDeviceId}/edit`);
        }}
      >
        <Select
          value={bindingDeviceId ?? undefined}
          onChange={(v) => setBindingDeviceId(v)}
          placeholder="选择要批量配置接收点的设备"
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          options={devices.map((d) => ({
            value: d.id,
            label: d.name,
          }))}
        />
      </Modal>
    </div>
  );
}

/* ==================== 列表 摘要 ==================== */

function readSourceEventIndex(source: Trigger['source']): number | null {
  const value = (source as Record<string, unknown>).event_index;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isNumber(value: number | null): value is number {
  return value != null;
}

function SourceSummary({ trigger, devices }: { trigger: Trigger; devices: DeviceListItemV2[] }) {
  if (trigger.kind === 'listener') {
    const src = trigger.source as ListenerSource;
    const device = devices.find((d) => d.id === trigger.device_id);
    const ident = transportToResourceKind(src.transport)
      ? formatResourceIdentifier(transportToResourceKind(src.transport)!, src.bind ?? {})
      : '?';
    return (
      <Space direction="vertical" size={0}>
        <span style={{ fontSize: 13 }}>
          {device?.name ?? '设备已删除'}
          <span style={{ color: 'var(--ant-color-text-tertiary)', marginLeft: 6 }}>
            {TRANSPORT_LABEL[src.transport] ?? src.transport} {ident}
          </span>
        </span>
        {trigger.condition && (
          <code style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)' }}>
            {PATTERN_KIND_LABEL[trigger.condition.pattern_kind]}：{trigger.condition.pattern}
          </code>
        )}
      </Space>
    );
  } else {
    const sched = (trigger.schedule || trigger.source) as TimerSchedule;
    let summary = '';
    switch (sched.schedule_kind) {
      case 'cron':
        summary = `按周期：${sched.cron}`;
        break;
      case 'once_at':
        summary = `一次性：${sched.once_at}`;
        break;
      case 'interval':
        summary = `每 ${sched.interval_seconds} 秒一次`;
        break;
    }
    return <span style={{ fontSize: 13 }}>{summary}</span>;
  }
}

function ActionSummary({ action }: { action: TriggerAction }) {
  const label = ACTION_KIND_LABEL[action.kind];
  let detail = '';
  if (action.kind === 'scene') detail = `场景 ${action.payload.scene_id}`;
  else if (action.kind === 'command')
    detail = `${action.payload.device_id ?? '?'} · ${action.payload.command_code ?? '?'}`;
  else if (action.kind === 'webhook') detail = String(action.payload.url ?? '');
  else if (action.kind === 'query') detail = `设备 ${action.payload.device_id}`;
  else if (action.kind === 'media') detail = String(action.payload.media_id ?? '');
  return (
    <Space direction="vertical" size={0}>
      <span style={{ fontSize: 13 }}>{label}</span>
      {detail && (
        <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>{detail}</span>
      )}
    </Space>
  );
}

/* ==================== 抽屉 ==================== */

interface DrawerProps {
  open: boolean;
  editing: Trigger | null;
  hallId: number;
  devices: DeviceListItemV2[];
  exhibits: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function TriggerDrawer({ open, editing, hallId, devices, exhibits, onClose, onSaved }: DrawerProps) {
  const { message } = useMessage();
  const [kind, setKind] = useState<TriggerKind>('listener');
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [exhibitId, setExhibitId] = useState<number | null>(null);
  const [deviceId, setDeviceId] = useState<number | null>(null);

  // listener
  const [listenerTransport, setListenerTransport] = useState<TransportKind>('tcp');
  const [listenerBind, setListenerBind] = useState<Record<string, unknown>>({});
  const [conditionKind, setConditionKind] = useState<PatternKind>('exact');
  const [conditionPattern, setConditionPattern] = useState('');
  const [usePresetPattern, setUsePresetPattern] = useState<boolean | null>(null);
  const [pickedPresetPatternIdx, setPickedPresetPatternIdx] = useState<number | null>(null);

  // timer
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('cron');
  const [cron, setCron] = useState('0 9 * * *');
  const [onceAt, setOnceAt] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState<number>(60);

  // action
  const [actionKind, setActionKind] = useState<ActionKind>('scene');
  const [actionPayload, setActionPayload] = useState<Record<string, unknown>>({});

  // conflict report state
  const [conflict, setConflict] = useState<ConflictReport | null>(null);

  // load preset detail when device picked
  const selectedDevice = devices.find((d) => d.id === deviceId);
  const selectedDevicePresetKey = selectedDevice?.connector_ref?.preset_key;
  const { data: presetDetail } = useQuery({
    queryKey: ['preset-catalog', selectedDevicePresetKey],
    queryFn: () => presetCatalogApi.get(selectedDevicePresetKey!),
    select: (res) => res.data.data,
    enabled: !!selectedDevicePresetKey,
  });
  const defaultListenerPatterns: DocumentedListenerPattern[] | undefined =
    presetDetail?.default_listener_patterns;
  const isReceiver =
    selectedDevice?.connector_kind === 'preset' &&
    presetDetail?.commands.length === 0 &&
    (defaultListenerPatterns?.length ?? 0) > 0;

  // reset form on open / editing change
  useMemo(() => {
    if (!open) return;
    setConflict(null);
    setUsePresetPattern(null);
    setPickedPresetPatternIdx(null);
    if (editing) {
      setKind(editing.kind);
      setName(editing.name);
      setEnabled(editing.enabled);
      setExhibitId(editing.exhibit_id ?? null);
      setDeviceId(editing.device_id ?? null);
      if (editing.kind === 'listener') {
        const src = editing.source as ListenerSource;
        setListenerTransport(src.transport);
        setListenerBind((src.bind as Record<string, unknown>) ?? {});
        if (editing.condition) {
          setConditionKind(editing.condition.pattern_kind);
          setConditionPattern(editing.condition.pattern);
        }
      } else {
        const sched = (editing.schedule || editing.source) as TimerSchedule;
        setScheduleKind(sched.schedule_kind);
        if (sched.cron) setCron(sched.cron);
        if (sched.once_at) setOnceAt(sched.once_at);
        if (sched.interval_seconds) setIntervalSeconds(sched.interval_seconds);
      }
      setActionKind(editing.action.kind);
      setActionPayload(editing.action.payload);
    } else {
      setKind('listener');
      setName('');
      setEnabled(true);
      setExhibitId(null);
      setDeviceId(null);
      setListenerTransport('tcp');
      setListenerBind({});
      setConditionKind('exact');
      setConditionPattern('');
      setScheduleKind('cron');
      setCron('0 9 * * *');
      setOnceAt('');
      setIntervalSeconds(60);
      setActionKind('scene');
      setActionPayload({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  // device list filtered for listener (raw_transport || receiver-type preset)
  const listenerEligibleDevices = useMemo(() => {
    return devices.map((d) => {
      const isRaw = d.connector_kind === 'raw_transport';
      const isReceiverType =
        d.connector_kind === 'preset' && d.connector_ref?.preset_key;
      // 实际是否接收器型要看 preset 是否有 default_listener_patterns；这里前端先放宽，
      // 选中后再 detail-fetch 判断
      return {
        ...d,
        eligible: isRaw || !!isReceiverType,
      };
    });
  }, [devices]);

  const conflictMutation = useMutation({
    mutationFn: () => {
      const rk = transportToResourceKind(listenerTransport);
      if (!rk) throw new Error('transport 不支持冲突预检');
      return triggerApi.checkConflict({
        hall_id: hallId,
        exhibit_id: exhibitId ?? 0,
        resource_kind: rk,
        identifier: formatResourceIdentifier(rk, listenerBind),
        ignore_trigger_id: editing?.id,
      });
    },
    onSuccess: (res) => {
      const report = res.data.data;
      if (report.has_conflict) {
        setConflict(report);
      } else {
        setConflict(null);
        message.success('端口检查通过，没有冲突');
      }
    },
    onError: () => {
      // 503 时云端会回 exhibit_offline；此 mutation 失败时直接转给保存逻辑判断
    },
  });

  const saveMutation = useMutation({
    mutationFn: (body: CreateTriggerBody) =>
      editing ? triggerApi.update(editing.id, body) : triggerApi.create(body),
    onSuccess: async (_, body) => {
      message.success(editing ? '触发器已更新' : '触发器已创建');
      // reload 展厅 App
      if (body.exhibit_id && hallId > 0) {
        try {
          await diagApi.triggersReload(hallId, body.exhibit_id);
        } catch {
          console.warn('triggersReload failed (展厅 App offline)');
        }
      }
      onSaved();
    },
  });

  const handleSave = async (force: boolean = false) => {
    if (!name.trim()) {
      message.error('请填名称');
      return;
    }
    // listener 必填校验
    if (kind === 'listener') {
      if (!deviceId) {
        message.error('请选监听设备');
        return;
      }
      if (!conditionPattern.trim()) {
        message.error('请填匹配规则');
        return;
      }
      if (conditionKind === 'regex') {
        try {
          new RegExp(conditionPattern);
        } catch (e) {
          message.error(`匹配规则有误：${(e as Error).message}`);
          return;
        }
      }
      // 端口冲突预检
      if (!force) {
        const rk = transportToResourceKind(listenerTransport);
        if (rk && exhibitId) {
          try {
            const res = await triggerApi.checkConflict({
              hall_id: hallId,
              exhibit_id: exhibitId,
              resource_kind: rk,
              identifier: formatResourceIdentifier(rk, listenerBind),
              ignore_trigger_id: editing?.id,
            });
            const report = res.data.data;
            if (report.has_conflict) {
              setConflict(report);
              return;
            }
          } catch {
            // 503 / network — show "强制保存" 选项
            Modal.confirm({
              title: '⚠ 没法检查这个端口有没有被占用',
              content: '展厅机器现在连不上。强制保存有冲突风险，但触发器配置可以入库。',
              okText: '⚠ 忽略并保存',
              cancelText: '取消',
              onOk: () => handleSave(true),
            });
            return;
          }
        }
      }
    }

    // build body
    const body: CreateTriggerBody = {
      hall_id: hallId,
      exhibit_id: exhibitId ?? null,
      device_id: kind === 'listener' ? deviceId : (actionKind === 'command' || actionKind === 'query') ? (actionPayload.device_id as number | undefined) ?? null : null,
      name: name.trim(),
      kind,
      enabled,
      source:
        kind === 'listener'
          ? ({ transport: listenerTransport, bind: listenerBind } as ListenerSource)
          : (buildTimerSchedule() as TimerSchedule),
      condition:
        kind === 'listener'
          ? ({ pattern_kind: conditionKind, pattern: conditionPattern } as ListenerPattern)
          : null,
      action: { kind: actionKind, payload: actionPayload },
    };
    saveMutation.mutate(body);
  };

  const buildTimerSchedule = (): TimerSchedule => {
    const s: TimerSchedule = { schedule_kind: scheduleKind };
    if (scheduleKind === 'cron') s.cron = cron;
    if (scheduleKind === 'once_at') s.once_at = onceAt;
    if (scheduleKind === 'interval') s.interval_seconds = intervalSeconds;
    return s;
  };

  // apply preset listener pattern
  const applyPresetPattern = (idx: number) => {
    if (!defaultListenerPatterns) return;
    const p = defaultListenerPatterns[idx];
    setConditionKind(p.pattern_kind);
    setConditionPattern(p.pattern);
    setPickedPresetPatternIdx(idx);
  };

  return (
    <Drawer
      title={editing ? '编辑触发器' : '新建触发器'}
      open={open}
      onClose={onClose}
      width={780}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saveMutation.isPending} onClick={() => handleSave(false)}>
            保存
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <Form.Item label="名称" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Form.Item>
        <Form.Item label="启用">
          <Switch checked={enabled} onChange={setEnabled} />
        </Form.Item>
        <Form.Item label="所属展项">
          <Select
            value={exhibitId}
            onChange={setExhibitId}
            allowClear
            placeholder="选择展项（必填，触发器在该展项执行）"
            options={exhibits.map((e) => ({ value: e.id, label: e.name }))}
          />
        </Form.Item>
        <Form.Item label="触发方式">
          <Radio.Group value={kind} onChange={(e) => setKind(e.target.value)}>
            <Radio.Button value="listener">📡 设备消息触发（设备发数据时触发）</Radio.Button>
            <Radio.Button value="timer">⏰ 定时触发（到点自动执行）</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {kind === 'listener' && (
          <ListenerForm
            devices={listenerEligibleDevices}
            deviceId={deviceId}
            onDeviceChange={(id) => {
              setDeviceId(id);
              setUsePresetPattern(null);
              setPickedPresetPatternIdx(null);
            }}
            transport={listenerTransport}
            onTransportChange={setListenerTransport}
            bind={listenerBind}
            onBindChange={setListenerBind}
            conditionKind={conditionKind}
            conditionPattern={conditionPattern}
            onConditionKindChange={setConditionKind}
            onConditionPatternChange={setConditionPattern}
            isReceiver={isReceiver}
            defaultListenerPatterns={defaultListenerPatterns}
            usePresetPattern={usePresetPattern}
            onUsePresetPatternChange={setUsePresetPattern}
            pickedPresetPatternIdx={pickedPresetPatternIdx}
            onPickPresetPattern={applyPresetPattern}
          />
        )}

        {kind === 'timer' && (
          <TimerForm
            scheduleKind={scheduleKind}
            onScheduleKindChange={setScheduleKind}
            cron={cron}
            onCronChange={setCron}
            onceAt={onceAt}
            onOnceAtChange={setOnceAt}
            intervalSeconds={intervalSeconds}
            onIntervalSecondsChange={setIntervalSeconds}
          />
        )}

        <div style={{ borderTop: '1px solid var(--ant-color-border-secondary)', paddingTop: 16, marginTop: 16 }}>
          <h4 style={{ marginBottom: 12 }}>做什么（动作）</h4>
          <ActionEditor
            kind={actionKind}
            onKindChange={(k) => {
              setActionKind(k);
              setActionPayload({});
            }}
            payload={actionPayload}
            onPayloadChange={setActionPayload}
            devices={devices}
          />
        </div>

        {kind === 'listener' && (
          <Button
            style={{ marginTop: 16 }}
            onClick={() => conflictMutation.mutate()}
            loading={conflictMutation.isPending}
          >
            手动检查端口是否被占用
          </Button>
        )}

        {conflict && conflict.has_conflict && <ConflictAlert report={conflict} onClose={() => setConflict(null)} />}
      </Form>
    </Drawer>
  );
}

/* ==================== Listener Form ==================== */

function ListenerForm({
  devices,
  deviceId,
  onDeviceChange,
  transport,
  onTransportChange,
  bind,
  onBindChange,
  conditionKind,
  conditionPattern,
  onConditionKindChange,
  onConditionPatternChange,
  isReceiver,
  defaultListenerPatterns,
  usePresetPattern,
  onUsePresetPatternChange,
  pickedPresetPatternIdx,
  onPickPresetPattern,
}: {
  devices: (DeviceListItemV2 & { eligible: boolean })[];
  deviceId: number | null;
  onDeviceChange: (id: number | null) => void;
  transport: TransportKind;
  onTransportChange: (t: TransportKind) => void;
  bind: Record<string, unknown>;
  onBindChange: (b: Record<string, unknown>) => void;
  conditionKind: PatternKind;
  conditionPattern: string;
  onConditionKindChange: (k: PatternKind) => void;
  onConditionPatternChange: (p: string) => void;
  isReceiver: boolean;
  defaultListenerPatterns?: DocumentedListenerPattern[];
  usePresetPattern: boolean | null;
  onUsePresetPatternChange: (v: boolean | null) => void;
  pickedPresetPatternIdx: number | null;
  onPickPresetPattern: (idx: number) => void;
}) {
  return (
    <>
      <Form.Item
        label={
          <Space>
            <span>监听哪个设备</span>
            <Tooltip
              title={
                <div style={{ fontSize: 12 }}>
                  能挂触发器的设备：
                  <br />
                  ① 自定义 / 非标设备
                  <br />
                  ② 接收器型已支持型号（如激光笔接收器）
                  <br />
                  命令式预置 / 协议设备的命令是固定的，无法听数据。
                </div>
              }
            >
              <span style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12, cursor: 'help' }}>
                ❓ 为什么有些设备灰了？
              </span>
            </Tooltip>
          </Space>
        }
        required
      >
        <Select
          value={deviceId}
          onChange={(v) => onDeviceChange(v ?? null)}
          placeholder="选要监听的设备"
          options={devices.map((d) => ({
            value: d.id,
            label: d.name,
            disabled: !d.eligible,
            title: d.eligible ? '' : '该设备类型无法监听数据',
          }))}
        />
      </Form.Item>

      {deviceId && (
        <Form.Item label="端口设置">
          <Select
            value={transport}
            onChange={onTransportChange}
            style={{ marginBottom: 12 }}
            options={(['tcp', 'udp', 'serial', 'osc', 'artnet', 'modbus'] as TransportKind[]).map((t) => ({
              value: t,
              label: TRANSPORT_LABEL[t],
            }))}
          />
          <TransportBindEditor transport={transport} value={bind} onChange={onBindChange} />
        </Form.Item>
      )}

      {/* 接收器型 preset 一键引用 */}
      {isReceiver && deviceId && defaultListenerPatterns && defaultListenerPatterns.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="✨ 这是接收器型设备 — 可以用现成的匹配规则"
          description={
            <div>
              <Radio.Group
                value={usePresetPattern}
                onChange={(e) => onUsePresetPatternChange(e.target.value)}
                style={{ marginBottom: 8 }}
              >
                <Radio value={true}>用预置规则（推荐）</Radio>
                <Radio value={false}>手写规则</Radio>
              </Radio.Group>
              {usePresetPattern && (
                <Select
                  placeholder="选一条预置匹配规则"
                  style={{ width: '100%', marginTop: 8 }}
                  value={pickedPresetPatternIdx}
                  onChange={onPickPresetPattern}
                  options={defaultListenerPatterns.map((p, idx) => ({
                    value: idx,
                    label: `${p.label} · 例如：${p.example_payload}`,
                  }))}
                />
              )}
              {pickedPresetPatternIdx !== null && defaultListenerPatterns[pickedPresetPatternIdx] && (
                <PresetPatternPreview p={defaultListenerPatterns[pickedPresetPatternIdx]} />
              )}
            </div>
          }
        />
      )}

      <Form.Item
        label="匹配方式"
        required
        extra={PATTERN_KIND_HELP[conditionKind]}
      >
        <Radio.Group
          value={conditionKind}
          onChange={(e) => onConditionKindChange(e.target.value)}
          disabled={usePresetPattern === true}
        >
          {(['exact', 'regex', 'bytes'] as PatternKind[]).map((k) => (
            <Radio.Button key={k} value={k}>
              {PATTERN_KIND_LABEL[k]}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Form.Item>
      <Form.Item
        label={
          <Space>
            <span>匹配规则</span>
            {usePresetPattern === true && (
              <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
                🔒 来自预置库不可改 · 想改请去 设备目录 调整全局规则（管理员权限）
              </span>
            )}
          </Space>
        }
        required
        extra="匹配到后可以引用抓出来的内容：${1} ${2} ...（按括号出现的顺序）"
      >
        <Input.TextArea
          value={conditionPattern}
          onChange={(e) => onConditionPatternChange(e.target.value)}
          rows={2}
          disabled={usePresetPattern === true}
          placeholder={
            conditionKind === 'exact'
              ? 'STAGE_START'
              : conditionKind === 'regex'
              ? '^STAGE_(\\d+)$'
              : 'FF 01 02 0A'
          }
        />
      </Form.Item>
    </>
  );
}

function PresetPatternPreview({ p }: { p: DocumentedListenerPattern }) {
  return (
    <div style={{ marginTop: 12, fontSize: 12 }}>
      <div>
        <Tag color="warning">💡 设备真实发出来的样子</Tag>
        <code style={{ background: '#fff7e6', padding: '2px 6px', borderRadius: 4 }}>
          {p.example_payload}
        </code>
      </div>
      <div style={{ marginTop: 6 }}>
        <Tag color="success">📖 这串数据是什么意思</Tag>
        <span>{p.example_meaning}</span>
      </div>
      {p.capture_groups && p.capture_groups.length > 0 && (
        <div style={{ marginTop: 6 }}>
          命中后能抓到：
          {p.capture_groups.map((c, i) => (
            <code key={i} style={{ marginRight: 8 }}>
              ${`{${i + 1}}`} = {c}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== Timer Form ==================== */

function TimerForm({
  scheduleKind,
  onScheduleKindChange,
  cron,
  onCronChange,
  onceAt,
  onOnceAtChange,
  intervalSeconds,
  onIntervalSecondsChange,
}: {
  scheduleKind: ScheduleKind;
  onScheduleKindChange: (k: ScheduleKind) => void;
  cron: string;
  onCronChange: (c: string) => void;
  onceAt: string;
  onOnceAtChange: (v: string) => void;
  intervalSeconds: number;
  onIntervalSecondsChange: (v: number) => void;
}) {
  return (
    <>
      <Form.Item label="时间方式">
        <Radio.Group value={scheduleKind} onChange={(e) => onScheduleKindChange(e.target.value)}>
          {(['cron', 'once_at', 'interval'] as ScheduleKind[]).map((k) => (
            <Radio.Button key={k} value={k}>
              {SCHEDULE_KIND_LABEL[k]}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Form.Item>
      {scheduleKind === 'cron' && (
        <Form.Item
          label={
            <Space>
              <span>时间表达式</span>
              <Tooltip
                title={
                  <div style={{ fontSize: 12 }}>
                    格式：分 时 日 月 周
                    <br />
                    <code>0 9 * * *</code> = 每天 9:00
                    <br />
                    <code>0 9 * * 1-5</code> = 工作日 9:00
                    <br />
                    <code>*/15 * * * *</code> = 每 15 分钟
                  </div>
                }
              >
                <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)', cursor: 'help' }}>
                  ❓ 怎么填？
                </span>
              </Tooltip>
            </Space>
          }
          required
        >
          <Input value={cron} onChange={(e) => onCronChange(e.target.value)} placeholder="0 9 * * *" />
        </Form.Item>
      )}
      {scheduleKind === 'once_at' && (
        <Form.Item label="执行时刻" required extra="格式：年-月-日T时:分:秒+08:00">
          <Input
            value={onceAt}
            onChange={(e) => onOnceAtChange(e.target.value)}
            placeholder="2026-05-01T09:00:00+08:00"
          />
        </Form.Item>
      )}
      {scheduleKind === 'interval' && (
        <Form.Item label="间隔（秒）" required>
          <InputNumber
            value={intervalSeconds}
            onChange={(v) => onIntervalSecondsChange(Number(v ?? 60))}
            min={1}
            max={86400}
            style={{ width: '100%' }}
          />
        </Form.Item>
      )}
    </>
  );
}

/* ==================== Action Editor ==================== */

function ActionEditor({
  kind,
  onKindChange,
  payload,
  onPayloadChange,
  devices,
}: {
  kind: ActionKind;
  onKindChange: (k: ActionKind) => void;
  payload: Record<string, unknown>;
  onPayloadChange: (p: Record<string, unknown>) => void;
  devices: DeviceListItemV2[];
}) {
  const set = (k: string, v: unknown) => onPayloadChange({ ...payload, [k]: v });
  const deviceOptions = devices.map((d) => ({ value: d.id, label: d.name }));

  return (
    <>
      <Tabs
        activeKey={kind}
        onChange={(k) => onKindChange(k as ActionKind)}
        items={(['scene', 'command', 'media', 'query', 'webhook'] as ActionKind[]).map((k) => ({
          key: k,
          label: ACTION_KIND_LABEL[k],
        }))}
      />

      {kind === 'scene' && (
        <SceneActionForm payload={payload} set={set} />
      )}
      {kind === 'command' && (
        <CommandActionForm payload={payload} set={set} devices={deviceOptions} />
      )}
      {kind === 'query' && (
        <QueryActionForm payload={payload} set={set} devices={deviceOptions} />
      )}
      {kind === 'media' && (
        <MediaActionForm payload={payload} set={set} />
      )}
      {kind === 'webhook' && <WebhookActionForm payload={payload} set={set} />}
    </>
  );
}

function SceneActionForm({
  payload,
  set,
}: {
  payload: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
}) {
  return (
    <Form.Item label="场景 ID" required extra="切到指定场景。可在「场景管理」里查看场景 id">
      <InputNumber
        value={payload.scene_id as number | undefined}
        onChange={(v) => set('scene_id', v)}
        style={{ width: '100%' }}
      />
    </Form.Item>
  );
}

function CommandActionForm({
  payload,
  set,
  devices,
}: {
  payload: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
  devices: { value: number; label: string }[];
}) {
  return (
    <>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message="⚠ 这种动作只在展厅主控机上执行"
        description="其他展厅机器收到事件后会跳过不下发，避免重复。如果你希望任意机器都能下发，请改用「🔍 查询设备」动作。"
      />
      <Form.Item label="设备" required>
        <Select
          value={payload.device_id as number | undefined}
          onChange={(v) => set('device_id', v)}
          options={devices}
        />
      </Form.Item>
      <Form.Item label="命令名" required extra="如 power_on / channel_on / set_brightness">
        <Input
          value={payload.command_code as string | undefined}
          onChange={(e) => set('command_code', e.target.value)}
        />
      </Form.Item>
      <Form.Item label="参数（JSON 格式）">
        <Input.TextArea
          rows={3}
          value={JSON.stringify(payload.params ?? {}, null, 2)}
          onChange={(e) => {
            try {
              set('params', JSON.parse(e.target.value || '{}'));
            } catch {
              // 用户编辑中，先存字符串
            }
          }}
        />
      </Form.Item>
    </>
  );
}

function QueryActionForm({
  payload,
  set,
  devices,
}: {
  payload: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
  devices: { value: number; label: string }[];
}) {
  return (
    <Form.Item label="设备" required extra="立即向该设备发一次查询，刷新它的最新状态">
      <Select value={payload.device_id as number | undefined} onChange={(v) => set('device_id', v)} options={devices} />
    </Form.Item>
  );
}

function MediaActionForm({
  payload,
  set,
}: {
  payload: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
}) {
  return (
    <Form.Item label="媒体 ID" required>
      <InputNumber
        value={payload.media_id as number | undefined}
        onChange={(v) => set('media_id', v)}
        style={{ width: '100%' }}
      />
    </Form.Item>
  );
}

function WebhookActionForm({
  payload,
  set,
}: {
  payload: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
}) {
  const url = (payload.url as string | undefined) ?? '';
  const isPrivateUrl = /^https?:\/\/(127\.|localhost|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(url);
  const isHttp = /^http:\/\//i.test(url);
  return (
    <>
      <Form.Item
        label="网址"
        required
        extra="必须是公网 https 地址（不能是局域网 IP / 127.0.0.1）"
        validateStatus={isPrivateUrl || isHttp ? 'warning' : undefined}
        help={isPrivateUrl ? '⚠ 检测到局域网 IP，可能调不通' : isHttp ? '⚠ 建议使用 https' : undefined}
      >
        <Input value={url} onChange={(e) => set('url', e.target.value)} placeholder="https://example.com/hook" />
      </Form.Item>
      <Form.Item label="请求方式">
        <Radio.Group value={(payload.method as string | undefined) ?? 'POST'} onChange={(e) => set('method', e.target.value)}>
          <Radio.Button value="POST">POST</Radio.Button>
          <Radio.Button value="GET">GET</Radio.Button>
          <Radio.Button value="PUT">PUT</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item label="请求头（JSON 格式）">
        <Input.TextArea
          rows={2}
          value={JSON.stringify(payload.headers ?? {}, null, 2)}
          onChange={(e) => {
            try {
              set('headers', JSON.parse(e.target.value || '{}'));
            } catch {
              /* ignore */
            }
          }}
        />
      </Form.Item>
      <Form.Item label="请求内容模板" extra="可引用：${1} ${2}（设备消息中抓出来的内容）/ ${trigger_name}（触发器名）/ ${fired_at}（触发时间）">
        <Input.TextArea
          rows={4}
          value={(payload.body as string | undefined) ?? ''}
          onChange={(e) => set('body', e.target.value)}
        />
      </Form.Item>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button size="small" onClick={() => set('body', `${payload.body ?? ''}$\{1}`)}>
          + ${'{1}'}
        </Button>
        <Button size="small" onClick={() => set('body', `${payload.body ?? ''}$\{2}`)}>
          + ${'{2}'}
        </Button>
        <Button size="small" onClick={() => set('body', `${payload.body ?? ''}$\{trigger_name}`)}>
          + 触发器名
        </Button>
        <Button size="small" onClick={() => set('body', `${payload.body ?? ''}$\{fired_at}`)}>
          + 触发时刻
        </Button>
      </Space>
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--ant-color-text-tertiary)' }}>
          高级（签名校验）
        </summary>
        <Form.Item label="签名密钥名称" extra="留空表示不签名" style={{ marginTop: 12 }}>
          <Input
            value={(payload.hmac_secret_ref as string | undefined) ?? ''}
            onChange={(e) => set('hmac_secret_ref', e.target.value)}
            placeholder="如 webhook_signing_key"
          />
        </Form.Item>
      </details>
    </>
  );
}

/* ==================== Conflict Alert ==================== */

function ConflictAlert({ report, onClose }: { report: ConflictReport; onClose: () => void }) {
  // P8b：gen ConflictReport.resource 是可选（后端 domain 不返回）；admin 设
  // setConflict 时本应回填 resource。fallback 到 '资源' 描述以防万一。
  const resource = report.resource;
  const kindLabel = resource ? (RESOURCE_KIND_LABEL[resource.kind] ?? resource.kind) : '资源';
  const identifier = resource?.identifier ?? '';
  return (
    <Alert
      type="error"
      showIcon
      closable
      onClose={onClose}
      style={{ marginTop: 16 }}
      message={`⚠ 这个${kindLabel}（${identifier}）被占用了，没法保存`}
      description={
        <div>
          {report.internal_owner && (
            <div style={{ marginBottom: 8 }}>
              <strong>被另一个触发器占了：</strong>
              <div style={{ marginTop: 4 }}>
                {report.internal_owner.trigger_name ?? `trigger #${report.internal_owner.trigger_id}`}
                {' '}
                <Button size="small" type="link">→ 去删那个触发器</Button>
              </div>
            </div>
          )}
          {report.external_procs && report.external_procs.length > 0 && (
            <div>
              <strong>被操作系统其他程序占了：</strong>
              <ul style={{ marginTop: 4, marginBottom: 0 }}>
                {report.external_procs.map((p) => (
                  <li key={p.pid}>
                    {p.name} · pid={p.pid}
                    {p.user && ` · 用户=${p.user}`}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginTop: 4 }}>
                需要登录展厅机器关掉这些程序
              </p>
            </div>
          )}
        </div>
      }
    />
  );
}

// touch device API to keep deviceV2Api side-effect import (used elsewhere)
void deviceV2Api;
