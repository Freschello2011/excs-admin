import { useMemo } from 'react';
import { Button, Card, Divider, Empty, Input, Space, Tooltip } from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import type {
  DeviceCommandBinding,
  DeviceCommandButton,
  ActionStep,
  DeviceListItem,
  ExhibitListItem,
} from '@/api/gen/client';
import ActionStepListEditor from '@/pages/command/ActionStepListEditor';

interface Props {
  /** 卡片当前 binding（可能是空 or 老结构）。null 时按新建初始化。 */
  value?: DeviceCommandBinding | null;
  onChange: (next: DeviceCommandBinding) => void;
  /** 当前 hall 的设备列表（用于 device_id select） */
  devices: DeviceListItem[];
  /** 当前 hall 的展项列表（ADR-0020 起 content 类型 ActionStep 需要） */
  exhibits: ExhibitListItem[];
}

const EMPTY_BUTTON: DeviceCommandButton = { label: '', actions: [] };

/**
 * 中控面板改版 P2 — device_command 卡的编辑器。
 *
 * ADR-0020 起每个按钮的 actions 是 ActionStep[]（共用场景编辑器同一个 ActionStepListEditor）。
 *   - 按钮列表（可加可删可上下移）
 *   - 每按钮含 label / icon / actions[]
 *   - 每动作是完整 ActionStep：device 或 content + delay + 前置
 *
 * 提交（onChange）时序列化为 DeviceCommandBinding；调用方挂到 buffer.card.binding。
 */
export default function DeviceCommandCardEditor({ value, onChange, devices, exhibits }: Props) {
  const buttons: DeviceCommandButton[] = useMemo(() => value?.buttons ?? [], [value]);

  const setButtons = (next: DeviceCommandButton[]) => {
    onChange({ buttons: next });
  };

  const addButton = () =>
    setButtons([
      ...buttons,
      {
        ...EMPTY_BUTTON,
        actions: [
          {
            type: 'device',
            command: '',
            params: {},
            sort_order: 0,
            delay_from_start_ms: 0,
            precondition_block: false,
          },
        ],
      },
    ]);

  const updateButton = (idx: number, patch: Partial<DeviceCommandButton>) => {
    setButtons(buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };

  const deleteButton = (idx: number) => {
    setButtons(buttons.filter((_, i) => i !== idx));
  };

  const moveButton = (idx: number, dir: -1 | 1) => {
    const next = [...buttons];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setButtons(next);
  };

  const updateActions = (btnIdx: number, nextActions: ActionStep[]) => {
    updateButton(btnIdx, { actions: nextActions });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
          按钮列表（每按钮可绑 N 个 step；触发时由 RunbookEngine 按 sort_order + delay 派发，可掺 device / content）
        </span>
        <Button icon={<PlusOutlined />} onClick={addButton} size="small">
          添加按钮
        </Button>
      </div>

      {buttons.length === 0 && (
        <Empty
          description="暂无按钮，点击右上「添加按钮」开始配置"
          style={{ padding: 24 }}
        />
      )}

      {buttons.map((btn, btnIdx) => (
        <Card
          key={btnIdx}
          size="small"
          style={{ marginBottom: 12 }}
          title={
            <Space>
              <span style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
                按钮 {btnIdx + 1}
              </span>
              <Input
                size="small"
                placeholder="按钮标签（如：山区灯开）"
                value={btn.label}
                onChange={(e) => updateButton(btnIdx, { label: e.target.value })}
                style={{ width: 220 }}
              />
              <Input
                size="small"
                placeholder="图标（可选，如 bulb）"
                value={btn.icon ?? ''}
                onChange={(e) => updateButton(btnIdx, { icon: e.target.value })}
                style={{ width: 160 }}
              />
            </Space>
          }
          extra={
            <Space size={2}>
              <Tooltip title="上移">
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowUpOutlined />}
                  disabled={btnIdx === 0}
                  onClick={() => moveButton(btnIdx, -1)}
                />
              </Tooltip>
              <Tooltip title="下移">
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowDownOutlined />}
                  disabled={btnIdx === buttons.length - 1}
                  onClick={() => moveButton(btnIdx, 1)}
                />
              </Tooltip>
              <Tooltip title="删除按钮">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => deleteButton(btnIdx)}
                />
              </Tooltip>
            </Space>
          }
        >
          <div style={{ margin: '8px 0', fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
            动作列表（ActionStep）
          </div>
          <Divider style={{ margin: '4px 0 8px' }} />

          <ActionStepListEditor
            value={btn.actions ?? []}
            onChange={(next) => updateActions(btnIdx, next)}
            devices={devices}
            exhibits={exhibits}
          />
        </Card>
      ))}
    </div>
  );
}
