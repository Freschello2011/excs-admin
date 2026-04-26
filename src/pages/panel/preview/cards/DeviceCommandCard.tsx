import type { PanelCard } from '@/api/gen/client';
import type { NameMaps } from '../PreviewPanel';
import PanelButtonCell from '../PanelButtonCell';
import { CELL_VARS } from '../cellTokens';

interface Props {
  card: PanelCard;
  nameMaps: NameMaps;
}

interface ButtonShape {
  label?: string;
  icon?: string;
  actions?: Array<{ device_id?: number; command?: string }>;
}

/**
 * v2.0 device_command 卡（中控面板改版 P2 — 新卡型）。
 *
 * 一卡 N 个按钮，每按钮触发 M 个 [device, command, params] 三元组（不改 hall.current_scene）。
 * 排列规则与 scene_group 卡相同：自动换行，最后一行不满用「描边占位单元」补齐。
 */
export default function DeviceCommandCard({ card, nameMaps }: Props) {
  const binding = card.binding as { buttons?: ButtonShape[] } | null | undefined;
  const buttons: ButtonShape[] = binding?.buttons ?? [];

  // 渲染规则：3 列 grid，自动 wrap，不满补 empty cell
  const cols = Math.min(Math.max(buttons.length, 1), 3);
  const totalSlots = Math.ceil(Math.max(buttons.length, 1) / cols) * cols;
  const emptyCount = totalSlots - buttons.length;

  if (buttons.length === 0) {
    return (
      <div style={{ ...CELL_VARS, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--cell-gap)' }}>
        <PanelButtonCell empty />
        <PanelButtonCell empty />
        <PanelButtonCell empty />
      </div>
    );
  }

  return (
    <div
      style={{
        ...CELL_VARS,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols},1fr)`,
        gap: 'var(--cell-gap)',
      }}
    >
      {buttons.map((b, i) => {
        const firstAction = b.actions?.[0];
        const deviceLabel = firstAction?.device_id
          ? nameMaps.device.get(firstAction.device_id) ?? `设备 #${firstAction.device_id}`
          : undefined;
        const status = b.actions?.length
          ? `${b.actions.length} 动作${deviceLabel ? ' · ' + deviceLabel : ''}`
          : '未配置';
        return (
          <PanelButtonCell
            key={i}
            tone="command"
            label={b.label || `按钮 ${i + 1}`}
            status={status}
          />
        );
      })}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <PanelButtonCell key={`empty-${i}`} empty />
      ))}
    </div>
  );
}
