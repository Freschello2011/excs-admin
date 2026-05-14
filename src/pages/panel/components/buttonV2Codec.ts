/**
 * device_command 卡 binding ↔ ButtonViewModel[] 编解码 + 校验
 *
 * S5-9（ADR-0020-v2 Stage 5 admin Phase C）。
 *
 * 与 server `panel/binding_parse.go::ParseDeviceCommandBindingButtons` 配合：
 *   - read：dual-mode（schema_version 缺省/1 → v1 三元组 → device-only ActionStep；
 *     schema_version=2 → 直接 ActionStep[]）
 *   - write：始终 schema_version=2 + ActionStep[]（v2 编辑器路径）
 */
import type { ActionStep } from '@/pages/_shared/runbook/types';
import type { ButtonViewModel } from './buttonV2Types';

interface V1Action {
  device_id: number;
  command: string;
  params?: Record<string, unknown> | null;
}

interface RawBinding {
  schema_version?: number;
  buttons?: Array<{
    label?: string;
    icon?: string;
    tooltip?: string;
    actions?: unknown;
  }>;
}

export function bindingToButtons(
  raw: Record<string, unknown> | null | undefined,
): ButtonViewModel[] {
  if (!raw || typeof raw !== 'object') return [];
  const b = raw as RawBinding;
  const list = Array.isArray(b.buttons) ? b.buttons : [];
  const sv = typeof b.schema_version === 'number' ? b.schema_version : 1;

  return list.map((btn) => {
    const acts = Array.isArray(btn.actions) ? btn.actions : [];
    let actions: ActionStep[];
    if (sv === 2) {
      actions = acts as ActionStep[];
    } else {
      actions = acts.map((a) => {
        const v1 = a as V1Action;
        return {
          type: 'device' as const,
          delay_seconds_after_prev_start: 0,
          device_id:
            typeof v1.device_id === 'number' && v1.device_id > 0
              ? v1.device_id
              : null,
          command: typeof v1.command === 'string' ? v1.command : null,
          params: (v1.params ?? null) as Record<string, unknown> | null,
          preconditions: null,
          friendly_description: null,
        };
      });
    }
    return {
      label: typeof btn.label === 'string' ? btn.label : '',
      icon: typeof btn.icon === 'string' ? btn.icon : '',
      tooltip: typeof btn.tooltip === 'string' ? btn.tooltip : '',
      actions,
    };
  });
}

export function buttonsToBinding(
  buttons: ButtonViewModel[],
): Record<string, unknown> {
  return {
    schema_version: 2,
    buttons: buttons.map((b) => {
      const out: Record<string, unknown> = {
        label: b.label,
        actions: b.actions,
      };
      if (b.icon) out.icon = b.icon;
      if (b.tooltip) out.tooltip = b.tooltip;
      return out;
    }),
  };
}

export interface ValidationOutcome {
  errors: Record<number, Record<string, string>>;
  hasError: boolean;
  globalBlock?: string;
}

export function validateButtons(
  buttons: ButtonViewModel[],
  /**
   * 当前 hall 的活设备 id 集合（可选）。提供后会校验 device 步的 device_id 必须落在活设备列表，
   * 拦下"设备已删但旧 binding 仍引用"导致的服务端 VERSION_DEVICE_NOT_IN_HALL 死锁。
   * 不传 = 跳过此校验（兼容老 caller / 设备列表未加载时）。
   */
  knownDeviceIds?: ReadonlySet<number> | null,
): ValidationOutcome {
  const errors: Record<number, Record<string, string>> = {};
  let globalBlock: string | undefined;

  if (buttons.length === 0) {
    globalBlock = '至少需要 1 个按钮';
  }

  buttons.forEach((b, i) => {
    const e: Record<string, string> = {};
    if (!b.label.trim()) e.label = '按钮文字必填';
    if (b.actions.length === 0) {
      e['actions'] = '至少需要 1 个动作';
    }
    b.actions.forEach((s, idx) => {
      if (s.type === 'device') {
        if (!s.device_id) {
          e[`actions.${idx}.device_id`] = '请选择设备';
        } else if (knownDeviceIds && !knownDeviceIds.has(s.device_id)) {
          e[`actions.${idx}.device_id`] = `设备 ${s.device_id} 已删除，请改选或删除此动作`;
        }
        if (!s.command) e[`actions.${idx}.command`] = '请选择命令';
      } else if (s.type === 'content') {
        if (!s.exhibit_id) e[`actions.${idx}.exhibit_id`] = '请选择展项';
        if (!s.content_intent) e[`actions.${idx}.content_intent`] = '请选择动作';
      }
    });
    if (Object.keys(e).length > 0) errors[i] = e;
  });

  return {
    errors,
    hasError: Object.keys(errors).length > 0 || !!globalBlock,
    globalBlock,
  };
}
