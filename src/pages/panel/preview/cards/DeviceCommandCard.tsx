import type { ReactNode } from 'react';
import type { PanelCard } from '@/api/gen/client';
import type { NameMaps } from '../PreviewPanel';
import PanelButtonCell from '../PanelButtonCell';
import { CELL_VARS } from '../cellTokens';
import { PT } from '../previewTokens';

interface Props {
  card: PanelCard;
  nameMaps: NameMaps;
  /** 列数。独占整行 = 6（缺省）；窄列（媒体右侧 1/3） = 2 */
  columns?: number;
}

interface ButtonShape {
  label?: string;
  icon?: string;
  actions?: Array<{ device_id?: number; command?: string }>;
}

/**
 * v2.0 device_command 卡（中控面板改版 P3 修正）。
 *
 * 一卡 N 个按钮，每按钮触发 M 个 [device, command, params] 三元组（不改 hall.current_scene）。
 * 排列规则（PRD §3.2.3 修正）：
 * - 独占整行 → 6 列 grid，最后一行不满用占位补齐
 * - 媒体播控右侧并列（1/3 列窄）→ 2 列 grid
 */
export default function DeviceCommandCard({ card, nameMaps, columns }: Props) {
  const binding = card.binding as { buttons?: ButtonShape[] } | null | undefined;
  const buttons: ButtonShape[] = binding?.buttons ?? [];

  const cols = Math.max(1, Math.min(12, columns ?? 6));
  const totalSlots = Math.ceil(Math.max(buttons.length, 1) / cols) * cols;
  const emptyCount = totalSlots - buttons.length;

  const config = card.config as { title?: string } | null | undefined;
  const title = config?.title || '设备命令卡片';

  // 玻璃卡片外壳 + 顶部标题 + 内部按钮网格（panel-redesign 2026-04-27）。
  // 跟"展项设备卡片" / standalone "设备开关卡片" 同款；纵列窄=2 列，独占横排=6 列。
  const wrapper = (children: ReactNode) => (
    <div
      style={{
        padding: 12,
        background: PT.glassFill,
        border: `1px solid ${PT.glassStroke}`,
        borderRadius: PT.radiusCard,
        backdropFilter: PT.blur,
        WebkitBackdropFilter: PT.blur,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: PT.textPrimary,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );

  if (buttons.length === 0) {
    return wrapper(
      <div style={{ ...CELL_VARS, display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 'var(--cell-gap)', flex: 1 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <PanelButtonCell key={`empty-${i}`} empty />
        ))}
      </div>
    );
  }

  return wrapper(
    <div
      style={{
        ...CELL_VARS,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols},1fr)`,
        gap: 'var(--cell-gap)',
        flex: 1,
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
