import { useCallback, useRef, useState } from 'react';
import { Button, Tag, Popconfirm, Input, Select, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useDroppable } from '@dnd-kit/core';
import type { ShowTrack, ShowAction, TrackType } from '@/types/show';
import ActionBlock from './ActionBlock';
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

/* ==================== Droppable track row ==================== */

function DroppableTrackRow({
  track, totalWidth, zoomLevel, scrollLeft, selectedActionIds,
  onSelectAction, onDoubleClickAction, onDragMoveAction, onResizeAction,
  onAddAction, onContextMenu,
}: {
  track: ShowTrack;
  totalWidth: number;
  zoomLevel: number;
  scrollLeft: number;
  selectedActionIds: Set<number>;
  onSelectAction: (id: number, multi: boolean) => void;
  onDoubleClickAction: (id: number) => void;
  onDragMoveAction: (id: number, newStartMs: number) => void;
  onResizeAction: (id: number, newStartMs: number, newDurationMs: number) => void;
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
          trackType={track.track_type}
          zoomLevel={zoomLevel}
          scrollLeft={scrollLeft}
          selected={selectedActionIds.has(action.id)}
          onSelect={onSelectAction}
          onDoubleClick={onDoubleClickAction}
          onDragMove={onDragMoveAction}
          onResize={onResizeAction}
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
  onSelectAction: (id: number, multi: boolean) => void;
  onDoubleClickAction: (id: number) => void;
  onClearSelection: () => void;
  onDragMoveAction: (id: number, newStartMs: number) => void;
  onResizeAction: (id: number, newStartMs: number, newDurationMs: number) => void;
  onAddAction: (trackId: number) => void;
  onScrollLeftChange: (px: number) => void;
  onCopySelected: () => void;
  onPaste: (trackId: number, atMs: number) => void;
  onDeleteSelected: () => void;
  currentTimeMs: number;
}

/* ==================== Component ==================== */

export default function TrackArea({
  tracks, totalDurationMs, zoomLevel, scrollLeft, selectedActionIds, hasClipboard,
  onAddTrack, onRemoveTrack, onRenameTrack,
  onSelectAction, onDoubleClickAction,
  onClearSelection, onDragMoveAction, onResizeAction, onAddAction,
  onScrollLeftChange, onCopySelected, onPaste, onDeleteSelected, currentTimeMs,
}: TrackAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  /* ── Wheel → horizontal scroll ── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
    if (dx === 0) return;
    e.preventDefault();
    const totalWidth = totalDurationMs * zoomLevel;
    const vpWidth = scrollRef.current?.clientWidth ?? 0;
    const maxScroll = Math.max(0, totalWidth - vpWidth);
    onScrollLeftChange(Math.max(0, Math.min(maxScroll, scrollLeft + dx)));
  }, [totalDurationMs, zoomLevel, scrollLeft, onScrollLeftChange]);

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
        {/* Track label rows */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {tracks.map((track) => (
            <div
              key={track.id}
              onContextMenu={(e) => handleLabelContextMenu(e, track.id)}
              style={{
                height: TRACK_H, display: 'flex', alignItems: 'center',
                padding: '0 8px', borderBottom: '1px solid var(--ant-color-border)',
                gap: 6, fontSize: 12,
              }}
            >
              <Tag
                color={TRACK_TYPE_COLORS[track.track_type]}
                style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 4px' }}
              >
                {TRACK_TYPE_LABELS[track.track_type]}
              </Tag>
              {renamingTrackId === track.id ? (
                <Input
                  size="small"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onPressEnter={handleRenameConfirm}
                  onBlur={handleRenameConfirm}
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
                onConfirm={() => onRemoveTrack(track.id)}
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
          ))}

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
        onWheel={handleWheel}
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
            onAddAction={onAddAction}
            onContextMenu={handleTrackContextMenu}
          />
        ))}

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
