import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 轻量级垂直分隔（top/bottom）。比例存 localStorage（可选）。
 * 用法：<SplitPane top={...} bottom={...} initialRatio={0.3} storageKey="..." />
 */
interface Props {
  top: ReactNode;
  bottom: ReactNode;
  initialRatio?: number;       // top 占比（0-1）
  storageKey?: string;         // localStorage key
  minTopPx?: number;
  minBottomPx?: number;
}

export default function SplitPane({
  top, bottom,
  initialRatio = 0.3,
  storageKey,
  minTopPx = 80,
  minBottomPx = 120,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [ratio, setRatio] = useState<number>(() => {
    if (storageKey) {
      const raw = localStorage.getItem(storageKey);
      const v = raw ? parseFloat(raw) : NaN;
      if (!isNaN(v) && v > 0.05 && v < 0.95) return v;
    }
    return initialRatio;
  });
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) return;
      let r = (ev.clientY - rect.top) / rect.height;
      const minR = minTopPx / rect.height;
      const maxR = 1 - minBottomPx / rect.height;
      if (r < minR) r = minR;
      if (r > maxR) r = maxR;
      setRatio(r);
    };
    const onUp = () => {
      setDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, minTopPx, minBottomPx]);

  // 拖动结束后落盘
  useEffect(() => {
    if (dragging || !storageKey) return;
    localStorage.setItem(storageKey, String(ratio));
  }, [dragging, ratio, storageKey]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: `0 0 calc(${ratio * 100}% - 2px)`, minHeight: minTopPx, overflow: 'hidden' }}>
        {top}
      </div>
      <div
        onMouseDown={onMouseDown}
        style={{
          flex: '0 0 4px',
          cursor: 'row-resize',
          background: dragging ? 'var(--ant-color-primary)' : 'var(--ant-color-border-secondary)',
          transition: dragging ? 'none' : 'background 0.15s',
          flexShrink: 0,
          zIndex: 5,
        }}
      />
      <div style={{ flex: 1, minHeight: minBottomPx, overflow: 'hidden' }}>
        {bottom}
      </div>
    </div>
  );
}
