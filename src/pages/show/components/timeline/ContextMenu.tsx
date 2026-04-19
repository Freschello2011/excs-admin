import { useEffect, useRef, useCallback } from 'react';

/* ==================== Types ==================== */

export interface MenuPosition {
  x: number;
  y: number;
}

export interface MenuItem {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  visible: boolean;
  position: MenuPosition;
  items: MenuItem[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

/* ==================== Component ==================== */

export default function ContextMenu({ visible, position, items, onSelect, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  /* Close on click outside / Escape */
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleClick, true);
    window.addEventListener('keydown', handleKey, true);
    return () => {
      window.removeEventListener('mousedown', handleClick, true);
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [visible, onClose]);

  /* Clamp position to viewport */
  const menuStyle = useCallback((): React.CSSProperties => {
    const menuW = 180;
    const menuH = items.length * 32 + 8;
    const x = Math.min(position.x, window.innerWidth - menuW - 8);
    const y = Math.min(position.y, window.innerHeight - menuH - 8);
    return {
      position: 'fixed',
      left: x,
      top: y,
      width: menuW,
      zIndex: 9999,
      background: 'var(--ant-color-bg-elevated)',
      borderRadius: 6,
      boxShadow: '0 6px 16px rgba(0,0,0,0.12), 0 3px 6px rgba(0,0,0,0.08)',
      border: '1px solid var(--ant-color-border)',
      padding: '4px 0',
      overflow: 'hidden',
    };
  }, [position, items.length]);

  if (!visible) return null;

  return (
    <div ref={ref} style={menuStyle()}>
      {items.map((item) =>
        item.divider ? (
          <div
            key={item.key}
            style={{ height: 1, margin: '4px 0', background: 'var(--ant-color-border)' }}
          />
        ) : (
          <div
            key={item.key}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) {
                onSelect(item.key);
                onClose();
              }
            }}
            style={{
              padding: '5px 12px',
              fontSize: 13,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              color: item.disabled
                ? 'var(--ant-color-text-disabled)'
                : item.danger
                  ? 'var(--ant-color-error)'
                  : 'var(--ant-color-text)',
              background: 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) (e.currentTarget.style.background = 'var(--ant-color-bg-text-hover)');
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {item.label}
          </div>
        ),
      )}
    </div>
  );
}

/* ==================== Menu builders ==================== */

/** Build menu items for right-clicking on empty track area */
export function buildTrackEmptyMenu(hasClipboard: boolean): MenuItem[] {
  return [
    { key: 'create', label: '创建动作' },
    { key: 'paste', label: '粘贴', disabled: !hasClipboard },
  ];
}

/** Build menu items for right-clicking on an action block */
export function buildActionMenu(): MenuItem[] {
  return [
    { key: 'edit', label: '编辑属性' },
    { key: 'copy', label: '复制' },
    { key: 'divider1', label: '', divider: true },
    { key: 'delete', label: '删除', danger: true },
  ];
}

/** Build menu items for right-clicking on track label */
export function buildTrackLabelMenu(): MenuItem[] {
  return [
    { key: 'rename', label: '重命名轨道' },
    { key: 'divider1', label: '', divider: true },
    { key: 'deleteTrack', label: '删除轨道', danger: true },
  ];
}
