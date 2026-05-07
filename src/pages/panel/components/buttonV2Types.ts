/**
 * 共享视图 VO — DeviceCommandButtonEditorV2 host 与 4 个子组件互通形态。
 *
 * 与 server `panel/binding_parse.go::ParsedDeviceCommandButton` 同形（Steps 改名为
 * actions 以贴近 binding JSON 字段名）。host 内部统一用此形态做编辑态，save 时再
 * 序列化为 v2 binding（{ schema_version: 2, buttons: [...] }）。
 */
import type { ActionStep } from '@/pages/_shared/runbook/types';

export interface ButtonViewModel {
  label: string;
  icon?: string;
  tooltip?: string;
  actions: ActionStep[];
}
