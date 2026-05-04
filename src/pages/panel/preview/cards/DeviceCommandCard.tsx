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
  actions?: Array<{
    device_id?: number;
    command?: string;
    params?: Record<string, unknown>;
  }>;
}

/** 解析按钮通道意图（与中控 App `services/panel/channel_state.dart` 同语义）。 */
function inferChannelIntent(b: ButtonShape): {
  kind: 'on' | 'off';
  channels: number[];
  deviceIds: number[];
} | null {
  if (!b.actions?.length) return null;
  const chs = new Set<number>();
  const devs = new Set<number>();
  let kind: 'on' | 'off' | null = null;
  for (const a of b.actions) {
    const cmd = a.command;
    if (!cmd) return null;
    const k = cmd.endsWith('_on') || cmd === 'on'
      ? 'on'
      : cmd.endsWith('_off') || cmd === 'off'
        ? 'off'
        : null;
    if (!k) return null;
    if (kind === null) kind = k;
    else if (kind !== k) return null;
    if (typeof a.device_id === 'number') devs.add(a.device_id);
    const p = a.params;
    if (p && typeof p === 'object') {
      const ch = (p as Record<string, unknown>).channel;
      if (typeof ch === 'number') chs.add(ch);
      const list = (p as Record<string, unknown>).channels;
      if (Array.isArray(list)) list.forEach((v) => typeof v === 'number' && chs.add(v));
      const start = (p as Record<string, unknown>).start;
      const end = (p as Record<string, unknown>).end;
      if (typeof start === 'number' && typeof end === 'number' && end >= start) {
        for (let i = start; i <= end; i++) chs.add(i);
      }
    }
  }
  if (!kind || chs.size === 0) return null;
  return {
    kind,
    channels: [...chs].sort((a, b) => a - b),
    deviceIds: [...devs],
  };
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
        const intent = inferChannelIntent(b);
        // 预览态没有 device retained state，无法显示真实"已开/已关/部分"五态。
        // 改为展示**配置意图**：通道按钮 → "目标 1,3,5 开"，让 admin 一眼看出
        // binding 是否符合预期；非通道按钮 → 保留原"N 动作 · 设备名"摘要。
        let status: string;
        if (intent) {
          const list = intent.channels.length <= 6
            ? intent.channels.join(',')
            : `${intent.channels.length} 路`;
          status = `目标 ${list} ${intent.kind === 'on' ? '开' : '关'}`;
        } else {
          const firstAction = b.actions?.[0];
          const deviceLabel = firstAction?.device_id
            ? nameMaps.device.get(firstAction.device_id) ?? `设备 #${firstAction.device_id}`
            : undefined;
          status = b.actions?.length
            ? `${b.actions.length} 动作${deviceLabel ? ' · ' + deviceLabel : ''}`
            : '未配置';
        }
        return (
          <PanelButtonCell
            key={i}
            tone="command"
            label={b.label || `按钮 ${i + 1}`}
            status={status}
            iconHidden
            titleMaxLines={2}
            statusColor={PT.textDisabled}
            borderColor={PT.glassStroke}
          />
        );
      })}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <PanelButtonCell key={`empty-${i}`} empty />
      ))}
    </div>
  );
}
