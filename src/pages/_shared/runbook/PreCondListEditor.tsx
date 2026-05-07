/**
 * <PreCondListEditor> — 每步前置条件折叠区编辑器
 *
 * SSOT：admin-UI §4.20.1 行 848；mockup M1 line 686-892（precond-section）
 *
 * 行为：
 *   - 默认 0 条 → 折叠态 "前置条件 (0)"；展开 → 结构化下拉 + 添加按钮
 *   - 5 类前置条件（runbook.yaml#/PreCondType）：
 *       · exhibit_app_online → 选展项
 *       · device_online      → 选设备
 *       · hall_master_ready  → 无目标
 *       · scene_state        → 选场景
 *       · action_done        → 选步序号（必须 < 当前步 index；admin 编辑期阻断前向引用）
 *   - 顶部小字提示 "条件不满足时仅警告并继续"；底部 Switch "条件不满足时阻断本步骤"
 *     （per-cond block_on_fail 切换；语义：默认 false = 仅警告）
 *   - 422 detail 命中 `/steps/N/preconditions/M/...` 时把对应行整体加 error 描边
 */

import { useMemo, useState } from 'react';
import { Button, Select, Switch, Tooltip, InputNumber } from 'antd';
import {
  PlusOutlined,
  CloseOutlined,
  RightOutlined,
  DownOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  PRECOND_TYPE_META,
  emptyPreCond,
  type PreCond,
  type PreCondType,
} from './types';

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
  value: PreCond[];
  onChange: (next: PreCond[]) => void;
  /** 本前置条件所属的 step 在 ActionStep[] 中的下标；action_done 类型用于禁掉前向引用 */
  currentStepIndex: number;
  /** 父组件传入的查找表（host 拉好后透传；本组件不发请求） */
  devices: DeviceLite[];
  exhibits: ExhibitLite[];
  scenes: SceneLite[];
  /** 422 detail 命中本组的 path → error message（key 形如 "0.scene_id" / "1.device_id"） */
  errors?: Record<string, string>;
  disabled?: boolean;
}

export default function PreCondListEditor({
  value,
  onChange,
  currentStepIndex,
  devices,
  exhibits,
  scenes,
  errors = {},
  disabled,
}: Props) {
  const [expanded, setExpanded] = useState<boolean>(value.length > 0);
  const count = value.length;

  function patchAt(index: number, patch: Partial<PreCond>) {
    onChange(value.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeAt(index: number) {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    if (next.length === 0) setExpanded(false);
  }

  function add() {
    onChange([...value, emptyPreCond()]);
    setExpanded(true);
  }

  return (
    <div data-testid="precond-list-editor">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        data-testid="precond-toggle"
        data-expanded={expanded ? 'true' : 'false'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--ant-color-text-secondary)',
        }}
      >
        {expanded ? <DownOutlined /> : <RightOutlined />}
        前置条件
        <span
          style={{
            fontSize: 11,
            padding: '1px 8px',
            borderRadius: 999,
            background:
              count > 0 ? 'var(--ant-color-info-bg)' : 'var(--ant-color-fill-tertiary)',
            color:
              count > 0 ? 'var(--ant-color-info)' : 'var(--ant-color-text-tertiary)',
          }}
        >
          {count}
        </span>
      </button>

      {expanded && (
        <div style={{ paddingLeft: 24, marginTop: 6 }}>
          {value.map((cond, index) => (
            <PreCondRow
              key={index}
              cond={cond}
              currentStepIndex={currentStepIndex}
              devices={devices}
              exhibits={exhibits}
              scenes={scenes}
              errors={pickErrors(errors, index)}
              disabled={disabled}
              onPatch={(p) => patchAt(index, p)}
              onRemove={() => removeAt(index)}
            />
          ))}

          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={add}
            disabled={disabled}
            data-testid="precond-add-btn"
            style={{ marginTop: 4, fontSize: 12 }}
          >
            添加条件
          </Button>

          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: 'var(--ant-color-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <WarningOutlined style={{ fontSize: 12 }} />
            条件不满足时，本步骤将
            <span style={{ color: 'var(--ant-color-warning)', fontWeight: 500 }}>
              仅警告并继续
            </span>
            。如需
            <span style={{ color: 'var(--ant-color-error)', fontWeight: 500 }}>
              阻断本步
            </span>
            ，打开下方开关。
          </div>
        </div>
      )}
    </div>
  );
}

function pickErrors(
  all: Record<string, string>,
  index: number,
): Record<string, string> {
  const prefix = `${index}.`;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}

interface RowProps {
  cond: PreCond;
  currentStepIndex: number;
  devices: DeviceLite[];
  exhibits: ExhibitLite[];
  scenes: SceneLite[];
  errors: Record<string, string>;
  disabled?: boolean;
  onPatch: (patch: Partial<PreCond>) => void;
  onRemove: () => void;
}

function PreCondRow({
  cond,
  currentStepIndex,
  devices,
  exhibits,
  scenes,
  errors,
  disabled,
  onPatch,
  onRemove,
}: RowProps) {
  const meta = useMemo(
    () => PRECOND_TYPE_META.find((m) => m.value === cond.type) ?? PRECOND_TYPE_META[1],
    [cond.type],
  );

  const hasErr = Object.keys(errors).length > 0;

  function changeType(next: PreCondType) {
    // 切类型时清空旧目标字段，避免 server 422 branch_field_conflict
    onPatch({
      type: next,
      exhibit_id: null,
      device_id: null,
      scene_id: null,
      action_step_index: null,
    });
  }

  return (
    <div
      data-testid="precond-row"
      data-has-error={hasErr ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '8px 10px',
        marginBottom: 6,
        border: `1px solid ${
          hasErr ? 'var(--ant-color-error)' : 'var(--ant-color-border-secondary)'
        }`,
        borderRadius: 6,
        background: 'var(--ant-color-fill-quaternary)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>等待</span>
      <span data-testid="precond-type-select" style={{ display: 'inline-flex' }}>
        <Select
          size="small"
          value={cond.type}
          onChange={changeType}
          disabled={disabled}
          style={{ width: 152 }}
          options={PRECOND_TYPE_META.map((m) => ({ value: m.value, label: m.label }))}
        />
      </span>

      {/* 目标字段（按 type 渲染不同控件） */}
      <PreCondTarget
        cond={cond}
        meta={meta}
        currentStepIndex={currentStepIndex}
        devices={devices}
        exhibits={exhibits}
        scenes={scenes}
        errors={errors}
        disabled={disabled}
        onPatch={onPatch}
      />

      {/* timeout_seconds（共有可选） */}
      <Tooltip title="评估超时（秒）；空 = 走引擎默认值">
        <span data-testid="precond-timeout-input" style={{ display: 'inline-flex' }}>
          <InputNumber
            size="small"
            min={1}
            step={1}
            precision={0}
            placeholder="超时"
            suffix={<span style={{ fontSize: 11 }}>s</span>}
            value={cond.timeout_seconds ?? null}
            onChange={(v) =>
              onPatch({ timeout_seconds: typeof v === 'number' ? Math.floor(v) : null })
            }
            disabled={disabled}
            style={{ width: 84 }}
          />
        </span>
      </Tooltip>

      {/* block_on_fail Switch */}
      <Tooltip title="开 = 不满足时阻断本步（不发命令、标 fail）；关 = 仅警告（默认）">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Switch
            size="small"
            checked={cond.block_on_fail}
            onChange={(checked) => onPatch({ block_on_fail: checked })}
            disabled={disabled}
            data-testid="precond-block-on-fail-switch"
          />
          <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>阻断</span>
        </span>
      </Tooltip>

      <Button
        type="text"
        size="small"
        danger
        icon={<CloseOutlined />}
        onClick={onRemove}
        disabled={disabled}
        data-testid="precond-remove-btn"
        style={{ marginLeft: 'auto' }}
      />

      {hasErr && (
        <div
          style={{
            width: '100%',
            fontSize: 11,
            color: 'var(--ant-color-error)',
            marginTop: 2,
          }}
          role="alert"
        >
          {Object.values(errors).join(' · ')}
        </div>
      )}
    </div>
  );
}

interface TargetProps {
  cond: PreCond;
  meta: (typeof PRECOND_TYPE_META)[number];
  currentStepIndex: number;
  devices: DeviceLite[];
  exhibits: ExhibitLite[];
  scenes: SceneLite[];
  errors: Record<string, string>;
  disabled?: boolean;
  onPatch: (patch: Partial<PreCond>) => void;
}

function PreCondTarget({
  cond,
  meta,
  currentStepIndex,
  devices,
  exhibits,
  scenes,
  errors,
  disabled,
  onPatch,
}: TargetProps) {
  switch (meta.value) {
    case 'hall_master_ready':
      return (
        <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
          {meta.waitDesc}
        </span>
      );
    case 'exhibit_app_online':
      return (
        <span
          data-testid="precond-target-exhibit-select"
          style={{ display: 'inline-flex' }}
        >
          <Select
            size="small"
            value={cond.exhibit_id ?? undefined}
            onChange={(v) => onPatch({ exhibit_id: v as number })}
            options={exhibits.map((e) => ({ value: e.id, label: e.name }))}
            placeholder={meta.targetLabel ?? '目标'}
            disabled={disabled}
            status={errors.exhibit_id ? 'error' : undefined}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="label"
          />
        </span>
      );
    case 'device_online':
      return (
        <span
          data-testid="precond-target-device-select"
          style={{ display: 'inline-flex' }}
        >
          <Select
            size="small"
            value={cond.device_id ?? undefined}
            onChange={(v) => onPatch({ device_id: v as number })}
            options={devices.map((d) => ({ value: d.id, label: d.name }))}
            placeholder={meta.targetLabel ?? '目标'}
            disabled={disabled}
            status={errors.device_id ? 'error' : undefined}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="label"
          />
        </span>
      );
    case 'scene_state':
      return (
        <span
          data-testid="precond-target-scene-select"
          style={{ display: 'inline-flex' }}
        >
          <Select
            size="small"
            value={cond.scene_id ?? undefined}
            onChange={(v) => onPatch({ scene_id: v as number })}
            options={scenes.map((s) => ({ value: s.id, label: s.name }))}
            placeholder={meta.targetLabel ?? '目标'}
            disabled={disabled}
            status={errors.scene_id ? 'error' : undefined}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="label"
          />
        </span>
      );
    case 'action_done': {
      const max = currentStepIndex - 1; // 不能引用前向；< 当前步
      const stepOptions = Array.from({ length: Math.max(max + 1, 0) }, (_, i) => ({
        value: i,
        label: `第 ${i + 1} 步`,
      }));
      const isForward =
        cond.action_step_index != null && cond.action_step_index >= currentStepIndex;
      return (
        <Tooltip
          title={
            isForward
              ? '不允许引用当前步或后续步（前向引用）'
              : '只能引用前序步（< 当前步）'
          }
        >
          <span
            data-testid="precond-target-step-select"
            data-disabled={disabled || max < 0 ? 'true' : 'false'}
            style={{ display: 'inline-flex' }}
          >
            <Select
              size="small"
              value={cond.action_step_index ?? undefined}
              onChange={(v) => onPatch({ action_step_index: v as number })}
              options={stepOptions}
              placeholder={meta.targetLabel ?? '目标'}
              disabled={disabled || max < 0}
              status={
                errors.action_step_index || isForward ? 'error' : undefined
              }
              style={{ width: 120 }}
            />
          </span>
        </Tooltip>
      );
    }
    default:
      return null;
  }
}
