import type { CSSProperties, ReactNode } from 'react';
import { PT, SCENE_NEON } from './previewTokens';

/**
 * 中控面板改版 P2 — 按钮单元统一组件（admin 预览端实现）。
 *
 * 跨 scene_group / device_toggle / device_command 三种卡共用：
 *   - 同一对 token (--cell-h / --cell-radius / --cell-stroke / ...)
 *   - 同一种"积木"视觉（容器宽不变内容布局，玻璃 + 可选霓虹外发光）
 *
 * 调用方负责把 cells 包进 grid 容器（auto-fill / repeat(n,1fr)），并用 CELL_VARS 注入变量。
 */

export type PanelButtonCellTone = 'scene' | 'device' | 'command' | 'offline' | 'empty';

interface Props {
  /** 主标签（顶部，常规字号 16）。empty=true 时不渲染 */
  label?: ReactNode;
  /** 状态文字（底部小字，[ 运行中 ] / [ 关 ] / 离线 / null）。empty=true 时不渲染 */
  status?: ReactNode;
  /** 状态文字颜色（默认按 tone 推） */
  statusColor?: string;
  /** 右上角小图标（22×22 描边方块占位） */
  iconSlot?: ReactNode;
  /** 按下 / 高亮态（运行中 / pressed） */
  pressed?: boolean;
  /** 视觉 tone：决定描边色 + 外发光 */
  tone?: PanelButtonCellTone;
  /** 描边占位单元（无内容、无交互、无背景） */
  empty?: boolean;
  /** 点击回调 */
  onClick?: () => void;
}

/** tone → (border, insetRim, glowEnabled) */
function toneColors(tone: PanelButtonCellTone): { border: string; rim: string; glow: string | null } {
  switch (tone) {
    case 'scene':
    case 'command':
      return {
        border: 'rgba(179,136,255,0.55)', // 紫
        rim: 'rgba(179,136,255,0.25)',
        glow: '0 0 22px rgba(179,136,255,0.32), 0 0 46px rgba(179,136,255,0.14)',
      };
    case 'device':
      return {
        border: PT.glassStroke,
        rim: 'rgba(255,255,255,0.05)',
        glow: null,
      };
    case 'offline':
      return {
        border: 'rgba(255,107,122,0.55)', // coral
        rim: 'rgba(255,107,122,0.25)',
        glow: '0 0 16px rgba(255,107,122,0.35), 0 0 32px rgba(255,107,122,0.15)',
      };
    case 'empty':
    default:
      return { border: 'rgba(255,255,255,0.05)', rim: 'rgba(255,255,255,0.02)', glow: null };
  }
}

export default function PanelButtonCell({
  label,
  status,
  statusColor,
  iconSlot,
  pressed,
  tone = 'scene',
  empty,
  onClick,
}: Props) {
  if (empty) {
    // 描边占位单元 — 同尺寸、空内容、几乎无感
    const style: CSSProperties = {
      minHeight: 'var(--cell-h)',
      borderRadius: 'var(--cell-radius)',
      background:
        'linear-gradient(135deg,rgba(255,255,255,.018),rgba(255,255,255,.006))',
      border: '1px solid var(--cell-stroke-empty)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.02)',
      position: 'relative',
      boxSizing: 'border-box',
    };
    return <div style={style} aria-hidden />;
  }

  const colors = toneColors(tone);
  const showGlow = pressed && colors.glow;
  const style: CSSProperties = {
    minHeight: 'var(--cell-h)',
    padding: 'var(--cell-padding)',
    borderRadius: 'var(--cell-radius)',
    background: 'var(--cell-bg)',
    border: `1.5px solid ${colors.border}`,
    backdropFilter: 'var(--cell-blur)',
    WebkitBackdropFilter: 'var(--cell-blur)',
    boxShadow: showGlow
      ? `${colors.glow}, inset 0 0 0 1px ${colors.rim}`
      : `inset 0 0 0 1px ${colors.rim}`,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    position: 'relative',
    cursor: onClick ? 'pointer' : undefined,
    transition: 'transform .15s, box-shadow .15s',
  };

  const labelColor = PT.textPrimary;
  const finalStatusColor =
    statusColor ?? (pressed ? PT.neonMint : tone === 'offline' ? PT.neonCoral : PT.textDisabled);

  return (
    <div style={style} onClick={onClick}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 'var(--cell-title-fs)',
            fontWeight: 600,
            color: labelColor,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {label}
        </div>
        {iconSlot ?? (
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              border: `1.5px solid ${tone === 'device' ? PT.textTertiary : SCENE_NEON}`,
              flexShrink: 0,
              opacity: pressed ? 1 : 0.7,
            }}
          />
        )}
      </div>
      {status != null && (
        <div
          style={{
            fontSize: 'var(--cell-status-fs)',
            color: finalStatusColor,
            letterSpacing: '0.05em',
            marginTop: 6,
          }}
        >
          {typeof status === 'string' ? `[ ${status} ]` : status}
        </div>
      )}
      {pressed && tone !== 'device' && (
        <span
          style={{
            position: 'absolute',
            top: 10,
            right: 12,
            fontSize: 11,
            color: SCENE_NEON,
          }}
        >
          当前
        </span>
      )}
    </div>
  );
}
