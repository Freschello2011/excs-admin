/**
 * <ActionStepListEditor> — vertical timeline 容器；管理 ActionStep[] 数组
 *
 * SSOT：admin-UI §4.20.1 行 845 + §4.20.3 视觉规则；mockup M1 line 625-1015
 *
 * 职责：
 *   - 顶级 ActionStep[] 数组管理（增 / 删 / 上下移）
 *   - 渲染 vertical timeline：左侧虚线 + 圆点（橙=device / 蓝=content）+ 步卡
 *   - 每步组合：DelayInput / 类型 chip / 步标题 / 主体（device 或 content 分支）/ PreCondListEditor
 *   - 底部固定 2 个拆分式新增按钮（"+ 设备动作"橙 / "+ 数字内容动作"蓝）
 *   - 422 detail 命中各步字段时打 error 描边
 *
 * 不做：场景编辑页 / device_command 编辑器 host 容器（留 S5-8 / S5-9）；
 *      ContentPicker（play_video / show_screen_image 选 content_id 的 Modal）走
 *      onSelectContent prop 由 host 注入（Phase A 缺省时按钮 disabled，
 *      slideshow_goto 走自带 <SlideshowImagePicker>）。
 */

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Select,
  Slider,
  Tag,
  Tooltip,
  Empty,
  InputNumber,
  Space,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ToolOutlined,
  PlayCircleOutlined,
  TabletOutlined,
  PictureOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import WidgetRenderer from '@/components/device-catalog/WidgetRenderer';
import type { EffectiveCommand } from '@/api/gen/client';
import type { ParamsSchemaProperty } from '@/types/deviceCatalog';
import {
  CONTENT_INTENT_META,
  emptyContentStep,
  emptyDeviceStep,
  type ActionStep,
  type ContentIntent,
} from './types';
import DelayInput from './DelayInput';
import ContentIntentSelect from './ContentIntentSelect';
import PreCondListEditor from './PreCondListEditor';
import SlideshowImagePicker from './SlideshowImagePicker';

interface DeviceLite {
  id: number;
  name: string;
}
interface ExhibitLite {
  id: number;
  name: string;
}
interface SceneLite {
  id: number;
  name: string;
}

interface Props {
  value: ActionStep[];
  onChange: (next: ActionStep[]) => void;
  hallId: number;
  devices: DeviceLite[];
  exhibits: ExhibitLite[];
  scenes: SceneLite[];
  /**
   * 422 detail. key 形如 `0.device_id` / `2.content_intent` / `1.preconditions.0.scene_id`。
   * 见 types.ts ActionStepValidationError。
   */
  errors?: Record<string, string>;
  /**
   * Phase B/C 透传 ContentPicker 打开函数；返回选中 content_id（cancel 返回 null）。
   * Phase A 不传 → 选视频/图按钮 disabled，仅显示当前 content_id。
   */
  onSelectContent?: (
    intent: 'play_video' | 'show_screen_image',
    exhibitId: number,
    currentContentId: number | null,
  ) => Promise<number | null>;
  disabled?: boolean;
  /** 当前正在编辑的步下标；命中时给 .editing 视觉态 */
  editingIndex?: number | null;
  onEditingIndexChange?: (next: number | null) => void;
}

interface ParamsSchemaShape {
  type?: 'object';
  required?: string[];
  properties?: Record<string, ParamsSchemaProperty>;
}

export default function ActionStepListEditor({
  value,
  onChange,
  hallId,
  devices,
  exhibits,
  scenes,
  errors = {},
  onSelectContent,
  disabled,
  editingIndex,
  onEditingIndexChange,
}: Props) {
  function patchAt(index: number, patch: Partial<ActionStep>) {
    onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function removeAt(index: number) {
    const next = value.filter((_, i) => i !== index);
    if (next.length > 0) next[0].delay_seconds_after_prev_start = 0; // Step 0 强制 0
    onChange(next);
  }
  function moveAt(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    next[0] = { ...next[0], delay_seconds_after_prev_start: 0 }; // Step 0 强制 0
    onChange(next);
  }
  function addDevice() {
    onChange([...value, emptyDeviceStep(value.length)]);
  }
  function addContent() {
    onChange([...value, emptyContentStep(value.length)]);
  }

  const stepErrors = useMemo(() => groupErrorsByStep(errors), [errors]);

  return (
    <div data-testid="action-step-list-editor">
      {value.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚未添加任何动作"
          style={{ padding: '20px 0' }}
        />
      )}

      <div
        style={{
          position: 'relative',
          paddingLeft: 32,
        }}
      >
        {/* 竖虚线轴（admin-UI §4.20.3 第二行） */}
        {value.length > 1 && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 11,
              top: 12,
              bottom: 60,
              width: 0,
              borderLeft: '2px dashed var(--ant-color-border-secondary)',
            }}
          />
        )}

        {value.map((step, index) => (
          <StepRow
            key={index}
            step={step}
            index={index}
            total={value.length}
            isEditing={editingIndex === index}
            errorPaths={stepErrors[index] ?? {}}
            hallId={hallId}
            devices={devices}
            exhibits={exhibits}
            scenes={scenes}
            onSelectContent={onSelectContent}
            disabled={disabled}
            onPatch={(p) => patchAt(index, p)}
            onRemove={() => removeAt(index)}
            onMoveUp={() => moveAt(index, -1)}
            onMoveDown={() => moveAt(index, 1)}
            onFocusEdit={() => onEditingIndexChange?.(index)}
            onBlurEdit={() => onEditingIndexChange?.(null)}
          />
        ))}
      </div>

      {/* 添加按钮区（admin-UI §4.20.3 末行） */}
      <div
        data-testid="action-step-add-buttons"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginTop: 12,
        }}
      >
        <Button
          type="dashed"
          size="large"
          block
          icon={<PlusOutlined />}
          onClick={addDevice}
          disabled={disabled}
          data-testid="action-step-add-device"
          style={{
            color: 'var(--ant-color-warning)',
            borderColor: 'var(--ant-color-warning)',
          }}
        >
          添加 设备动作{' '}
          <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>
            （控灯 / 投影 / LED 等）
          </span>
        </Button>
        <Button
          type="dashed"
          size="large"
          block
          icon={<PlusOutlined />}
          onClick={addContent}
          disabled={disabled}
          data-testid="action-step-add-content"
          style={{
            color: 'var(--ant-color-info)',
            borderColor: 'var(--ant-color-info)',
          }}
        >
          添加 数字内容动作{' '}
          <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>
            （播视频 / 切前景图 / 守屏图 等）
          </span>
        </Button>
      </div>
    </div>
  );
}

function groupErrorsByStep(
  errors: Record<string, string>,
): Record<number, Record<string, string>> {
  const out: Record<number, Record<string, string>> = {};
  for (const [path, msg] of Object.entries(errors)) {
    const m = path.match(/^(\d+)\.(.+)$/);
    if (!m) continue;
    const idx = Number(m[1]);
    out[idx] ??= {};
    out[idx][m[2]] = msg;
  }
  return out;
}

// ============================================================
// Step 行（圆点 + delay-chip + 步卡）
// ============================================================

interface StepRowProps {
  step: ActionStep;
  index: number;
  total: number;
  isEditing: boolean;
  errorPaths: Record<string, string>;
  hallId: number;
  devices: DeviceLite[];
  exhibits: ExhibitLite[];
  scenes: SceneLite[];
  onSelectContent?: Props['onSelectContent'];
  disabled?: boolean;
  onPatch: (p: Partial<ActionStep>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onFocusEdit: () => void;
  onBlurEdit: () => void;
}

function StepRow({
  step,
  index,
  total,
  isEditing,
  errorPaths,
  hallId,
  devices,
  exhibits,
  scenes,
  onSelectContent,
  disabled,
  onPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
  onFocusEdit,
}: StepRowProps) {
  const isDevice = step.type === 'device';
  const accentColor = isDevice
    ? 'var(--ant-color-warning)'
    : 'var(--ant-color-info)';
  const accentBg = isDevice
    ? 'var(--ant-color-warning-bg)'
    : 'var(--ant-color-info-bg)';

  const precondErrors = pickPreCondErrors(errorPaths);

  return (
    <div
      data-testid="action-step-row"
      data-step-type={step.type}
      data-step-index={index}
      style={{ position: 'relative', marginBottom: 16 }}
    >
      {/* Step 圆点 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: -32,
          top: 6,
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: `2px solid ${accentColor}`,
          background: 'var(--ant-color-bg-container)',
          color: accentColor,
          fontSize: 12,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {index + 1}
      </div>

      {/* Delay chip / editor —— 浮在卡片上方 */}
      <div style={{ marginBottom: 6 }}>
        <DelayInput
          stepIndex={index}
          value={step.delay_seconds_after_prev_start}
          onChange={(v) => onPatch({ delay_seconds_after_prev_start: v })}
          error={errorPaths.delay_seconds_after_prev_start ?? null}
          disabled={disabled}
        />
      </div>

      <Card
        size="small"
        variant="outlined"
        onClick={onFocusEdit}
        data-testid="action-step-card"
        style={{
          borderRadius: 12,
          borderColor: isEditing ? 'var(--ant-color-primary)' : undefined,
          boxShadow: isEditing
            ? '0 0 0 3px var(--ant-color-primary-bg)'
            : undefined,
        }}
      >
        {/* head：类型 chip + 标题 + 操作按钮 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <Tag
            color={isDevice ? 'warning' : 'processing'}
            icon={isDevice ? <ToolOutlined /> : <PlayCircleOutlined />}
            style={{
              margin: 0,
              fontWeight: 500,
              background: accentBg,
              color: accentColor,
              borderColor: 'transparent',
            }}
          >
            {isDevice ? '设备动作' : '数字内容'}
          </Tag>

          <Input
            size="small"
            placeholder="友好描述（部署人员填，中控弹窗显示；选填）"
            value={step.friendly_description ?? ''}
            onChange={(e) =>
              onPatch({ friendly_description: e.target.value || null })
            }
            maxLength={255}
            disabled={disabled}
            status={errorPaths.friendly_description ? 'error' : undefined}
            data-testid="action-step-friendly-description"
            style={{ flex: 1, minWidth: 200 }}
          />

          <Space.Compact>
            <Tooltip title="上移">
              <Button
                size="small"
                icon={<ArrowUpOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp();
                }}
                disabled={disabled || index === 0}
                data-testid="action-step-move-up"
              />
            </Tooltip>
            <Tooltip title="下移">
              <Button
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown();
                }}
                disabled={disabled || index === total - 1}
                data-testid="action-step-move-down"
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                disabled={disabled}
                data-testid="action-step-remove"
              />
            </Tooltip>
          </Space.Compact>
        </div>

        {/* body：按 type 分支渲染 */}
        {isDevice ? (
          <DeviceStepBody
            step={step}
            devices={devices}
            errorPaths={errorPaths}
            disabled={disabled}
            onPatch={onPatch}
          />
        ) : (
          <ContentStepBody
            step={step}
            hallId={hallId}
            exhibits={exhibits}
            errorPaths={errorPaths}
            disabled={disabled}
            onPatch={onPatch}
            onSelectContent={onSelectContent}
          />
        )}

        {/* 前置条件 */}
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px dashed var(--ant-color-border-secondary)',
          }}
        >
          <PreCondListEditor
            value={step.preconditions ?? []}
            onChange={(next) =>
              onPatch({ preconditions: next.length > 0 ? next : null })
            }
            currentStepIndex={index}
            devices={devices}
            exhibits={exhibits}
            scenes={scenes}
            errors={precondErrors}
            disabled={disabled}
          />
        </div>
      </Card>
    </div>
  );
}

function pickPreCondErrors(
  errorPaths: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errorPaths)) {
    if (k.startsWith('preconditions.')) {
      out[k.slice('preconditions.'.length)] = v;
    }
  }
  return out;
}

// ============================================================
// Device step body
// ============================================================

interface DeviceBodyProps {
  step: ActionStep;
  devices: DeviceLite[];
  errorPaths: Record<string, string>;
  disabled?: boolean;
  onPatch: (p: Partial<ActionStep>) => void;
}

function DeviceStepBody({
  step,
  devices,
  errorPaths,
  disabled,
  onPatch,
}: DeviceBodyProps) {
  const deviceOptions = useMemo(
    () => devices.map((d) => ({ value: d.id, label: d.name })),
    [devices],
  );

  const { data: commands } = useQuery({
    queryKey: queryKeys.effectiveCommands(step.device_id || 0),
    queryFn: () => hallApi.getEffectiveCommands(step.device_id as number),
    select: (res) => res.data.data,
    enabled: !!step.device_id && step.device_id > 0,
  });

  const selectedCommand = useMemo(
    () => (commands ?? []).find((c) => c.code === step.command),
    [commands, step.command],
  );

  const commandOptions = useMemo(() => {
    const list = commands ?? [];
    const byCategory = new Map<string, EffectiveCommand[]>();
    for (const c of list) {
      const key = c.category || '其他';
      const arr = byCategory.get(key) ?? [];
      arr.push(c);
      byCategory.set(key, arr);
    }
    return Array.from(byCategory.entries()).map(([cat, cmds]) => ({
      label: cat,
      options: cmds.map((c) => ({
        value: c.code,
        label: (
          <span>
            {c.name}
            <span
              style={{
                color: 'var(--ant-color-text-tertiary)',
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
  }, [commands]);

  const paramsSchema = (selectedCommand?.params_schema ?? null) as unknown as
    | ParamsSchemaShape
    | null;
  const paramsProps = paramsSchema?.properties ?? {};
  const paramsKeys = Object.keys(paramsProps);
  const paramsValue = (step.params ?? {}) as Record<string, unknown>;

  return (
    <div data-testid="device-step-body">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        <div>
          <label
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-secondary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            目标设备
          </label>
          <span
            data-testid="device-step-device-select"
            style={{ display: 'block', width: '100%' }}
          >
            <Select
              size="small"
              placeholder="选择设备"
              value={step.device_id ?? undefined}
              onChange={(v) =>
                onPatch({ device_id: v as number, command: null, params: null })
              }
              options={deviceOptions}
              disabled={disabled}
              status={errorPaths.device_id ? 'error' : undefined}
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
            />
          </span>
        </div>
        <div>
          <label
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-secondary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            命令
          </label>
          <span
            data-testid="device-step-command-select"
            style={{ display: 'block', width: '100%' }}
          >
            <Select
              size="small"
              placeholder={step.device_id ? '选择命令' : '先选设备'}
              value={step.command ?? undefined}
              onChange={(v) => onPatch({ command: v as string, params: null })}
              options={commandOptions}
              disabled={disabled || !step.device_id}
              status={errorPaths.command ? 'error' : undefined}
              showSearch
              optionFilterProp="value"
              style={{ width: '100%' }}
            />
          </span>
        </div>
      </div>

      {step.command && paramsKeys.length > 0 && (
        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {paramsKeys.map((key) => {
            const p = paramsProps[key];
            const required = (paramsSchema?.required ?? []).includes(key);
            const fieldErr = errorPaths[`params.${key}`];
            return (
              <div key={key}>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--ant-color-text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  {p.title ?? key}
                  {required && (
                    <span
                      style={{
                        color: 'var(--ant-color-error)',
                        marginLeft: 4,
                      }}
                    >
                      *
                    </span>
                  )}
                </div>
                <WidgetRenderer
                  schema={p}
                  value={paramsValue[key]}
                  onChange={(v) =>
                    onPatch({ params: { ...paramsValue, [key]: v } })
                  }
                  size="small"
                />
                {fieldErr && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ant-color-error)',
                      marginTop: 2,
                    }}
                    role="alert"
                  >
                    {fieldErr}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Content step body
// ============================================================

interface ContentBodyProps {
  step: ActionStep;
  hallId: number;
  exhibits: ExhibitLite[];
  errorPaths: Record<string, string>;
  disabled?: boolean;
  onPatch: (p: Partial<ActionStep>) => void;
  onSelectContent?: Props['onSelectContent'];
}

function ContentStepBody({
  step,
  hallId,
  exhibits,
  errorPaths,
  disabled,
  onPatch,
  onSelectContent,
}: ContentBodyProps) {
  const [slideshowOpen, setSlideshowOpen] = useState(false);

  const exhibitOptions = useMemo(
    () => exhibits.map((e) => ({ value: e.id, label: e.name })),
    [exhibits],
  );

  const intent = (step.content_intent ?? null) as ContentIntent | null;
  const intentMeta = useMemo(
    () => CONTENT_INTENT_META.find((m) => m.value === intent),
    [intent],
  );
  const params = (step.content_params ?? {}) as Record<string, unknown>;

  function patchParams(patch: Record<string, unknown>) {
    onPatch({ content_params: { ...params, ...patch } });
  }

  async function handleOpenContentPicker(
    mode: 'play_video' | 'show_screen_image',
  ) {
    if (!onSelectContent || !step.exhibit_id) return;
    const current = (params.content_id as number | undefined) ?? null;
    const next = await onSelectContent(mode, step.exhibit_id, current);
    if (next != null) patchParams({ content_id: next });
  }

  return (
    <div data-testid="content-step-body">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        <div>
          <label
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-secondary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            展项 / 屏幕
          </label>
          <span
            data-testid="content-step-exhibit-select"
            style={{ display: 'block', width: '100%' }}
          >
            <Select
              size="small"
              placeholder="选择展项"
              value={step.exhibit_id ?? undefined}
              onChange={(v) =>
                onPatch({
                  exhibit_id: v as number,
                  content_intent: null,
                  content_params: null,
                })
              }
              options={exhibitOptions}
              disabled={disabled}
              status={errorPaths.exhibit_id ? 'error' : undefined}
              showSearch
              optionFilterProp="label"
              suffixIcon={<TabletOutlined />}
              style={{ width: '100%' }}
            />
          </span>
        </div>
        <div>
          <label
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-secondary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            动作
          </label>
          <ContentIntentSelect
            value={intent}
            onChange={(next, defaults) =>
              onPatch({ content_intent: next, content_params: defaults })
            }
            error={errorPaths.content_intent ?? null}
            disabled={disabled || !step.exhibit_id}
          />
        </div>
      </div>

      {intentMeta?.hasParams && (
        <div style={{ marginTop: 10 }}>
          <ContentIntentParamsForm
            intent={intent as ContentIntent}
            params={params}
            errorPaths={errorPaths}
            disabled={disabled}
            patchParams={patchParams}
            onOpenSlideshow={() => setSlideshowOpen(true)}
            onOpenContentPicker={handleOpenContentPicker}
            hasContentPickerCallback={!!onSelectContent}
          />
        </div>
      )}

      {intent === 'slideshow_goto' && step.exhibit_id ? (
        <SlideshowImagePicker
          open={slideshowOpen}
          exhibitId={step.exhibit_id}
          hallId={hallId}
          selectedIndex={
            typeof params.index === 'number' ? (params.index as number) : null
          }
          onSelect={(idx) => {
            patchParams({ index: idx });
            setSlideshowOpen(false);
          }}
          onCancel={() => setSlideshowOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ============================================================
// 8 意图的参数表单
// ============================================================

interface IntentFormProps {
  intent: ContentIntent;
  params: Record<string, unknown>;
  errorPaths: Record<string, string>;
  disabled?: boolean;
  patchParams: (patch: Record<string, unknown>) => void;
  onOpenSlideshow: () => void;
  onOpenContentPicker: (
    mode: 'play_video' | 'show_screen_image',
  ) => Promise<void>;
  hasContentPickerCallback: boolean;
}

function ContentIntentParamsForm({
  intent,
  params,
  errorPaths,
  disabled,
  patchParams,
  onOpenSlideshow,
  onOpenContentPicker,
  hasContentPickerCallback,
}: IntentFormProps) {
  switch (intent) {
    case 'play_video':
    case 'show_screen_image': {
      const cid =
        typeof params.content_id === 'number'
          ? (params.content_id as number)
          : null;
      const fieldErr = errorPaths['content_params.content_id'];
      const icon =
        intent === 'play_video' ? (
          <PlayCircleOutlined />
        ) : (
          <PictureOutlined />
        );
      return (
        <div data-testid={`intent-form-${intent}`}>
          <label
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-secondary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            {intent === 'play_video' ? '选择视频' : '选择守屏图'}
          </label>
          <Button
            block
            icon={icon}
            onClick={() => onOpenContentPicker(intent)}
            disabled={disabled || !hasContentPickerCallback}
            danger={!!fieldErr}
          >
            {cid
              ? `已选 content_id = ${cid}`
              : hasContentPickerCallback
                ? '点击选择…'
                : '（host 注入 ContentPicker 后可用）'}
          </Button>
          {fieldErr && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--ant-color-error)',
                marginTop: 4,
              }}
              role="alert"
            >
              {fieldErr}
            </div>
          )}
        </div>
      );
    }
    case 'slideshow_goto': {
      const idx = typeof params.index === 'number' ? (params.index as number) : null;
      const fieldErr = errorPaths['content_params.index'];
      return (
        <div data-testid="intent-form-slideshow_goto">
          <label
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-secondary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            选择前景图（来自该展项的图文汇报配置）
          </label>
          <Button
            block
            icon={<AppstoreOutlined />}
            onClick={onOpenSlideshow}
            disabled={disabled}
            danger={!!fieldErr}
          >
            {idx != null ? `已选第 ${idx + 1} 张前景图` : '点击选择前景图…'}
          </Button>
          {fieldErr && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--ant-color-error)',
                marginTop: 4,
              }}
              role="alert"
            >
              {fieldErr}
            </div>
          )}
        </div>
      );
    }
    case 'seek': {
      const ms =
        typeof params.position_ms === 'number'
          ? (params.position_ms as number)
          : 0;
      const fieldErr = errorPaths['content_params.position_ms'];
      return (
        <div data-testid="intent-form-seek">
          <label
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-secondary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            跳到（mm:ss）
          </label>
          <Input
            value={msToMmss(ms)}
            onChange={(e) => patchParams({ position_ms: mmssToMs(e.target.value) })}
            disabled={disabled}
            status={fieldErr ? 'error' : undefined}
            placeholder="00:00"
            style={{ width: 120 }}
            data-testid="intent-form-seek-input"
          />
        </div>
      );
    }
    case 'set_volume': {
      const vol =
        typeof params.volume === 'number' ? (params.volume as number) : 80;
      const fieldErr = errorPaths['content_params.volume'];
      return (
        <div data-testid="intent-form-set_volume">
          <label
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-secondary)',
              display: 'block',
              marginBottom: 4,
            }}
          >
            音量
          </label>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <span
              data-testid="intent-form-volume-slider"
              style={{ flex: 1, display: 'block' }}
            >
              <Slider
                min={0}
                max={100}
                step={1}
                value={vol}
                onChange={(v) => patchParams({ volume: v })}
                disabled={disabled}
              />
            </span>
            <InputNumber
              min={0}
              max={100}
              step={1}
              precision={0}
              value={vol}
              onChange={(v) =>
                patchParams({
                  volume: typeof v === 'number' ? Math.floor(v) : 0,
                })
              }
              disabled={disabled}
              style={{ width: 72 }}
            />
            <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
              %
            </span>
          </div>
          {fieldErr && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--ant-color-error)',
                marginTop: 4,
              }}
              role="alert"
            >
              {fieldErr}
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

function msToMmss(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function mmssToMs(s: string): number {
  const m = s.match(/^(\d+):(\d{1,2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60_000 + Number(m[2]) * 1_000;
}
