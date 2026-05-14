import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useBlocker,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Radio,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { commandApi } from '@/api/command';
import { contentApi } from '@/api/content';
import { deviceDebugApi } from '@/api/deviceDebug';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import {
  triggerApi,
  type DeviceEventBindingDTO,
  type DeviceEventBindingInput,
} from '@/api/triggers';
import type { TriggerAction } from '@/types/deviceConnector';
import { useMessage } from '@/hooks/useMessage';
import ActionStepListEditor from '@/pages/_shared/runbook/ActionStepListEditor';
import {
  CONTENT_INTENT_META,
  type ActionStep,
  type ContentIntent,
} from '@/pages/_shared/runbook/types';
import ContentPicker, {
  type ContentPickerMode,
} from '@/pages/panel/components/ContentPicker';

type EventType = 'A' | 'B';
type BindingMap = Map<string, TriggerAction | null>;

interface MatrixRow {
  eventIndex: number;
  displayIndex: number;
  label: string;
}

interface EditorTarget {
  eventIndex: number;
  eventType: EventType;
}

const EVENT_TYPES: EventType[] = ['A', 'B'];

export default function TriggerEventBindingMatrixPage() {
  const params = useParams<{ hallId: string; deviceId: string }>();
  const hallId = Number(params.hallId);
  const deviceId = Number(params.deviceId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = useMessage();

  const [baseOverride, setBaseOverride] = useState<BindingMap | null>(null);
  const [edits, setEdits] = useState<BindingMap>(() => new Map());
  const [editorOpen, setEditorOpen] = useState<EditorTarget | null>(null);
  const [pickerState, setPickerState] = useState<{
    open: boolean;
    mode: ContentPickerMode;
    exhibitId: number;
    currentContentId: number | null;
    resolve: ((id: number | null) => void) | null;
  } | null>(null);

  const bundleQuery = useQuery({
    queryKey: ['device-debug-bundle', deviceId],
    queryFn: () => deviceDebugApi.bundle(deviceId),
    select: (res) => res.data.data,
    enabled: Number.isFinite(deviceId) && deviceId > 0,
  });

  const bindingQuery = useQuery({
    queryKey: ['device-event-bindings', deviceId],
    queryFn: () => triggerApi.listDeviceEventBindings(deviceId),
    select: (res) => res.data.data?.list ?? [],
    enabled: Number.isFinite(deviceId) && deviceId > 0,
  });

  const devicesQuery = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: hallId }),
    select: (res) => res.data.data ?? [],
    enabled: Number.isFinite(hallId) && hallId > 0,
  });

  const exhibitsQuery = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data ?? [],
    enabled: Number.isFinite(hallId) && hallId > 0,
  });

  const scenesQuery = useQuery({
    queryKey: queryKeys.scenes(hallId),
    queryFn: () => commandApi.getScenes(hallId),
    select: (res) => res.data.data ?? [],
    enabled: Number.isFinite(hallId) && hallId > 0,
  });

  const loadedBindings = useMemo(
    () => bindingsFromDTO(bindingQuery.data ?? []),
    [bindingQuery.data],
  );
  const originalBindings = baseOverride ?? loadedBindings;
  const bindings = useMemo(
    () => mergeBindingMaps(originalBindings, edits),
    [originalBindings, edits],
  );

  const sceneNameById = useMemo(
    () => new Map((scenesQuery.data ?? []).map((s) => [s.id, s.name])),
    [scenesQuery.data],
  );
  const deviceNameById = useMemo(
    () => new Map((devicesQuery.data ?? []).map((d) => [d.id, d.name])),
    [devicesQuery.data],
  );
  const exhibitNameById = useMemo(
    () => new Map((exhibitsQuery.data ?? []).map((e) => [e.id, e.name])),
    [exhibitsQuery.data],
  );

  const contentIds = useMemo(() => collectContentIds(bindings), [bindings]);
  const contentQueries = useQueries({
    queries: contentIds.map((id) => ({
      queryKey: queryKeys.contentDetail(id),
      queryFn: () => contentApi.getContent(id),
      select: (res: Awaited<ReturnType<typeof contentApi.getContent>>) => res.data.data,
      enabled: id > 0,
    })),
  });
  const contentNameById = useMemo(() => {
    const map = new Map<number, string>();
    contentQueries.forEach((q) => {
      if (q.data?.id) map.set(q.data.id, q.data.name);
    });
    return map;
  }, [contentQueries]);

  const baseChannel = bundleQuery.data?.base_channel ?? 0;
  const cascadeUnits = bundleQuery.data?.cascade_units ?? 1;
  const availableEventCount = Math.max(baseChannel * cascadeUnits, 0);
  const maxEventIndex = availableEventCount - 1;
  const outOfRangeBindings = useMemo(
    () => Array.from(bindings.entries()).filter(([key, action]) => {
      if (!action) return false;
      const eventIndex = readBindingEventIndex(key);
      return eventIndex !== null && eventIndex > maxEventIndex;
    }),
    [bindings, maxEventIndex],
  );
  const maxOutOfRangeDisplayIndex = useMemo(
    () => outOfRangeBindings.reduce((max, [key]) => {
      const eventIndex = readBindingEventIndex(key);
      return eventIndex === null ? max : Math.max(max, eventIndex + 1);
    }, 0),
    [outOfRangeBindings],
  );
  const requiredCascadeUnits = baseChannel > 0
    ? Math.ceil(maxOutOfRangeDisplayIndex / baseChannel)
    : cascadeUnits;

  const rows: MatrixRow[] = useMemo(() => {
    const channelMap = bundleQuery.data?.device.channel_map ?? [];
    return Array.from({ length: availableEventCount }, (_, eventIndex) => {
      const displayIndex = eventIndex + 1;
      return {
        eventIndex,
        displayIndex,
        label: channelMap.find((m) => m.index === displayIndex)?.label ?? '(未标注)',
      };
    });
  }, [availableEventCount, bundleQuery.data?.device.channel_map]);

  const dirtyCount = useMemo(
    () => countChangedBindings(bindings, originalBindings),
    [bindings, originalBindings],
  );
  const isDirty = dirtyCount > 0;

  const saveMutation = useMutation({
    mutationFn: () => triggerApi.replaceDeviceEventBindings(deviceId, bindingsToInput(bindings)),
    onSuccess: (res) => {
      const next = bindingsFromDTO(res.data.data?.list ?? []);
      setBaseOverride(cloneBindingMap(next));
      setEdits(new Map());
      queryClient.invalidateQueries({ queryKey: ['device-event-bindings', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['triggers'] });
      message.success('设备消息触发器已保存');
    },
    onError: () => {
      message.error('保存失败，当前页面改动已保留，请稍后重试');
    },
  });

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!isDirty) return false;
    return currentLocation.pathname !== nextLocation.pathname;
  });
  const blockerHandledRef = useRef(false);
  useEffect(() => {
    if (blocker.state === 'blocked' && !blockerHandledRef.current) {
      blockerHandledRef.current = true;
      modal.confirm({
        title: '未保存改动，确认离开？',
        content: '离开后，矩阵里还没保存的动作会丢失。',
        okText: '离开',
        okButtonProps: { danger: true },
        cancelText: '留下继续编辑',
        onOk: () => {
          blockerHandledRef.current = false;
          blocker.proceed();
        },
        onCancel: () => {
          blockerHandledRef.current = false;
          blocker.reset();
        },
      });
    }
    if (blocker.state === 'unblocked') blockerHandledRef.current = false;
  }, [blocker, blocker.state, modal]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function openEditor(eventIndex: number, eventType: EventType) {
    setEditorOpen({ eventIndex, eventType });
  }

  function handleBack() {
    navigate(`/halls/${hallId}/triggers`);
  }

  function openContentPicker(
    mode: 'play_video' | 'show_screen_image',
    exhibitId: number,
    currentContentId: number | null,
  ) {
    return new Promise<number | null>((resolve) => {
      setPickerState({
        open: true,
        mode,
        exhibitId,
        currentContentId,
        resolve,
      });
    });
  }

  const columns: TableColumnsType<MatrixRow> = [
    {
      title: '序号',
      dataIndex: 'displayIndex',
      width: 80,
      fixed: 'left',
    },
    {
      title: '标注',
      dataIndex: 'label',
      width: 220,
      render: (label: string) => (
        <span style={{ color: label === '(未标注)' ? 'var(--ant-color-text-tertiary)' : undefined }}>
          {label}
        </span>
      ),
    },
    ...EVENT_TYPES.map((eventType) => ({
      title: `${eventType} 键动作`,
      dataIndex: eventType,
      render: (_: unknown, row: MatrixRow) => (
        <ActionCell
          action={bindings.get(bindingKey(row.eventIndex, eventType)) ?? null}
          eventType={eventType}
          sceneNameById={sceneNameById}
          deviceNameById={deviceNameById}
          contentNameById={contentNameById}
          onClick={() => openEditor(row.eventIndex, eventType)}
        />
      ),
    })),
  ];

  if (!Number.isFinite(hallId) || !Number.isFinite(deviceId)) {
    return <Empty description="路径参数缺失" style={{ padding: '120px 0' }} />;
  }

  if (bundleQuery.isLoading || bindingQuery.isLoading) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (bundleQuery.error || !bundleQuery.data) {
    return (
      <div style={{ padding: 40 }}>
        <Alert type="error" showIcon message="设备加载失败" description={String(bundleQuery.error ?? '')} />
      </div>
    );
  }

  const bundle = bundleQuery.data;
  const device = bundle.device;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            设备消息触发器 · {device.name}
          </Typography.Title>
          <PageHeader description="按设备接收点批量配置 A / B 键动作，适合激光笔等多点触发设备。" />
        </div>
        <Space wrap>
          {isDirty && <Tag color="warning">⚠ {dirtyCount} 条未保存改动</Tag>}
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回触发器列表
          </Button>
          <Button
            icon={<SaveOutlined />}
            type="primary"
            disabled={!isDirty}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            保存全部
          </Button>
          <Button
            icon={<UndoOutlined />}
            disabled={!isDirty}
            onClick={() => setEdits(new Map())}
          >
            放弃改动
          </Button>
        </Space>
      </div>

      {outOfRangeBindings.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={`检测到 ${outOfRangeBindings.length} 条越界配置`}
          description={
            `当前联级 ${cascadeUnits} 台 × ${baseChannel} 路 = ${availableEventCount} 个可用接收点；` +
            `序号超过 ${availableEventCount} 的配置（如 #${maxOutOfRangeDisplayIndex}）已停用但未删除。` +
            `把联级改回 ${requiredCascadeUnits} 台或更多即可重新生效。`
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Space wrap>
          <strong>{device.name}</strong>
          <span style={{ color: 'var(--ant-color-text-secondary)' }}>
            联级 {cascadeUnits} 台 · 共 {baseChannel} × {cascadeUnits} = {availableEventCount} 个接收点
          </span>
        </Space>
      </Card>

      <Card title="接收点矩阵" style={{ borderRadius: 8 }}>
        <Table
          rowKey="eventIndex"
          columns={columns}
          dataSource={rows}
          pagination={false}
          size="middle"
          scroll={{ x: 900 }}
        />
      </Card>

      <BindingEditorDrawer
        key={editorOpen ? bindingKey(editorOpen.eventIndex, editorOpen.eventType) : 'closed'}
        open={!!editorOpen}
        title={editorOpen ? drawerTitle(editorOpen, rows) : undefined}
        action={editorOpen ? bindings.get(bindingKey(editorOpen.eventIndex, editorOpen.eventType)) ?? null : null}
        hallId={hallId}
        devices={(devicesQuery.data ?? []).map((d) => ({ id: d.id, name: d.name }))}
        exhibits={(exhibitsQuery.data ?? []).map((e) => ({ id: e.id, name: e.name }))}
        scenes={(scenesQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
        onSelectContent={openContentPicker}
        onCancel={() => setEditorOpen(null)}
        onSave={(action) => {
          if (!editorOpen) return;
          const key = bindingKey(editorOpen.eventIndex, editorOpen.eventType);
          setEdits((prev) => {
            const next = cloneBindingMap(prev);
            next.set(key, action);
            return next;
          });
          setEditorOpen(null);
        }}
      />

      {pickerState && (
        <ContentPicker
          open={pickerState.open}
          mode={pickerState.mode}
          hallId={hallId}
          exhibitId={pickerState.exhibitId}
          exhibitName={exhibitNameById.get(pickerState.exhibitId)}
          currentContentId={pickerState.currentContentId}
          onSelect={(id) => {
            pickerState.resolve?.(id);
            setPickerState(null);
          }}
          onCancel={() => {
            pickerState.resolve?.(null);
            setPickerState(null);
          }}
        />
      )}
    </div>
  );
}

function ActionCell({
  action,
  eventType,
  sceneNameById,
  deviceNameById,
  contentNameById,
  onClick,
}: {
  action: TriggerAction | null;
  eventType: EventType;
  sceneNameById: Map<number, string>;
  deviceNameById: Map<number, string>;
  contentNameById: Map<number, string>;
  onClick: () => void;
}) {
  if (!action) {
    return (
      <Button type="link" onClick={onClick} style={{ paddingInline: 0, color: 'var(--ant-color-text-tertiary)' }}>
        + 添加 {eventType} 动作
      </Button>
    );
  }
  return (
    <Button type="link" onClick={onClick} style={{ paddingInline: 0 }}>
      {summarizeAction(action, sceneNameById, deviceNameById, contentNameById)}
    </Button>
  );
}

function BindingEditorDrawer({
  open,
  title,
  action,
  hallId,
  devices,
  exhibits,
  scenes,
  onSelectContent,
  onCancel,
  onSave,
}: {
  open: boolean;
  title?: string;
  action: TriggerAction | null;
  hallId: number;
  devices: { id: number; name: string }[];
  exhibits: { id: number; name: string }[];
  scenes: { id: number; name: string }[];
  onSelectContent: (
    intent: 'play_video' | 'show_screen_image',
    exhibitId: number,
    currentContentId: number | null,
  ) => Promise<number | null>;
  onCancel: () => void;
  onSave: (action: TriggerAction | null) => void;
}) {
  const { message } = useMessage();
  const [draftMode, setDraftMode] = useState<'scene' | 'step'>(
    action?.kind === 'scene' ? 'scene' : 'step',
  );
  const [draftSceneId, setDraftSceneId] = useState<number | null>(
    action?.kind === 'scene' ? readNumber(action.payload.scene_id) : null,
  );
  const initialStep = triggerActionToStep(action);
  const [draftSteps, setDraftSteps] = useState<ActionStep[]>(
    initialStep ? [initialStep] : [],
  );

  function handleSave() {
    if (draftMode === 'scene') {
      if (!draftSceneId) {
        message.error('请先选择要切换的场景');
        return;
      }
      onSave({ kind: 'scene', payload: { scene_id: draftSceneId } });
      return;
    }
    if (draftSteps.length === 0) {
      onSave(null);
      return;
    }
    const next = stepToTriggerAction(draftSteps[0]);
    if (!next) {
      message.error('请把动作填写完整，或删除这一步');
      return;
    }
    onSave(next);
  }

  return (
    <Drawer
      open={open}
      title={title}
      width={760}
      destroyOnClose
      onClose={onCancel}
      extra={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存到内存
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Radio.Group
          value={draftMode}
          onChange={(e) => {
            const next = e.target.value as 'scene' | 'step';
            setDraftMode(next);
            if (next === 'scene') {
              setDraftSteps([]);
            } else {
              setDraftSceneId(null);
            }
          }}
        >
          <Radio.Button value="step">设备 / 内容动作</Radio.Button>
          <Radio.Button value="scene">切场景</Radio.Button>
        </Radio.Group>

        {draftMode === 'scene' ? (
          <Select
            value={draftSceneId ?? undefined}
            onChange={setDraftSceneId}
            placeholder="选择要切换的场景"
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            options={scenes.map((scene) => ({
              value: scene.id,
              label: scene.name,
            }))}
          />
        ) : (
          <ActionStepListEditor
            value={draftSteps}
            onChange={(next) => setDraftSteps(next.slice(0, 1))}
            hallId={hallId}
            devices={devices}
            exhibits={exhibits}
            scenes={scenes}
            onSelectContent={onSelectContent}
            maxSteps={1}
          />
        )}
      </Space>
    </Drawer>
  );
}

function summarizeAction(
  action: TriggerAction,
  sceneNameById: Map<number, string>,
  deviceNameById: Map<number, string>,
  contentNameById: Map<number, string>,
) {
  const payload = action.payload ?? {};
  if (action.kind === 'scene') {
    const sceneId = readNumber(payload.scene_id);
    return `切场景：${sceneId ? sceneNameById.get(sceneId) ?? `场景 ${sceneId}` : '未选择场景'}`;
  }
  if (action.kind === 'command') {
    const deviceId = readNumber(payload.device_id);
    const deviceName = deviceId ? deviceNameById.get(deviceId) ?? `设备 ${deviceId}` : '未选择设备';
    return `设备命令：${deviceName} - ${String(payload.command_code ?? '未选择命令')}`;
  }
  if (action.kind === 'media') {
    const contentId = readNumber(payload.content_id) ?? readNumber(payload.media_id);
    return `播视频：${contentId ? contentNameById.get(contentId) ?? `内容 ${contentId}` : '未选择内容'}`;
  }
  if (action.kind === 'query') {
    const deviceId = readNumber(payload.device_id);
    return `查询设备：${deviceId ? deviceNameById.get(deviceId) ?? `设备 ${deviceId}` : '未选择设备'}`;
  }
  return '调用网址';
}

function drawerTitle(target: EditorTarget, rows: MatrixRow[]) {
  const row = rows.find((r) => r.eventIndex === target.eventIndex);
  return `编辑：第 ${row?.displayIndex ?? target.eventIndex + 1} 路 · ${row?.label ?? '(未标注)'} · ${target.eventType} 键`;
}

function bindingKey(eventIndex: number, eventType: EventType) {
  return `${eventIndex}:${eventType}`;
}

function readBindingEventIndex(key: string): number | null {
  const [eventIndexRaw] = key.split(':');
  const eventIndex = Number.parseInt(eventIndexRaw, 10);
  return Number.isFinite(eventIndex) ? eventIndex : null;
}

function bindingsFromDTO(list: DeviceEventBindingDTO[]): BindingMap {
  const map: BindingMap = new Map();
  for (const item of list) {
    if (!isEventType(item.event_type)) continue;
    map.set(bindingKey(item.event_index, item.event_type), cloneAction(item.action));
  }
  return map;
}

function bindingsToInput(map: BindingMap): DeviceEventBindingInput[] {
  const out: DeviceEventBindingInput[] = [];
  for (const [key, action] of map.entries()) {
    if (!action) continue;
    const [eventIndexRaw, eventTypeRaw] = key.split(':');
    if (!isEventType(eventTypeRaw)) continue;
    out.push({
      event_index: Number(eventIndexRaw),
      event_type: eventTypeRaw,
      enabled: true,
      action: cloneAction(action),
    });
  }
  return out;
}

function triggerActionToStep(action: TriggerAction | null): ActionStep | null {
  if (!action) return null;
  const payload = action.payload ?? {};
  if (action.kind === 'command' || action.kind === 'query') {
    return {
      type: 'device',
      delay_seconds_after_prev_start: 0,
      device_id: readNumber(payload.device_id),
      command: typeof payload.command_code === 'string' ? payload.command_code : null,
      params: isRecord(payload.params) ? payload.params : null,
      preconditions: null,
      friendly_description: null,
    };
  }
  if (action.kind === 'media') {
    const contentId = readNumber(payload.content_id) ?? readNumber(payload.media_id);
    const intent = typeof payload.action === 'string' && isContentIntent(payload.action)
      ? payload.action
      : 'play_video';
    return {
      type: 'content',
      delay_seconds_after_prev_start: 0,
      exhibit_id: readNumber(payload.exhibit_id),
      content_intent: intent,
      content_params: contentId ? { content_id: contentId } : {},
      preconditions: null,
      friendly_description: null,
    };
  }
  return null;
}

function stepToTriggerAction(step: ActionStep): TriggerAction | null {
  if (step.type === 'device') {
    if (!step.device_id || !step.command) return null;
    return {
      kind: 'command',
      payload: {
        device_id: step.device_id,
        command_code: step.command,
        params: step.params ?? {},
      },
    };
  }
  if (!step.exhibit_id || !step.content_intent) return null;
  const contentId = readNumber(step.content_params?.content_id);
  if ((step.content_intent === 'play_video' || step.content_intent === 'show_screen_image') && !contentId) {
    return null;
  }
  return {
    kind: 'media',
    payload: {
      action: step.content_intent,
      exhibit_id: step.exhibit_id,
      ...(contentId ? { content_id: contentId } : {}),
    },
  };
}

function countChangedBindings(a: BindingMap, b: BindingMap) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let count = 0;
  for (const key of keys) {
    const left = a.get(key) ?? null;
    const right = b.get(key) ?? null;
    if (JSON.stringify(left) !== JSON.stringify(right)) count += 1;
  }
  return count;
}

function cloneBindingMap(map: BindingMap): BindingMap {
  const next: BindingMap = new Map();
  for (const [key, action] of map.entries()) {
    next.set(key, action ? cloneAction(action) : null);
  }
  return next;
}

function mergeBindingMaps(base: BindingMap, edits: BindingMap): BindingMap {
  const next = cloneBindingMap(base);
  for (const [key, action] of edits.entries()) {
    next.set(key, action ? cloneAction(action) : null);
  }
  return next;
}

function cloneAction(action: TriggerAction): TriggerAction {
  return JSON.parse(JSON.stringify(action)) as TriggerAction;
}

function collectContentIds(map: BindingMap) {
  const out = new Set<number>();
  for (const action of map.values()) {
    if (!action || action.kind !== 'media') continue;
    const id = readNumber(action.payload.content_id) ?? readNumber(action.payload.media_id);
    if (id) out.add(id);
  }
  return Array.from(out);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEventType(value: string): value is EventType {
  return value === 'A' || value === 'B';
}

function isContentIntent(value: string): value is ContentIntent {
  return CONTENT_INTENT_META.some((meta) => meta.value === value);
}
