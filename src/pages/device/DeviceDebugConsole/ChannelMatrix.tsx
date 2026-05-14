/**
 * device-mgmt-v2 P9-C.2 — 通道矩阵（K32 / 闪优共用）。
 *
 * - K32 单台 8×4 / 双联 16×4 / 三联 24×4（CSS 用 cascade-N 类名切换列数）
 * - 闪优 16 路 8×2（matrixGrid16，无级联）
 * - 单击 = 切换开关（依赖外部 onCellClick 触发 control 命令）
 * - Shift+拖选 = 多选；右键菜单 = [开]/[关]/[闪烁]/[打标签]/[加入指令组]
 * - 状态色：on (黄渐变 + 脉冲)、off (灰)、unknown (dashed 斜纹)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import type { ChannelEntry } from '@/api/channelMap';
import { fromRetainedState, findEntry, type ChannelState } from './state';
import styles from './DeviceDebugConsole.module.scss';

export type MatrixVariant = 'k32' | 'smyoo16' | 'event_listener' | 'generic';

export interface ChannelAction {
  key: 'on' | 'off' | 'blink' | 'label' | 'preset';
  label: string;
}

export interface ChannelMatrixProps {
  total: number;
  channelMap: ChannelEntry[];
  retainedState: Record<string, unknown> | null;
  variant: MatrixVariant;
  /** K32 联级单元数（1-3）。仅 variant=k32 时生效。 */
  cascadeUnits?: number;
  selectedIndexes: Set<number>;
  onSelectionChange: (next: Set<number>) => void;
  /** 单格点击（无修饰键）：默认行为 = 切换开关。 */
  onCellClick: (index: number, currentState: ChannelState) => void;
  /** 右键菜单选项触发（label / preset 由父组件弹窗）。 */
  onCellAction: (action: ChannelAction['key'], indexes: number[]) => void;
}

const CASCADE_CLASS: Record<number, string> = {
  1: '',
  2: styles.cascade2,
  3: styles.cascade3,
};

export default function ChannelMatrix({
  total,
  channelMap,
  retainedState,
  variant,
  cascadeUnits = 1,
  selectedIndexes,
  onSelectionChange,
  onCellClick,
  onCellAction,
}: ChannelMatrixProps) {
  const states = useMemo(() => fromRetainedState(retainedState, total), [retainedState, total]);

  const [dragging, setDragging] = useState<{ start: number; current: number } | null>(null);
  const dragOriginRef = useRef<Set<number>>(new Set());

  // 全局 mouseup 监听：drag 结束。
  useEffect(() => {
    if (!dragging) return;
    const onUp = () => setDragging(null);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [dragging]);

  const isSelected = (idx: number) => {
    if (!dragging) return selectedIndexes.has(idx);
    const lo = Math.min(dragging.start, dragging.current);
    const hi = Math.max(dragging.start, dragging.current);
    return selectedIndexes.has(idx) || (idx >= lo && idx <= hi);
  };

  const handleMouseDown = (e: React.MouseEvent, idx: number) => {
    if (e.button !== 0) return; // 仅左键
    if (e.shiftKey) {
      const next = new Set(selectedIndexes);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      onSelectionChange(next);
      return;
    }
    // 起拖（按住左键移动 → 选区；松开后用差值合并入 selectedIndexes）。
    dragOriginRef.current = new Set(selectedIndexes);
    setDragging({ start: idx, current: idx });
  };

  const handleMouseEnter = (idx: number) => {
    if (!dragging) return;
    setDragging({ ...dragging, current: idx });
  };

  const handleMouseUp = (e: React.MouseEvent, idx: number) => {
    if (e.button !== 0) return;
    if (!dragging) {
      // 单击（未拖）→ 切开关
      onCellClick(idx, states[idx - 1] ?? 'unknown');
      return;
    }
    const lo = Math.min(dragging.start, dragging.current);
    const hi = Math.max(dragging.start, dragging.current);
    if (lo === hi) {
      onCellClick(idx, states[idx - 1] ?? 'unknown');
      setDragging(null);
      return;
    }
    const next = new Set(dragOriginRef.current);
    for (let i = lo; i <= hi; i++) next.add(i);
    onSelectionChange(next);
    setDragging(null);
  };

  const buildMenu = (idx: number): MenuProps['items'] => {
    const targets = selectedIndexes.size > 1 && selectedIndexes.has(idx)
      ? [...selectedIndexes].sort((a, b) => a - b)
      : [idx];
    const multi = targets.length > 1;
    return [
      {
        key: 'on',
        label: multi ? `▶ ${targets.length} 路一起开` : '▶ 开',
        onClick: () => onCellAction('on', targets),
      },
      {
        key: 'off',
        label: multi ? `■ ${targets.length} 路一起关` : '■ 关',
        onClick: () => onCellAction('off', targets),
      },
      {
        key: 'blink',
        label: multi ? `⚡ ${targets.length} 路闪烁` : '⚡ 闪烁',
        onClick: () => onCellAction('blink', targets),
      },
      { type: 'divider' },
      {
        key: 'label',
        label: multi ? `🏷 批量打标签…` : '🏷 打标签…',
        onClick: () => onCellAction('label', targets),
      },
      {
        key: 'preset',
        label: multi ? `💾 加入命令组合…（${targets.length} 路）` : '💾 加入命令组合…',
        onClick: () => onCellAction('preset', targets),
      },
    ];
  };

  const gridClass =
    variant === 'smyoo16'
      ? styles.matrixGrid16
      : `${styles.matrixGrid} ${CASCADE_CLASS[cascadeUnits] ?? ''}`.trim();

  return (
    <div className={gridClass} onMouseLeave={() => setDragging(null)}>
      {Array.from({ length: total }, (_, i) => i + 1).map((idx) => {
        const entry = findEntry(channelMap, idx);
        const state = states[idx - 1] ?? 'unknown';
        const stateCls =
          state === 'on' ? styles.channelOn : state === 'off' ? styles.channelOff : styles.channelUnknown;
        const selectedCls = isSelected(idx) ? styles.channelSelected : '';
        const cell = (
          <div
            key={idx}
            className={`${styles.channel} ${stateCls} ${selectedCls}`.trim()}
            onMouseDown={(e) => handleMouseDown(e, idx)}
            onMouseEnter={() => handleMouseEnter(idx)}
            onMouseUp={(e) => handleMouseUp(e, idx)}
            onContextMenu={(e) => e.preventDefault()}
            title={entry?.label ? `通道 ${idx} · ${entry.label}` : `通道 ${idx} · 未标注`}
          >
            <span className={styles.channelStateDot} />
            <div className={styles.channelNum}>{idx}</div>
            <div
              className={`${styles.channelLabel} ${entry?.label ? '' : styles.channelLabelPlaceholder}`}
            >
              {entry?.label ?? '未标注'}
            </div>
            {entry?.group && <div className={styles.channelGroupTag}>{entry.group}</div>}
          </div>
        );
        return (
          <Dropdown key={idx} menu={{ items: buildMenu(idx) }} trigger={['contextMenu']}>
            {cell}
          </Dropdown>
        );
      })}
    </div>
  );
}
