/**
 * ActionStepListEditor — ADR-0020 ActionStep 数组编辑器（场景 + 设备命令按钮共用）。
 *
 * 一个 ActionStep 可以是 device 指令（device_id + command + params）或 content 播控指令
 * （exhibit_id + command + params + 可选 display_id）。两类共享 sort_order /
 * delay_from_start_ms / preconditions / precondition_block。
 *
 * 数据流：受控组件，父组件传 value + onChange；本组件不发请求（device/exhibit 列表父组件传入）。
 * 仅在 device 行内部按 device_id 拉 effective-commands（沿用 SceneActionRow 模式）。
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Empty,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import WidgetRenderer from '@/components/device-catalog/WidgetRenderer';
import type {
  ActionStep,
  ActionStepPrecondition,
  DeviceListItem,
  EffectiveCommand,
  ExhibitListItem,
} from '@/api/gen/client';
import type { ParamsSchemaProperty } from '@/types/deviceCatalog';

interface ParamsSchemaShape {
  type?: 'object';
  required?: string[];
  properties?: Record<string, ParamsSchemaProperty>;
}

interface Props {
  value: ActionStep[];
  onChange: (next: ActionStep[]) => void;
  devices: DeviceListItem[];
  exhibits: ExhibitListItem[];
}

/** 展项播控白名单（content 类型时下拉选择）；shape 由后端 ExhibitCommand 决定 */
const CONTENT_COMMANDS: { value: string; label: string; group: string }[] = [
  { value: 'play', label: '播放', group: '基础播控' },
  { value: 'pause', label: '暂停', group: '基础播控' },
  { value: 'resume', label: '继续', group: '基础播控' },
  { value: 'stop', label: '停止', group: '基础播控' },
  { value: 'seek', label: '跳转', group: '基础播控' },
  { value: 'set_volume', label: '设置音量', group: '音频' },
  { value: 'mute', label: '静音', group: '音频' },
  { value: 'unmute', label: '取消静音', group: '音频' },
  { value: 'set_loop', label: '设置循环', group: '基础播控' },
  { value: 'overlay_image', label: '叠加图片', group: '图层' },
  { value: 'overlay_clear', label: '清除叠加', group: '图层' },
  { value: 'slideshow_start', label: '幻灯开始', group: '幻灯' },
  { value: 'slideshow_goto', label: '幻灯跳页', group: '幻灯' },
  { value: 'slideshow_stop', label: '幻灯结束', group: '幻灯' },
  { value: 'nav_start', label: '导航开始', group: '触控导航' },
  { value: 'nav_stop', label: '导航结束', group: '触控导航' },
];

const PRECOND_KIND_LABEL: Record<ActionStepPrecondition['kind'], string> = {
  exhibit_app_online: '展项 App 在线',
  device_online: '设备在线',
  hall_master_ready: 'hall_master 已选举',
  scene_state: '当前场景为',
  action_done: '已完成步骤',
};

export default function ActionStepListEditor({ value, onChange, devices, exhibits }: Props) {
  const steps = value;

  const update = (idx: number, patch: Partial<ActionStep>) => {
    const next = steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(steps.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...steps];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    // 重排后刷 sort_order，保持显式
    next.forEach((s, i) => (s.sort_order = i));
    onChange(next);
  };

  const append = () => {
    const prev = steps[steps.length - 1];
    const newStep: ActionStep = {
      type: 'device',
      command: '',
      params: {},
      sort_order: steps.length,
      delay_from_start_ms: prev?.delay_from_start_ms ?? 0,
      precondition_block: false,
    };
    onChange([...steps, newStep]);
  };

  return (
    <div>
      {steps.length === 0 ? (
        <Empty description="暂无 step；点下方「添加 step」开始配置" style={{ padding: 16 }} />
      ) : (
        steps.map((step, idx) => (
          <ActionStepRow
            key={idx}
            index={idx}
            total={steps.length}
            step={step}
            devices={devices}
            exhibits={exhibits}
            onChange={(p) => update(idx, p)}
            onRemove={() => remove(idx)}
            onMoveUp={() => move(idx, -1)}
            onMoveDown={() => move(idx, 1)}
          />
        ))
      )}

      <Button type="dashed" block icon={<PlusCircleOutlined />} onClick={append}>
        添加 step
      </Button>
    </div>
  );
}

/* ============================================================
 * 单 step 行（内部组件）
 * ============================================================ */

interface RowProps {
  index: number;
  total: number;
  step: ActionStep;
  devices: DeviceListItem[];
  exhibits: ExhibitListItem[];
  onChange: (patch: Partial<ActionStep>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ActionStepRow({
  index,
  total,
  step,
  devices,
  exhibits,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: RowProps) {
  const stepType: 'device' | 'content' = step.type ?? 'device';
  const [precondModalOpen, setPrecondModalOpen] = useState(false);

  const deviceOptions = useMemo(
    () => devices.map((d) => ({ value: d.id, label: d.name })),
    [devices],
  );
  const exhibitOptions = useMemo(
    () => exhibits.map((e) => ({ value: e.id, label: e.name })),
    [exhibits],
  );

  // device 类型：拉该设备的 effective commands
  const { data: commands } = useQuery({
    queryKey: queryKeys.effectiveCommands(step.device_id ?? 0),
    queryFn: () => hallApi.getEffectiveCommands(step.device_id as number),
    select: (res) => res.data.data,
    enabled: stepType === 'device' && !!step.device_id && step.device_id > 0,
  });

  const selectedCommand = useMemo(
    () => (commands ?? []).find((c) => c.code === step.command),
    [commands, step.command],
  );

  const isDirtyCommand =
    stepType === 'device' &&
    !!step.command &&
    !!commands &&
    commands.length > 0 &&
    !selectedCommand;

  const deviceCommandGroups = useMemo(() => {
    const list = commands ?? [];
    const byCategory = new Map<string, EffectiveCommand[]>();
    for (const c of list) {
      const key = c.category || '其他';
      const arr = byCategory.get(key) ?? [];
      arr.push(c);
      byCategory.set(key, arr);
    }
    const groups = Array.from(byCategory.entries()).map(([cat, cmds]) => ({
      label: cat,
      options: cmds.map((c) => ({
        value: c.code,
        label: (
          <span>
            {c.icon && (
              <span
                style={{
                  color: 'var(--ant-color-text-tertiary)',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  marginRight: 6,
                }}
              >
                [{c.icon}]
              </span>
            )}
            {c.name}
            <span
              style={{
                color: 'var(--ant-color-text-quaternary)',
                marginLeft: 6,
                fontSize: 11,
              }}
            >
              {c.code}
            </span>
          </span>
        ),
      })),
    }));
    if (isDirtyCommand) {
      groups.unshift({
        label: '已失效',
        options: [
          {
            value: step.command,
            label: (
              <span style={{ color: 'var(--ant-color-error)' }}>
                ⚠ {step.command}（命令不存在）
              </span>
            ),
          },
        ],
      });
    }
    return groups;
  }, [commands, isDirtyCommand, step.command]);

  const contentCommandGroups = useMemo(() => {
    const byGroup = new Map<string, typeof CONTENT_COMMANDS>();
    for (const c of CONTENT_COMMANDS) {
      const arr = byGroup.get(c.group) ?? [];
      arr.push(c);
      byGroup.set(c.group, arr);
    }
    return Array.from(byGroup.entries()).map(([g, cmds]) => ({
      label: g,
      options: cmds.map((c) => ({
        value: c.value,
        label: (
          <span>
            {c.label}
            <span
              style={{
                color: 'var(--ant-color-text-quaternary)',
                marginLeft: 6,
                fontSize: 11,
              }}
            >
              {c.value}
            </span>
          </span>
        ),
      })),
    }));
  }, []);

  const paramsSchema = (selectedCommand?.params_schema ?? null) as unknown as ParamsSchemaShape | null;
  const paramsProps = paramsSchema?.properties ?? {};
  const paramsKeys = Object.keys(paramsProps);
  const paramsValue = (step.params ?? {}) as Record<string, unknown>;

  const handleTypeChange = (val: 'device' | 'content') => {
    // 切换类型清空目标 / 命令 / 参数（避免脏数据）
    onChange({
      type: val,
      device_id: val === 'device' ? step.device_id : null,
      exhibit_id: val === 'content' ? step.exhibit_id : null,
      display_id: val === 'content' ? step.display_id : null,
      command: '',
      params: {},
    });
  };

  const precondCount = (step.preconditions ?? []).length;

  return (
    <Card
      size="small"
      style={{ marginBottom: 10 }}
      title={
        <Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Step {index + 1}
          </Typography.Text>
          <Segmented
            size="small"
            value={stepType}
            onChange={(v) => handleTypeChange(v as 'device' | 'content')}
            options={[
              { label: '设备指令', value: 'device' },
              { label: '展项播控', value: 'content' },
            ]}
          />
        </Space>
      }
      extra={
        <Space size={2}>
          <Tooltip title="上移">
            <Button
              size="small"
              type="text"
              icon={<ArrowUpOutlined />}
              disabled={index === 0}
              onClick={onMoveUp}
            />
          </Tooltip>
          <Tooltip title="下移">
            <Button
              size="small"
              type="text"
              icon={<ArrowDownOutlined />}
              disabled={index === total - 1}
              onClick={onMoveDown}
            />
          </Tooltip>
          <Tooltip title="删除 step">
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={onRemove}
            />
          </Tooltip>
        </Space>
      }
    >
      {/* —— 目标 + 命令 —— */}
      <Space wrap style={{ width: '100%' }}>
        {stepType === 'device' ? (
          <Select
            style={{ width: 220 }}
            placeholder="选择设备"
            value={step.device_id || undefined}
            onChange={(v) => onChange({ device_id: v as number, command: '', params: {} })}
            options={deviceOptions}
            showSearch
            optionFilterProp="label"
          />
        ) : (
          <>
            <Select
              style={{ width: 220 }}
              placeholder="选择展项"
              value={step.exhibit_id || undefined}
              onChange={(v) => onChange({ exhibit_id: v as number })}
              options={exhibitOptions}
              showSearch
              optionFilterProp="label"
            />
            <InputNumber
              style={{ width: 120 }}
              min={1}
              placeholder="display_id（可选）"
              value={step.display_id ?? undefined}
              onChange={(v) => onChange({ display_id: (v as number) ?? null })}
            />
          </>
        )}

        {stepType === 'device' ? (
          <Select
            style={{ width: 260 }}
            placeholder={step.device_id ? '选择命令' : '先选设备'}
            value={step.command || undefined}
            onChange={(v) => onChange({ command: v as string, params: {} })}
            options={deviceCommandGroups}
            disabled={!step.device_id}
            showSearch
            optionFilterProp="value"
            popupMatchSelectWidth={320}
          />
        ) : (
          <Select
            style={{ width: 260 }}
            placeholder="选择播控命令"
            value={step.command || undefined}
            onChange={(v) => onChange({ command: v as string, params: {} })}
            options={contentCommandGroups}
            showSearch
            optionFilterProp="value"
            popupMatchSelectWidth={300}
          />
        )}

        {stepType === 'device' && selectedCommand && (
          <Tag color={sourceColor(selectedCommand.source)}>{selectedCommand.source}</Tag>
        )}
      </Space>

      {isDirtyCommand && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 8 }}
          message="该命令不存在，请重新选择"
        />
      )}

      {/* —— 参数 —— */}
      {stepType === 'device' && step.command && !isDirtyCommand && (
        <div style={{ marginTop: 8 }}>
          {paramsKeys.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 10,
              }}
            >
              {paramsKeys.map((key) => {
                const p = paramsProps[key];
                const required = (paramsSchema?.required ?? []).includes(key);
                return (
                  <div key={key}>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ant-color-text-secondary)',
                        marginBottom: 4,
                      }}
                    >
                      {p.title ?? key}
                      {required && (
                        <span style={{ color: 'var(--ant-color-error)', marginLeft: 4 }}>*</span>
                      )}
                      <span
                        style={{
                          color: 'var(--ant-color-text-tertiary)',
                          marginLeft: 6,
                          fontSize: 11,
                        }}
                      >
                        {key} · {p.type}
                      </span>
                    </div>
                    <WidgetRenderer
                      schema={p}
                      value={paramsValue[key]}
                      onChange={(v) =>
                        onChange({ params: { ...paramsValue, [key]: v } })
                      }
                      size="small"
                    />
                  </div>
                );
              })}
            </div>
          ) : selectedCommand ? (
            <div style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
              该命令无参数
            </div>
          ) : (
            <ParamsJsonInput value={paramsValue} onChange={(v) => onChange({ params: v })} />
          )}
        </div>
      )}

      {stepType === 'content' && step.command && (
        <div style={{ marginTop: 8 }}>
          <ParamsJsonInput value={paramsValue} onChange={(v) => onChange({ params: v })} />
          <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
            常见 shape：
            <code style={{ marginLeft: 4 }}>seek</code> → <code>{`{"position_ms":5000}`}</code>；
            <code>set_volume</code> → <code>{`{"volume":80}`}</code>；
            <code>overlay_image</code> → <code>{`{"url":"...","duration_ms":3000}`}</code>
          </Typography.Text>
        </div>
      )}

      {/* —— 时序 + 前置 —— */}
      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px dashed var(--ant-color-border-secondary)',
        }}
      >
        <Space wrap size="middle">
          <Space size={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              延时（ms）
            </Typography.Text>
            <InputNumber
              size="small"
              min={0}
              step={100}
              style={{ width: 110 }}
              value={step.delay_from_start_ms ?? 0}
              onChange={(v) => onChange({ delay_from_start_ms: (v as number) ?? 0 })}
            />
          </Space>

          <Space size={4}>
            <Button
              size="small"
              icon={precondCount > 0 ? <WarningOutlined /> : <PlusOutlined />}
              onClick={() => setPrecondModalOpen(true)}
            >
              前置 {precondCount > 0 ? `(${precondCount})` : ''}
            </Button>
            {precondCount > 0 && (
              <>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  失败时阻塞
                </Typography.Text>
                <Switch
                  size="small"
                  checked={!!step.precondition_block}
                  onChange={(v) => onChange({ precondition_block: v })}
                />
              </>
            )}
          </Space>
        </Space>
      </div>

      <PreconditionsModal
        open={precondModalOpen}
        onClose={() => setPrecondModalOpen(false)}
        value={step.preconditions ?? []}
        onChange={(v) => onChange({ preconditions: v })}
        devices={devices}
        exhibits={exhibits}
      />
    </Card>
  );
}

/* ============================================================
 * 参数 JSON 输入（自由编辑，校验可解析）
 * ============================================================ */

function ParamsJsonInput({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState<string>(() =>
    Object.keys(value).length === 0 ? '' : JSON.stringify(value),
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Input.TextArea
        rows={2}
        placeholder='参数 JSON，如 {"position_ms":5000}'
        value={draft}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          if (!text.trim()) {
            setError(null);
            onChange({});
            return;
          }
          try {
            const parsed = JSON.parse(text);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              setError('JSON 必须是对象 {...}');
              return;
            }
            setError(null);
            onChange(parsed);
          } catch {
            setError('JSON 无法解析');
          }
        }}
      />
      {error && (
        <Typography.Text type="danger" style={{ fontSize: 11 }}>
          {error}
        </Typography.Text>
      )}
    </div>
  );
}

/* ============================================================
 * 前置检查（preconditions）编辑 Modal
 * ============================================================ */

interface PrecondModalProps {
  open: boolean;
  onClose: () => void;
  value: ActionStepPrecondition[];
  onChange: (v: ActionStepPrecondition[]) => void;
  devices: DeviceListItem[];
  exhibits: ExhibitListItem[];
}

const PRECOND_KIND_OPTIONS: ActionStepPrecondition['kind'][] = [
  'exhibit_app_online',
  'device_online',
  'hall_master_ready',
  'scene_state',
  'action_done',
];

function PreconditionsModal({
  open,
  onClose,
  value,
  onChange,
  devices,
  exhibits,
}: PrecondModalProps) {
  const update = (idx: number, patch: Partial<ActionStepPrecondition>) => {
    const next = value.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  const append = () => {
    onChange([...value, { kind: 'device_online' }]);
  };

  return (
    <Modal
      title="派发前置检查"
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="完成"
      cancelText="取消"
      width={600}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        所有前置满足才派发；任一失败时按外层「失败时阻塞」开关决定整 runbook 失败 / 仅本 step 跳过。
      </Typography.Paragraph>

      {value.length === 0 && (
        <Empty description="暂无前置检查" style={{ padding: 12 }} />
      )}

      {value.map((p, idx) => (
        <Card key={idx} size="small" style={{ marginBottom: 8 }}>
          <Space wrap style={{ width: '100%' }}>
            <Select
              style={{ width: 180 }}
              value={p.kind}
              onChange={(v) =>
                update(idx, {
                  kind: v as ActionStepPrecondition['kind'],
                  // 切换类型清空旧 id 字段
                  exhibit_id: null,
                  device_id: null,
                  scene_id: null,
                  step_id: null,
                })
              }
              options={PRECOND_KIND_OPTIONS.map((k) => ({
                value: k,
                label: PRECOND_KIND_LABEL[k],
              }))}
            />

            {p.kind === 'exhibit_app_online' && (
              <Select
                style={{ width: 220 }}
                placeholder="选择展项"
                value={p.exhibit_id ?? undefined}
                onChange={(v) => update(idx, { exhibit_id: v as number })}
                options={exhibits.map((e) => ({ value: e.id, label: e.name }))}
                showSearch
                optionFilterProp="label"
              />
            )}
            {p.kind === 'device_online' && (
              <Select
                style={{ width: 220 }}
                placeholder="选择设备"
                value={p.device_id ?? undefined}
                onChange={(v) => update(idx, { device_id: v as number })}
                options={devices.map((d) => ({ value: d.id, label: d.name }))}
                showSearch
                optionFilterProp="label"
              />
            )}
            {p.kind === 'scene_state' && (
              <InputNumber
                style={{ width: 160 }}
                min={1}
                placeholder="scene_id"
                value={p.scene_id ?? undefined}
                onChange={(v) => update(idx, { scene_id: (v as number) ?? null })}
              />
            )}
            {p.kind === 'action_done' && (
              <InputNumber
                style={{ width: 160 }}
                min={1}
                placeholder="step_id"
                value={p.step_id ?? undefined}
                onChange={(v) => update(idx, { step_id: (v as number) ?? null })}
              />
            )}
            {p.kind === 'hall_master_ready' && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                无需额外参数
              </Typography.Text>
            )}

            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => remove(idx)}
            />
          </Space>
        </Card>
      ))}

      <Button type="dashed" block icon={<PlusOutlined />} onClick={append}>
        添加前置
      </Button>
    </Modal>
  );
}

function sourceColor(source: EffectiveCommand['source']): string {
  switch (source) {
    case 'baseline':
      return 'blue';
    case 'model':
      return 'geekblue';
    case 'override':
      return 'orange';
    default:
      return 'default';
  }
}
