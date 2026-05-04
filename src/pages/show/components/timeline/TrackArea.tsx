import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Tag, Popconfirm, Input, Select, Space, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons';
import {
  useDroppable, DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, type DragEndEvent as SortableDragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ShowTrack, ShowAction, TrackType } from '@/api/gen/client';
import ActionBlock, { type ResizeEdge } from './ActionBlock';
import ContextMenu, {
  buildTrackEmptyMenu, buildActionMenu, buildTrackLabelMenu,
  type MenuPosition, type MenuItem,
} from './ContextMenu';

/* ==================== Constants ==================== */

export const TRACK_H = 40; // px per track row

const TRACK_TYPE_LABELS: Record<TrackType, string> = {
  video: '视频', light: '灯光', mechanical: '机械', audio: '音频', custom: '自定义',
};

const TRACK_TYPE_COLORS: Record<TrackType, string> = {
  video: '#1677ff', light: '#faad14', mechanical: '#722ed1', audio: '#52c41a', custom: '#8c8c8c',
};

const TRACK_TYPE_OPTIONS: { label: string; value: TrackType }[] = [
  { label: '视频', value: 'video' },
  { label: '灯光', value: 'light' },
  { label: '机械', value: 'mechanical' },
  { label: '音频', value: 'audio' },
  { label: '自定义', value: 'custom' },
];

/* ==================== Sortable track label ==================== */
//
// Batch C P10：左侧轨道列拖手柄重排。手柄 = HolderOutlined（仅手柄触发拖拽，
// 防止误拖名称区或删除按钮）。与 PanelEditorPage 同款（@dnd-kit/sortable）。

function SortableTrackLabel({
  track, isRenaming, renameValue, onRenameChange, onRenameConfirm,
  onLabelContextMenu, onRemove,
}: {
  track: ShowTrack;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onLabelContextMenu: (e: React.MouseEvent) => void;
  onRemove: () => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: `track-label-${track.id}` });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    height: TRACK_H,
    display: 'flex',
    alignItems: 'center',
    padding: '0 4px 0 2px',
    borderBottom: '1px solid var(--ant-color-border)',
    gap: 4,
    fontSize: 12,
    background: isDragging ? 'var(--ant-color-bg-elevated)' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onContextMenu={onLabelContextMenu}
    >
      <Tooltip title="长按拖动重排" placement="right">
        <span
          {...listeners}
          style={{
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--ant-color-text-quaternary)',
            padding: '0 2px',
          }}
        >
          <HolderOutlined style={{ fontSize: 12 }} />
        </span>
      </Tooltip>
      <Tag
        color={TRACK_TYPE_COLORS[track.track_type as TrackType]}
        style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 4px' }}
      >
        {TRACK_TYPE_LABELS[track.track_type as TrackType]}
      </Tag>
      {isRenaming ? (
        <Input
          size="small"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onPressEnter={onRenameConfirm}
          onBlur={onRenameConfirm}
          autoFocus
          style={{ flex: 1 }}
        />
      ) : (
        <span style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {track.name}
        </span>
      )}
      <Popconfirm
        title="确认删除该轨道？"
        description="轨道内的所有动作也将被删除"
        onConfirm={onRemove}
        okText="删除"
        cancelText="取消"
      >
        <Button
          type="text" size="small" danger
          icon={<DeleteOutlined />}
          style={{ fontSize: 11 }}
        />
      </Popconfirm>
    </div>
  );
}

/* ==================== Droppable track row ==================== */

function DroppableTrackRow({
  track, totalWidth, zoomLevel, scrollLeft, selectedActionIds,
  onSelectAction, onDoubleClickAction, onDragMoveAction, onResizeAction,
  onActionDragEnd, onAddAction, onContextMenu,
}: {
  track: ShowTrack;
  totalWidth: number;
  zoomLevel: number;
  scrollLeft: number;
  selectedActionIds: Set<number>;
  onSelectAction: (id: number, multi: boolean) => void;
  onDoubleClickAction: (id: number) => void;
  onDragMoveAction: (id: number, newStartMs: number, shift: boolean) => void;
  onResizeAction: (id: number, newStartMs: number, newDurationMs: number, edge: ResizeEdge, shift: boolean) => void;
  onActionDragEnd: (id: number) => void;
  onAddAction: (trackId: number) => void;
  onContextMenu: (e: React.MouseEvent, trackId: number, actionId?: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `track-${track.id}`,
    data: { trackId: track.id },
  });

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.trackRow !== 'true') return;
    onAddAction(track.id);
  }, [track.id, onAddAction]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Check if right-click landed on an action block
    const actionEl = (e.target as HTMLElement).closest('[data-action-id]');
    const actionId = actionEl ? Number((actionEl as HTMLElement).dataset.actionId) : undefined;
    onContextMenu(e, track.id, actionId);
  }, [track.id, onContextMenu]);

  return (
    <div
      ref={setNodeRef}
      data-track-row="true"
      onDoubleClick={handleDblClick}
      onContextMenu={handleContextMenu}
      style={{
        height: TRACK_H, position: 'relative',
        borderBottom: '1px solid var(--ant-color-border)',
        minWidth: '100%',
        width: totalWidth,
        background: isOver ? 'rgba(22, 119, 255, 0.06)' : undefined,
        transition: 'background 0.15s',
      }}
    >
      {track.actions.map((action: ShowAction) => (
        <ActionBlock
          key={action.id}
          action={action}
          trackType={track.track_type as TrackType}
          zoomLevel={zoomLevel}
          scrollLeft={scrollLeft}
          selected={selectedActionIds.has(action.id)}
          onSelect={onSelectAction}
          onDoubleClick={onDoubleClickAction}
          onDragMove={onDragMoveAction}
          onResize={onResizeAction}
          onDragEnd={onActionDragEnd}
        />
      ))}
    </div>
  );
}

/* ==================== Props ==================== */

interface TrackAreaProps {
  tracks: ShowTrack[];
  totalDurationMs: number;
  zoomLevel: number;
  scrollLeft: number;
  selectedActionIds: Set<number>;
  hasClipboard: boolean;
  onAddTrack: (name: string, trackType: TrackType) => void;
  onRemoveTrack: (trackId: number) => void;
  onRenameTrack: (trackId: number, name: string) => void;
  /** Batch C P10：轨道重排（fromIdx/toIdx 基于当前 tracks 数组顺序） */
  onReorderTrack: (fromIdx: number, toIdx: number) => void;
  onSelectAction: (id: number, multi: boolean) => void;
  onDoubleClickAction: (id: number) => void;
  onClearSelection: () => void;
  onDragMoveAction: (id: number, newStartMs: number, shift: boolean) => void;
  onResizeAction: (id: number, newStartMs: number, newDurationMs: number, edge: ResizeEdge, shift: boolean) => void;
  onActionDragEnd: (id: number) => void;
  onAddAction: (trackId: number) => void;
  onScrollLeftChange: (px: number) => void;
  /** Ctrl+wheel 锚点缩放：(level, anchorPx, viewportWidth) */
  onZoomAtAnchor: (level: number, anchorPx: number, viewportWidth: number) => void;
  onCopySelected: () => void;
  onPaste: (trackId: number, atMs: number) => void;
  onDeleteSelected: () => void;
  currentTimeMs: number;
  /** Snap hint ms（拖动时高亮）；null 不渲染 */
  snapHintMs: number | null;
}

/* ==================== Component ==================== */

export default function TrackArea({
  tracks, totalDurationMs, zoomLevel, scrollLeft, selectedActionIds, hasClipboard,
  onAddTrack, onRemoveTrack, onRenameTrack, onReorderTrack,
  onSelectAction, onDoubleClickAction,
  onClearSelection, onDragMoveAction, onResizeAction, onActionDragEnd, onAddAction,
  onScrollLeftChange, onZoomAtAnchor, onCopySelected, onPaste, onDeleteSelected,
  currentTimeMs, snapHintMs,
}: TrackAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Sortable sensors（独立于动作库 DnD 的 PointerSensor，仅手柄触发） */
  const sortableSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleSortableDragEnd = useCallback((e: SortableDragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromIdx = tracks.findIndex((t) => `track-label-${t.id}` === String(active.id));
    const toIdx = tracks.findIndex((t) => `track-label-${t.id}` === String(over.id));
    if (fromIdx < 0 || toIdx < 0) return;
    onReorderTrack(fromIdx, toIdx);
  }, [tracks, onReorderTrack]);

  /* ── Add track popover state ── */
  const [addOpen, setAddOpen] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const [newTrackType, setNewTrackType] = useState<TrackType>('light');

  /* ── Context menu state ── */
  const [ctxMenu, setCtxMenu] = useState<{
    visible: boolean;
    position: MenuPosition;
    items: MenuItem[];
    context: { trackId?: number; actionId?: number; menuType: 'trackEmpty' | 'action' | 'trackLabel' };
  }>({ visible: false, position: { x: 0, y: 0 }, items: [], context: { menuType: 'trackEmpty' } });

  /* ── Rename state ── */
  const [renamingTrackId, setRenamingTrackId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleAddTrack = useCallback(() => {
    const name = newTrackName.trim() || `${TRACK_TYPE_LABELS[newTrackType]}轨道`;
    onAddTrack(name, newTrackType);
    setNewTrackName('');
    setAddOpen(false);
  }, [newTrackName, newTrackType, onAddTrack]);

  /* ── Click on empty area → clear selection ── */
  const handleAreaClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClearSelection();
  }, [onClearSelection]);

  /* ── Wheel：Ctrl/⌘+滚轮 = 锚点缩放；否则 = 横向滚动
     React 17+ 的 onWheel 是 passive listener，preventDefault() 会被忽略——
     必须用 addEventListener('wheel', handler, { passive: false }) 注册原生
     listener，并 stopPropagation 阻止冒泡到 admin layout 触发横向滚出可视区。 */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.deltaY === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const rect = el.getBoundingClientRect();
        const anchorPx = e.clientX - rect.left;
        const vpWidth = el.clientWidth || rect.width;
        onZoomAtAnchor(zoomLevel * factor, anchorPx, vpWidth);
        return;
      }
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (dx === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const totalWidth = totalDurationMs * zoomLevel;
      const vpWidth = el.clientWidth || 0;
      const maxScroll = Math.max(0, totalWidth - vpWidth);
      onScrollLeftChange(Math.max(0, Math.min(maxScroll, scrollLeft + dx)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [totalDurationMs, zoomLevel, scrollLeft, onScrollLeftChange, onZoomAtAnchor]);

  /* ── Track area right-click ── */
  const handleTrackContextMenu = useCallback((e: React.MouseEvent, trackId: number, actionId?: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (actionId) {
      // Right-click on action block
      onSelectAction(actionId, false);
      setCtxMenu({
        visible: true,
        position: { x: e.clientX, y: e.clientY },
        items: buildActionMenu(),
        context: { trackId, actionId, menuType: 'action' },
      });
    } else {
      // Right-click on empty track
      setCtxMenu({
        visible: true,
        position: { x: e.clientX, y: e.clientY },
        items: buildTrackEmptyMenu(hasClipboard),
        context: { trackId, menuType: 'trackEmpty' },
      });
    }
  }, [onSelectAction, hasClipboard]);

  /* ── Track label right-click ── */
  const handleLabelContextMenu = useCallback((e: React.MouseEvent, trackId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      visible: true,
      position: { x: e.clientX, y: e.clientY },
      items: buildTrackLabelMenu(),
      context: { trackId, menuType: 'trackLabel' },
    });
  }, []);

  /* ── Context menu action handler ── */
  const handleCtxMenuSelect = useCallback((key: string) => {
    const { trackId, actionId, menuType } = ctxMenu.context;

    if (menuType === 'action' && actionId) {
      switch (key) {
        case 'edit':
          onDoubleClickAction(actionId);
          break;
        case 'copy':
          onSelectAction(actionId, false);
          onCopySelected();
          break;
        case 'delete':
          onDeleteSelected();
          break;
      }
    } else if (menuType === 'trackEmpty' && trackId) {
      switch (key) {
        case 'create':
          onAddAction(trackId);
          break;
        case 'paste':
          onPaste(trackId, Math.round(currentTimeMs));
          break;
      }
    } else if (menuType === 'trackLabel' && trackId) {
      switch (key) {
        case 'rename': {
          const track = tracks.find((t) => t.id === trackId);
          if (track) {
            setRenamingTrackId(trackId);
            setRenameValue(track.name);
          }
          break;
        }
        case 'deleteTrack':
          onRemoveTrack(trackId);
          break;
      }
    }
  }, [ctxMenu.context, tracks, onDoubleClickAction, onSelectAction, onCopySelected, onDeleteSelected, onAddAction, onPaste, onRemoveTrack, currentTimeMs]);

  const handleRenameConfirm = useCallback(() => {
    if (renamingTrackId != null && renameValue.trim()) {
      onRenameTrack(renamingTrackId, renameValue.trim());
    }
    setRenamingTrackId(null);
    setRenameValue('');
  }, [renamingTrackId, renameValue, onRenameTrack]);

  const totalWidth = totalDurationMs * zoomLevel;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
      {/* ── Left: track labels ── */}
      <div
        style={{
          width: 100, flexShrink: 0,
          borderRight: '1px solid var(--ant-color-border-secondary)',
          background: 'var(--ant-color-bg-layout)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Track label rows — Batch C P10：dnd-kit Sortable 重排 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <DndContext
            sensors={sortableSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSortableDragEnd}
          >
            <SortableContext
              items={tracks.map((t) => `track-label-${t.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {tracks.map((track) => (
                <SortableTrackLabel
                  key={track.id}
                  track={track}
                  isRenaming={renamingTrackId === track.id}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onRenameConfirm={handleRenameConfirm}
                  onLabelContextMenu={(e) => handleLabelContextMenu(e, track.id)}
                  onRemove={() => onRemoveTrack(track.id)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add track button */}
          <div style={{ padding: '8px', borderBottom: '1px solid var(--ant-color-border)' }}>
            {addOpen ? (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Select
                  size="small" value={newTrackType} onChange={setNewTrackType}
                  options={TRACK_TYPE_OPTIONS} style={{ width: '100%' }}
                />
                <Input
                  size="small" placeholder="轨道名称（可选）"
                  value={newTrackName} onChange={(e) => setNewTrackName(e.target.value)}
                  onPressEnter={handleAddTrack}
                />
                <Space size={4}>
                  <Button size="small" type="primary" onClick={handleAddTrack}>添加</Button>
                  <Button size="small" onClick={() => setAddOpen(false)}>取消</Button>
                </Space>
              </Space>
            ) : (
              <Button
                type="dashed" size="small" block
                icon={<PlusOutlined />}
                onClick={() => setAddOpen(true)}
              >
                添加轨道
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: action track area (horizontally scrollable) ── */}
      <div
        ref={scrollRef}
        onClick={handleAreaClick}
        style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          background: 'var(--ant-color-bg-container)',
        }}
      >
        {tracks.map((track) => (
          <DroppableTrackRow
            key={track.id}
            track={track}
            totalWidth={totalWidth}
            zoomLevel={zoomLevel}
            scrollLeft={scrollLeft}
            selectedActionIds={selectedActionIds}
            onSelectAction={onSelectAction}
            onDoubleClickAction={onDoubleClickAction}
            onDragMoveAction={onDragMoveAction}
            onResizeAction={onResizeAction}
            onActionDragEnd={onActionDragEnd}
            onAddAction={onAddAction}
            onContextMenu={handleTrackContextMenu}
          />
        ))}

        {/* Snap hint overlay — 拖动期间高亮的对齐位置 */}
        {snapHintMs != null && (() => {
          const x = snapHintMs * zoomLevel - scrollLeft;
          if (x < 0 || x > totalWidth) return null;
          return (
            <div
              style={{
                position: 'absolute',
                left: x,
                top: 0,
                bottom: 0,
                width: 1,
                background: '#ff4d4f',
                boxShadow: '0 0 4px rgba(255,77,79,0.6)',
                pointerEvents: 'none',
                zIndex: 20,
              }}
            />
          );
        })()}

        {tracks.length === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 200, color: 'var(--ant-color-text-quaternary)',
          }}>
            点击左侧"添加轨道"开始编排
          </div>
        )}
      </div>

      {/* ── Context Menu ── */}
      <ContextMenu
        visible={ctxMenu.visible}
        position={ctxMenu.position}
        items={ctxMenu.items}
        onSelect={handleCtxMenuSelect}
        onClose={() => setCtxMenu((s) => ({ ...s, visible: false }))}
      />
    </div>
  );
}
