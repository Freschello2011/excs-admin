import { useRef, useCallback, useState, type CSSProperties } from 'react';
import type { ShowAction, TrackType } from '@/api/gen/client';

/* ==================== Constants ==================== */

const TRACK_TYPE_COLORS: Record<TrackType, string> = {
  video: '#1677ff', light: '#faad14', mechanical: '#722ed1', audio: '#52c41a', custom: '#8c8c8c',
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  device: '设备', scene: '场景', media: '媒体',
};

const EDGE_ZONE = 6; // px from left/right edge to trigger resize cursor
const MIN_DURATION_MS = 100;

/* ==================== Props ==================== */

interface ActionBlockProps {
  action: ShowAction;
  trackType: TrackType;
  zoomLevel: number;          // px per ms
  scrollLeft: number;         // px scroll offset
  selected: boolean;
  onSelect: (id: number, multi: boolean) => void;
  onDoubleClick: (id: number) => void;
  onDragMove: (id: number, newStartMs: number) => void;
  onResize: (id: number, newStartMs: number, newDurationMs: number) => void;
}

/* ==================== Component ==================== */

export default function ActionBlock({
  action, trackType, zoomLevel, scrollLeft, selected,
  onSelect, onDoubleClick, onDragMove, onResize,
}: ActionBlockProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Interaction state
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    mode: 'move' | 'resize-left' | 'resize-right';
    startX: number;
    origStartMs: number;
    origDurationMs: number;
  } | null>(null);

  /* ── Position / size ── */
  const left = action.start_time_ms * zoomLevel - scrollLeft;
  const width = Math.max(action.duration_ms * zoomLevel, 4);
  const bgColor = TRACK_TYPE_COLORS[trackType] ?? '#8c8c8c';

  /* ── Edge detection for cursor ── */
  const getCursorForX = useCallback((clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return 'grab';
    const relX = clientX - rect.left;
    if (relX < EDGE_ZONE) return 'ew-resize';
    if (relX > rect.width - EDGE_ZONE) return 'ew-resize';
    return 'grab';
  }, []);

  const [cursor, setCursor] = useState<string>('grab');

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) setCursor(getCursorForX(e.clientX));
  }, [dragging, getCursorForX]);

  /* ── Mouse down → start drag/resize ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(action.id, e.metaKey || e.ctrlKey);

    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = e.clientX - rect.left;

    let mode: 'move' | 'resize-left' | 'resize-right' = 'move';
    if (relX < EDGE_ZONE) mode = 'resize-left';
    else if (relX > rect.width - EDGE_ZONE) mode = 'resize-right';

    dragState.current = {
      mode,
      startX: e.clientX,
      origStartMs: action.start_time_ms,
      origDurationMs: action.duration_ms,
    };
    setDragging(true);

    const handleGlobalMove = (ev: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = ev.clientX - ds.startX;
      const deltaMsRaw = dx / zoomLevel;

      if (ds.mode === 'move') {
        const newStart = Math.max(0, Math.round(ds.origStartMs + deltaMsRaw));
        onDragMove(action.id, newStart);
      } else if (ds.mode === 'resize-left') {
        const maxDelta = ds.origDurationMs - MIN_DURATION_MS;
        const clampedDelta = Math.min(deltaMsRaw, maxDelta);
        const newStart = Math.max(0, Math.round(ds.origStartMs + clampedDelta));
        const newDuration = Math.max(MIN_DURATION_MS, Math.round(ds.origDurationMs - clampedDelta));
        onResize(action.id, newStart, newDuration);
      } else {
        const newDuration = Math.max(MIN_DURATION_MS, Math.round(ds.origDurationMs + deltaMsRaw));
        onResize(action.id, ds.origStartMs, newDuration);
      }
    };

    const handleGlobalUp = () => {
      dragState.current = null;
      setDragging(false);
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
  }, [action.id, action.start_time_ms, action.duration_ms, zoomLevel, onSelect, onDragMove, onResize]);

  /* ── Double click ── */
  const handleDblClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick(action.id);
  }, [action.id, onDoubleClick]);

  /* ── Style ── */
  const style: CSSProperties = {
    position: 'absolute',
    left,
    top: 2,
    width,
    height: 'calc(100% - 4px)',
    background: bgColor,
    opacity: dragging ? 0.7 : 0.85,
    borderRadius: 3,
    border: selected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
    boxShadow: selected ? `0 0 0 1px ${bgColor}, 0 1px 4px rgba(0,0,0,0.3)` : 'none',
    display: 'flex',
    alignItems: 'center',
    padding: '0 6px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontSize: 11,
    color: '#fff',
    cursor: dragging ? 'grabbing' : cursor,
    userSelect: 'none',
    zIndex: selected ? 10 : 1,
    transition: dragging ? 'none' : 'box-shadow 0.15s',
  };

  const label = action.name || action.command || ACTION_TYPE_LABELS[action.action_type] || '';

  return (
    <div
      ref={ref}
      data-action-id={action.id}
      style={style}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onDoubleClick={handleDblClick}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
        {label}
      </span>
      {width > 60 && (
        <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.7, flexShrink: 0, paddingLeft: 4, pointerEvents: 'none' }}>
          {(action.duration_ms / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}
