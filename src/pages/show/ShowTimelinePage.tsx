import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Button, Space, Tag, Slider, Spin, Badge, Select, Modal,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import {
  ArrowLeftOutlined, SaveOutlined,
  ZoomInOutlined, ZoomOutOutlined,
  CaretRightOutlined, PauseOutlined,
  UndoOutlined, RedoOutlined,
  ThunderboltOutlined, StopOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, DragOverlay,
} from '@dnd-kit/core';
import { showApi } from '@/api/show';
import { contentApi } from '@/api/content';
import { queryKeys } from '@/api/queryKeys';
import { useTimelineStore } from '@/stores/timelineStore';
import type { ShowAction, TrackType, SaveTimelineBody } from '@/types/show';
import type { ContentListItem } from '@/types/content';
import {
  TimeRuler, SpriteStrip, WaveformStrip, PlaybackCursor,
  TrackArea, PropertyPanel, VideoPreview,
  usePlaybackEngine, useRehearsal, ActionLibrary, useTimelineKeyboard,
} from './components/timeline';
import type { DragData } from './components/timeline/ActionLibrary';

/* ==================== Constants ==================== */

/** Ruler + Sprite + Waveform heights */
const REF_RULER_H = 20;
const REF_SPRITE_H = 32;
const REF_WAVE_H = 32;
const REF_TOTAL_H = REF_RULER_H + REF_SPRITE_H + REF_WAVE_H;
const PROP_PANEL_W = 260;

/** Format milliseconds to mm:ss */
function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/* ==================== Component ==================== */

export default function ShowTimelinePage() {
  const { message } = useMessage();
  const { showId: showIdStr } = useParams<{ showId: string }>();
  const showId = Number(showIdStr);
  const navigate = useNavigate();

  const {
    show, tracks, dirty, view, spriteSheets, waveformPeaks,
    selectedActionIds, clipboard,
    loadShow, markClean,
    addTrack, removeTrack, renameTrack, updateAction, addAction,
    selectAction, clearSelection, toggleActionSelection,
    setZoomLevel, setScrollLeft, reset,
    undo, redo, canUndo, canRedo,
    copySelected, paste,
  } = useTimelineStore();

  /* Playback engine */
  const { toggle, seek, isPlaying, currentTimeMs, totalTimeMs } = usePlaybackEngine();

  /* Rehearsal controls */
  const rehearsal = useRehearsal(showId);

  /* Keyboard shortcuts — single hook handles all keys */
  useTimelineKeyboard(toggle);

  /* Derived total duration */
  const totalDurationMs = show
    ? (show.pre_roll_ms ?? 0) + show.duration_ms + (show.post_roll_ms ?? 0)
    : 0;

  /* Reference panel container */
  const refPanelRef = useRef<HTMLDivElement>(null);
  const [refVpWidth, setRefVpWidth] = useState(0);

  /* Measure viewport width */
  const showLoaded = !!show;
  useEffect(() => {
    const el = refPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRefVpWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showLoaded]);

  /* Wheel → virtual horizontal scroll for reference panel */
  const handleRefWheel = useCallback((e: React.WheelEvent) => {
    const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
    if (dx === 0) return;
    e.preventDefault();
    const maxScroll = Math.max(0, totalDurationMs * view.zoomLevel - refVpWidth);
    setScrollLeft(Math.max(0, Math.min(maxScroll, view.scrollLeft + dx)));
  }, [view.zoomLevel, view.scrollLeft, refVpWidth, totalDurationMs, setScrollLeft]);

  /* ── DnD sensors ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /* ── DnD active item state for overlay ── */
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  /* ── DnD handlers ── */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return;
    switch (data.type) {
      case 'device': setDragLabel(data.command.name); break;
      case 'scene': setDragLabel(data.scene.name); break;
      case 'media': setDragLabel(data.content.name); break;
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragLabel(null);
    const { active, over } = event;
    if (!over) return;

    const data = active.data.current as DragData | undefined;
    if (!data) return;

    // Over target must be a track
    const trackId = (over.data.current as { trackId?: number })?.trackId;
    if (!trackId) return;

    // Calculate drop time from pointer position
    // The over element is the track row; use the delta to estimate time
    const trackEl = over.rect;
    const pointerX = (event.activatorEvent as PointerEvent)?.clientX ?? 0;
    const deltaX = event.delta.x;
    const dropX = pointerX + deltaX - trackEl.left;
    const dropTimeMs = Math.max(0, Math.round((dropX + view.scrollLeft) / view.zoomLevel));

    // Create action based on drag data type
    const tempId = -(Date.now() % 1_000_000) - Math.floor(Math.random() * 10000);

    let newAction: ShowAction;
    switch (data.type) {
      case 'device':
        newAction = {
          id: tempId,
          device_id: null,
          device_name: '',
          name: data.command.name,
          action_type: 'device',
          start_time_ms: dropTimeMs,
          duration_ms: 2000,
          command: data.command.code,
          params: {},
        };
        break;
      case 'scene':
        newAction = {
          id: tempId,
          device_id: null,
          device_name: '',
          name: data.scene.name,
          action_type: 'scene',
          start_time_ms: dropTimeMs,
          duration_ms: 3000,
          command: String(data.scene.id),
          params: {},
        };
        break;
      case 'media':
        newAction = {
          id: tempId,
          device_id: null,
          device_name: '',
          name: data.content.name,
          action_type: 'media',
          start_time_ms: dropTimeMs,
          duration_ms: data.content.duration > 0 ? data.content.duration : 5000,
          command: String(data.content.id),
          params: {},
        };
        break;
    }

    addAction(trackId, newAction);
    clearSelection();
    selectAction(tempId);
  }, [view.scrollLeft, view.zoomLevel, addAction, clearSelection, selectAction]);

  const handleDragCancel = useCallback(() => {
    setDragLabel(null);
  }, []);

  /* ── Fetch show data ── */
  const { isLoading } = useQuery({
    queryKey: queryKeys.showDetail(showId),
    queryFn: () => showApi.getShow(showId),
    select: (res) => res.data.data,
    enabled: showId > 0,
    placeholderData: undefined,
  });

  const { data: showData } = useQuery({
    queryKey: queryKeys.showDetail(showId),
    queryFn: () => showApi.getShow(showId),
    select: (res) => res.data.data,
    enabled: showId > 0,
  });

  useEffect(() => {
    if (showData) loadShow(showData);
  }, [showData, loadShow]);

  useEffect(() => () => { reset(); }, [reset]);

  /* ── Base video selector ── */
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<number | undefined>();

  const { data: videoContents } = useQuery({
    queryKey: queryKeys.contents({ hall_id: show?.hall_id ?? 0, page: 1, page_size: 200, status: 'ready' }),
    queryFn: () => contentApi.listContents({ hall_id: show!.hall_id, page: 1, page_size: 200, status: 'ready' as never }),
    select: (res) => (res.data.data?.list ?? []).filter((c: ContentListItem) => c.type === 'video'),
    enabled: !!show?.hall_id,
  });
  const videoOptions = (videoContents ?? []).map((c: ContentListItem) => {
    const dur = c.duration > 0 ? ` (${Math.floor(c.duration / 60000)}:${String(Math.floor((c.duration % 60000) / 1000)).padStart(2, '0')})` : '';
    return { value: c.id, label: `${c.name}${dur}`, duration: c.duration };
  });

  const updateShowMutation = useMutation({
    mutationFn: (data: { base_content_id: number; duration_ms: number }) =>
      showApi.updateShow(showId, data),
    onSuccess: () => {
      message.success('基准视频已更新');
      setVideoModalOpen(false);
      // Refetch show data
      window.location.reload();
    },
    onError: () => { message.error('更新失败'); },
  });

  const handleVideoConfirm = useCallback(() => {
    if (!selectedVideoId) return;
    const v = videoOptions.find((o) => o.value === selectedVideoId);
    updateShowMutation.mutate({
      base_content_id: selectedVideoId,
      duration_ms: v?.duration ?? show?.duration_ms ?? 60000,
    });
  }, [selectedVideoId, videoOptions, show, updateShowMutation]);

  /* ── Save mutation ── */
  const saveMutation = useMutation({
    mutationFn: (body: SaveTimelineBody) => showApi.saveTimeline(showId, body),
    onSuccess: (res) => {
      message.success('时间轴已保存');
      markClean();
      const newShow = res.data.data;
      if (newShow) loadShow(newShow);
    },
    onError: () => { message.error('保存失败'); },
  });

  /* ── Save handler — build body from store tracks ── */
  const handleSave = useCallback(() => {
    if (!show) return;
    const body: SaveTimelineBody = {
      tracks: tracks.map((t) => ({
        id: t.id > 0 ? t.id : undefined,
        name: t.name,
        track_type: t.track_type,
        sort_order: t.sort_order,
        actions: t.actions.map((a) => ({
          id: a.id > 0 ? a.id : undefined,
          device_id: a.device_id,
          name: a.name,
          action_type: a.action_type,
          start_time_ms: a.start_time_ms,
          duration_ms: a.duration_ms,
          command: a.command,
          params: a.params ?? {},
        })),
      })),
    };
    saveMutation.mutate(body);
  }, [show, tracks, saveMutation]);

  /* ── Track callbacks ── */
  const handleAddTrack = useCallback((name: string, trackType: TrackType) => {
    addTrack(name, trackType);
  }, [addTrack]);

  const handleRemoveTrack = useCallback((trackId: number) => {
    removeTrack(trackId);
  }, [removeTrack]);

  const handleRenameTrack = useCallback((trackId: number, name: string) => {
    renameTrack(trackId, name);
  }, [renameTrack]);

  /* ── Action callbacks ── */
  const handleSelectAction = useCallback((id: number, multi: boolean) => {
    if (multi) {
      toggleActionSelection(id);
    } else {
      clearSelection();
      selectAction(id);
    }
  }, [toggleActionSelection, clearSelection, selectAction]);

  const handleDoubleClickAction = useCallback((_id: number) => {
    // Double-click focuses the property panel (selection is already handled by mousedown)
  }, []);

  const handleDragMoveAction = useCallback((id: number, newStartMs: number) => {
    updateAction(id, { start_time_ms: newStartMs });
  }, [updateAction]);

  const handleResizeAction = useCallback((id: number, newStartMs: number, newDurationMs: number) => {
    updateAction(id, { start_time_ms: newStartMs, duration_ms: newDurationMs });
  }, [updateAction]);

  const handleAddAction = useCallback((trackId: number) => {
    // Create a new action at playback cursor position
    const tempId = -(Date.now() % 1_000_000);
    const newAction: ShowAction = {
      id: tempId,
      device_id: null,
      device_name: '',
      name: '',
      action_type: 'device',
      start_time_ms: Math.round(currentTimeMs),
      duration_ms: 2000,
      command: '',
      params: {},
    };
    addAction(trackId, newAction);
    clearSelection();
    selectAction(tempId);
  }, [currentTimeMs, addAction, clearSelection, selectAction]);

  const handleDeleteSelected = useCallback(() => {
    const store = useTimelineStore.getState();
    for (const id of store.selectedActionIds) {
      store.removeAction(id);
    }
  }, []);

  const handlePropertyChange = useCallback((actionId: number, patch: Partial<ShowAction>) => {
    updateAction(actionId, patch);
  }, [updateAction]);

  const handleZoomChange = useCallback((val: number) => setZoomLevel(val), [setZoomLevel]);

  /* ── Selected action for property panel ── */
  const selectedAction = useMemo(() => {
    if (selectedActionIds.size === 0) return null;
    const firstId = [...selectedActionIds][0];
    for (const t of tracks) {
      const a = t.actions.find((act) => act.id === firstId);
      if (a) return a;
    }
    return null;
  }, [selectedActionIds, tracks]);

  /* ── Ruler click → seek ── */
  const handleRulerClick = useCallback((ms: number) => seek(ms), [seek]);

  /* ── Render ── */
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spin size="large" tip="加载演出数据..." />
      </div>
    );
  }

  if (!show) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--ant-color-text-quaternary)' }}>
        演出不存在
      </div>
    );
  }

  const preRollMs = show.pre_roll_ms ?? 0;
  const postRollMs = show.post_roll_ms ?? 0;
  const videoDurationMs = show.duration_ms;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden', minWidth: 0, margin: '-32px', width: 'calc(100% + 64px)' }}>
        {/* ── Top Bar ── */}
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 12px', borderBottom: '1px solid var(--ant-color-border-secondary)',
            background: 'var(--ant-color-bg-container)', flexShrink: 0,
          }}
        >
          <Space size={8}>
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/shows/${showId}`)}>返回</Button>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{show.name}</span>
            {dirty && <Badge status="warning" text="未保存" />}
            <Tag style={{ fontSize: 11 }}>{formatMs(totalDurationMs)}</Tag>
            {show.base_content_name || show.base_content_id ? (
              <Tag
                icon={<VideoCameraOutlined />}
                color="blue"
                style={{ cursor: 'pointer', fontSize: 11 }}
                onClick={() => { setSelectedVideoId(show.base_content_id ?? undefined); setVideoModalOpen(true); }}
              >
                {show.base_content_name || `视频 #${show.base_content_id}`}
              </Tag>
            ) : (
              <Button
                size="small"
                icon={<VideoCameraOutlined />}
                onClick={() => { setSelectedVideoId(undefined); setVideoModalOpen(true); }}
              >
                选择基准视频
              </Button>
            )}
          </Space>

          <Space size={4}>
            {rehearsal.status === 'idle' ? (
              <Button size="small" icon={<ThunderboltOutlined />} onClick={rehearsal.start} loading={rehearsal.loading}>排练</Button>
            ) : (
              <Button.Group>
                {rehearsal.status === 'running' ? (
                  <Button size="small" icon={<PauseOutlined />} onClick={rehearsal.pause} loading={rehearsal.loading}>暂停</Button>
                ) : (
                  <Button size="small" icon={<CaretRightOutlined />} onClick={rehearsal.start} loading={rehearsal.loading}>继续</Button>
                )}
                <Button size="small" icon={<StopOutlined />} danger onClick={rehearsal.stop} loading={rehearsal.loading}>停止</Button>
              </Button.Group>
            )}
            <span style={{ width: 1, height: 16, background: 'var(--ant-color-border)', display: 'inline-block', verticalAlign: 'middle' }} />
            <Button type="text" size="small" icon={<UndoOutlined />} disabled={!canUndo()} onClick={undo} title="撤销 (Ctrl+Z)" />
            <Button type="text" size="small" icon={<RedoOutlined />} disabled={!canRedo()} onClick={redo} title="重做 (Ctrl+Shift+Z)" />
            <ZoomOutOutlined style={{ fontSize: 12, color: 'var(--ant-color-text-quaternary)' }} />
            <Slider
              style={{ width: 100 }}
              min={0.03} max={0.5} step={0.01}
              value={view.zoomLevel}
              onChange={handleZoomChange}
              tooltip={{ formatter: (v) => `${((v ?? 0.1) * 1000).toFixed(0)} px/s` }}
            />
            <ZoomInOutlined style={{ fontSize: 12, color: 'var(--ant-color-text-quaternary)' }} />
            <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSave} loading={saveMutation.isPending} disabled={!dirty}>保存</Button>
          </Space>
        </div>

        {/* ── Main 3-column area ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Left: Action Library */}
          <ActionLibrary hallId={show.hall_id} />

          {/* Center: Video + Refs + Tracks */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

            {/* Video Frame Preview — 60% of available height */}
            <div style={{ flex: '0.6 1 0%', minHeight: 120, overflow: 'hidden' }}>
              <VideoPreview
                currentTimeMs={currentTimeMs}
                spriteSheets={spriteSheets}
                totalDurationMs={totalDurationMs}
                preRollMs={preRollMs}
                videoDurationMs={videoDurationMs}
              />
            </div>

            {/* Reference Strip (ruler + sprite + waveform + cursor) */}
            <div style={{ display: 'flex', borderTop: '1px solid var(--ant-color-border-secondary)', flexShrink: 0 }}>
              <div style={{
                width: 100, flexShrink: 0,
                borderRight: '1px solid var(--ant-color-border-secondary)',
                background: 'var(--ant-color-bg-layout)',
              }}>
                <div style={{ height: REF_RULER_H, display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 10, color: '#999' }}>时间</div>
                <div style={{ height: REF_SPRITE_H, display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 10, color: '#999', borderTop: '1px solid var(--ant-color-border)' }}>帧参考</div>
                <div style={{ height: REF_WAVE_H, display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 10, color: '#999', borderTop: '1px solid var(--ant-color-border)' }}>波形</div>
              </div>

              <div
                ref={refPanelRef}
                onWheel={handleRefWheel}
                style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
              >
                <TimeRuler
                  totalTimeMs={totalTimeMs}
                  preRollMs={preRollMs}
                  postRollMs={postRollMs}
                  width={refVpWidth}
                  scrollLeft={view.scrollLeft}
                  zoomLevel={view.zoomLevel}
                  onClick={handleRulerClick}
                />
                <div style={{ borderTop: '1px solid var(--ant-color-border)' }}>
                  <SpriteStrip
                    spriteSheets={spriteSheets}
                    totalTimeMs={totalTimeMs}
                    preRollMs={preRollMs}
                    postRollMs={postRollMs}
                    width={refVpWidth}
                    scrollLeft={view.scrollLeft}
                    zoomLevel={view.zoomLevel}
                  />
                </div>
                <div style={{ borderTop: '1px solid var(--ant-color-border)' }}>
                  <WaveformStrip
                    waveformPeaks={waveformPeaks}
                    totalTimeMs={totalTimeMs}
                    preRollMs={preRollMs}
                    postRollMs={postRollMs}
                    videoDurationMs={videoDurationMs}
                    width={refVpWidth}
                    scrollLeft={view.scrollLeft}
                    zoomLevel={view.zoomLevel}
                  />
                </div>
                <PlaybackCursor
                  currentTimeMs={currentTimeMs}
                  totalTimeMs={totalTimeMs}
                  height={REF_TOTAL_H}
                  scrollLeft={view.scrollLeft}
                  zoomLevel={view.zoomLevel}
                  onSeek={seek}
                />
              </div>
            </div>

            {/* Track Area — takes remaining space */}
            <div style={{ flex: '0.4 1 0%', minHeight: 80, overflow: 'hidden', borderTop: '1px solid var(--ant-color-border-secondary)' }}>
              <TrackArea
                tracks={tracks}
                totalDurationMs={totalDurationMs}
                zoomLevel={view.zoomLevel}
                scrollLeft={view.scrollLeft}
                selectedActionIds={selectedActionIds}
                hasClipboard={!!clipboard && clipboard.length > 0}
                onAddTrack={handleAddTrack}
                onRemoveTrack={handleRemoveTrack}
                onRenameTrack={handleRenameTrack}
                onSelectAction={handleSelectAction}
                onDoubleClickAction={handleDoubleClickAction}
                onClearSelection={clearSelection}
                onDragMoveAction={handleDragMoveAction}
                onResizeAction={handleResizeAction}
                onAddAction={handleAddAction}
                onScrollLeftChange={setScrollLeft}
                onCopySelected={copySelected}
                onPaste={paste}
                onDeleteSelected={handleDeleteSelected}
                currentTimeMs={currentTimeMs}
              />
            </div>
          </div>

          {/* Right: Property Panel */}
          <div
            style={{
              width: PROP_PANEL_W, flexShrink: 0,
              borderLeft: '1px solid var(--ant-color-border-secondary)',
              background: 'var(--ant-color-bg-container)',
              overflow: 'hidden',
            }}
          >
            <PropertyPanel
              action={selectedAction}
              hallId={show.hall_id}
              onChange={handlePropertyChange}
            />
          </div>
        </div>

        {/* ── Bottom Bar ── */}
        <div
          style={{
            height: 32, flexShrink: 0,
            borderTop: '1px solid var(--ant-color-border-secondary)',
            background: 'var(--ant-color-bg-layout)',
            display: 'flex', alignItems: 'center', padding: '0 12px',
            fontSize: 11, color: 'var(--ant-color-text-tertiary)', gap: 10,
          }}
        >
          <Button
            type="text" size="small"
            icon={isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
            onClick={toggle}
            style={{ fontSize: 13 }}
          />
          <span style={{ fontFamily: 'monospace', minWidth: 90, fontSize: 12 }}>
            {formatMs(currentTimeMs)} / {formatMs(totalTimeMs)}
          </span>
          <span style={{ color: 'var(--ant-color-text-quaternary)' }}>|</span>
          <span>
            {tracks.length} 轨道 · {tracks.reduce((sum, t) => sum + (t.actions?.length ?? 0), 0)} 动作
          </span>
          {selectedActionIds.size > 0 && <span>· 选中 {selectedActionIds.size}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ant-color-text-quaternary)' }}>
            Space 播放 · Del 删除 · Ctrl+Z 撤销 · Ctrl+C/V 复制粘贴 · +/- 缩放
          </span>
        </div>
      </div>

      {/* ── Drag Overlay ── */}
      <DragOverlay>
        {dragLabel && (
          <div style={{
            padding: '6px 12px', borderRadius: 4,
            background: 'var(--ant-color-primary)', color: '#fff',
            fontSize: 12, fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            {dragLabel}
          </div>
        )}
      </DragOverlay>

      {/* ── Base Video Selector Modal ── */}
      <Modal
        title="选择基准视频"
        open={videoModalOpen}
        onOk={handleVideoConfirm}
        onCancel={() => setVideoModalOpen(false)}
        confirmLoading={updateShowMutation.isPending}
        okButtonProps={{ disabled: !selectedVideoId }}
        width={480}
        destroyOnClose
      >
        <p style={{ color: 'var(--ant-color-text-secondary)', marginBottom: 12 }}>
          基准视频决定演出时长，其帧参考和音频波形将显示在时间轴中辅助编排。
        </p>
        <Select
          style={{ width: '100%' }}
          value={selectedVideoId}
          onChange={setSelectedVideoId}
          options={videoOptions}
          placeholder="搜索或选择视频"
          showSearch
          optionFilterProp="label"
          size="large"
        />
      </Modal>
    </DndContext>
  );
}
