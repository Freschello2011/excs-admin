import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Button, Space, Tag, Slider, Spin, Modal, InputNumber, Tooltip, Popover,
} from 'antd';
import type { TrackType as TrackTypeEnum } from '@/api/gen/client';
import { useMessage } from '@/hooks/useMessage';
import {
  ArrowLeftOutlined, SaveOutlined,
  ZoomInOutlined, ZoomOutOutlined,
  CaretRightOutlined, PauseOutlined,
  UndoOutlined, RedoOutlined,
  ThunderboltOutlined, StopOutlined,
  VideoCameraOutlined, WarningFilled,
  CompressOutlined, ExpandAltOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, DragOverlay,
} from '@dnd-kit/core';
import { showApi } from '@/api/show';
import { queryKeys } from '@/api/queryKeys';
import { useTimelineStore } from '@/stores/timelineStore';
import type { ShowAction, TrackType, SaveTimelineBody } from '@/api/gen/client';
import {
  TimeRuler, SpriteStrip, WaveformStrip, PlaybackCursor,
  TrackArea, PropertyPanel, VideoPreview, Minimap,
  usePlaybackEngine, useRehearsal, ActionLibrary, useTimelineKeyboard,
} from './components/timeline';
import type { DragData } from './components/timeline/ActionLibrary';
import type { ResizeEdge } from './components/timeline/ActionBlock';
import SplitPane from '@/components/SplitPane';
import {
  findSnapTarget, buildSecondCandidates, buildActionEdgeCandidates,
} from '@/lib/timeline/snap';

/* ==================== Constants ==================== */

/** Ruler + Sprite + Ruler2（贴近轨道的秒数刻度）+ Waveform heights
 *  Bug 3：用户期望雪碧图下方紧挨一条秒数刻度尺，作为下方各业务轨道（机灯/通道/etc）
 *  的对齐参照；原布局只有顶部一条 Ruler，雪碧图与轨道之间只有 Waveform，
 *  导致拖动 action 时无法精确对齐到秒。 */
const REF_RULER_H = 20;
const REF_SPRITE_H = 32;
/** 与 TimeRuler 组件内部 HEIGHT 常量保持一致（20px） */
const REF_RULER2_H = 20;
const REF_WAVE_H = 32;
const REF_TOTAL_H = REF_RULER_H + REF_SPRITE_H + REF_RULER2_H + REF_WAVE_H;
const PROP_PANEL_W = 260;

/** Format milliseconds to mm:ss */
function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Format ms with 0.1s precision for snap hint status text — e.g. "01:23.5" */
function formatMsHint(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const min = Math.floor(total / 60000);
  const sec = Math.floor((total % 60000) / 1000);
  const tenth = Math.floor((total % 1000) / 100);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenth}`;
}

/** Snap 像素阈值 */
const SNAP_THRESHOLD_PX = 8;
/** SplitPane 比例 localStorage key */
const PREVIEW_RATIO_KEY = 'excs.timeline.previewRatio';
/** Batch D：Minimap 折叠状态 localStorage key */
const MINIMAP_VISIBLE_KEY = 'excs.timeline.minimapVisible';
/** pre/post roll 节流（ms） — 输入后 500ms 才发请求 */
const ROLL_THROTTLE_MS = 500;
/** Bug 5a autosave：dirty 后等待 ms 自动落盘；用户连续编辑会持续重置 timer。 */
const AUTOSAVE_DEBOUNCE_MS = 30_000;
/** 本地草稿 localStorage key 前缀 — `${prefix}${showId}` 一对一存。 */
const DRAFT_KEY_PREFIX = 'excs.timeline.draft.';
/** Bug 6 轨道名称栏宽度：localStorage key + clamp 范围 */
const LABEL_W_KEY = 'excs.timeline.labelWidth';
const LABEL_W_MIN = 80;
const LABEL_W_MAX = 320;
const LABEL_W_DEFAULT = 100;

/**
 * Batch C P14：动作类型 → 推荐轨道类型。
 * device 命令 → light/mechanical/audio/custom（任一即 OK）。
 * scene → 任意（视为通用编排单元）。
 * media → video。
 *
 * 不匹配时给警告角标，不阻断落点（用户可以强行落，例如"灯光命令落到自定义轨道做特殊编排"）。
 */
function isTrackTypeRecommended(
  dragType: 'device' | 'scene' | 'media',
  trackType: TrackTypeEnum,
): boolean {
  if (dragType === 'scene') return true;
  if (dragType === 'media') return trackType === 'video';
  // device
  return trackType === 'light' || trackType === 'mechanical'
    || trackType === 'audio' || trackType === 'custom';
}

/** 给警告 tooltip 提示推荐轨道类型 */
function recommendedTrackLabel(dragType: 'device' | 'scene' | 'media'): string {
  if (dragType === 'media') return '视频';
  return '灯光 / 机械 / 音频 / 自定义';
}

/**
 * Batch C P21：拖入设备命令时根据 params_schema 预填 params。
 * - required 字段：有 widget.default 取 default；否则给类型对应的零值（避免后端 422）。
 * - 非 required 字段：仅当 default 存在时填，否则留空。
 */
function buildInitialParams(command: { params_schema?: { [k: string]: unknown } | null }): Record<string, unknown> {
  const schema = command.params_schema as
    | { required?: string[]; properties?: Record<string, { type?: string; default?: unknown }> }
    | null
    | undefined;
  if (!schema || !schema.properties) return {};
  const required = new Set(schema.required ?? []);
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop && Object.prototype.hasOwnProperty.call(prop, 'default')) {
      out[key] = prop.default;
    } else if (required.has(key)) {
      // 必填但无默认 → 给类型零值
      switch (prop?.type) {
        case 'integer':
        case 'number':
          out[key] = 0; break;
        case 'boolean':
          out[key] = false; break;
        case 'array':
          out[key] = []; break;
        case 'object':
          out[key] = {}; break;
        default:
          out[key] = '';
      }
    }
  }
  return out;
}

/**
 * dirty 计时文案：基于 lastSavedAt（毫秒时间戳）和 dirty 状态。
 * dirty=true → "未保存（X 分钟）"；dirty=false → "已保存（X 分钟前）"。
 * X 为 floor((now - lastSavedAt) / 60000)。
 */
function formatSavedAgo(now: number, lastSavedAt: number | null, dirty: boolean): string {
  if (lastSavedAt == null) return dirty ? '未保存' : '已保存';
  const mins = Math.max(0, Math.floor((now - lastSavedAt) / 60000));
  return dirty ? `未保存（${mins} 分钟）` : `已保存（${mins} 分钟前）`;
}

/* ==================== Component ==================== */

export default function ShowTimelinePage() {
  const { message } = useMessage();
  const { showId: showIdStr } = useParams<{ showId: string }>();
  const showId = Number(showIdStr);
  const navigate = useNavigate();

  const {
    show, tracks, dirty, lastSavedAt, view, spriteSheets, waveformPeaks,
    selectedActionIds, clipboard, snapHintMs,
    loadShow, setShowMeta, markClean,
    addTrack, removeTrack, renameTrack, reorderTrack, updateAction, addAction,
    selectAction, clearSelection, toggleActionSelection,
    setZoomLevelAnchored, fitToScreen, setScrollLeft, setSnapHint, reset,
    undo, redo, canUndo, canRedo,
    copySelected, paste,
  } = useTimelineStore();

  /* Playback engine */
  const { toggle, seek, isPlaying, currentTimeMs, totalTimeMs } = usePlaybackEngine();

  /* Rehearsal controls */
  const rehearsal = useRehearsal(showId);

  /* Keyboard shortcuts — single hook handles all keys.
   * handleSave 在此 hook 之后才声明（依赖 useMutation 与 tracks），
   * 用 ref 间接拿最新引用，避免循环依赖。 */
  const handleSaveRef = useRef<() => void>(() => {});
  useTimelineKeyboard(toggle, () => handleSaveRef.current());

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

  /* Wheel → 锚点缩放 (Ctrl/⌘) 或 虚拟横向滚动
     React 17+ onWheel 是 passive listener，preventDefault 被忽略——
     用 addEventListener('wheel', { passive: false }) + stopPropagation
     防止 Ctrl+wheel 冒泡到 admin layout 把整页横向滚出。
     Bug 4 修复：把单次步长从 ±10% 加大到 ±15%，锚点效果更明显；
     anchorPx 用 clientX - rect.left（rect 是 ruler/sprite/waveform 区，
     已剔除左侧 100px label 列），保证鼠标位置缩放后维持原像素位。 */
  useEffect(() => {
    const el = refPanelRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.deltaY === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        const rect = el.getBoundingClientRect();
        const anchorPx = e.clientX - rect.left;
        setZoomLevelAnchored(view.zoomLevel * factor, anchorPx, refVpWidth, totalDurationMs);
        return;
      }
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (dx === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const maxScroll = Math.max(0, totalDurationMs * view.zoomLevel - refVpWidth);
      setScrollLeft(Math.max(0, Math.min(maxScroll, view.scrollLeft + dx)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [view.zoomLevel, view.scrollLeft, refVpWidth, totalDurationMs, setScrollLeft, setZoomLevelAnchored]);

  /* fit-to-screen：
   * 1) showId 切换 / 首次进入：强制 fit（绕过 _userZoomed），保证关键帧默认完全可见；
   * 2) 之后 refVpWidth / totalDurationMs 变（窗口 resize / pre-post roll 改）：尊重 _userZoomed。 */
  const fittedShowIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (refVpWidth <= 0 || totalDurationMs <= 0 || !show) return;
    if (fittedShowIdRef.current !== show.id) {
      // 首次进 / 换 show — 强制 fit，重置用户手动缩放标记
      fittedShowIdRef.current = show.id;
      const level = refVpWidth / totalDurationMs;
      useTimelineStore.setState((s) => ({
        view: { ...s.view, zoomLevel: level, scrollLeft: 0, _userZoomed: false },
      }));
      return;
    }
    // 同 show 内 viewport / 时长变化 — 走原 fitToScreen（_userZoomed 守卫）
    fitToScreen(refVpWidth, totalDurationMs);
  }, [show?.id, refVpWidth, totalDurationMs, fitToScreen]);

  /* Slider zoom（用 viewport 中点作锚点） */
  const handleZoomChange = useCallback((val: number) => {
    setZoomLevelAnchored(val, refVpWidth / 2, refVpWidth, totalDurationMs);
  }, [setZoomLevelAnchored, refVpWidth, totalDurationMs]);

  /* TrackArea Ctrl+wheel 锚点缩放 */
  const handleZoomAtAnchor = useCallback((level: number, anchorPx: number, viewportWidth: number) => {
    setZoomLevelAnchored(level, anchorPx, viewportWidth, totalDurationMs);
  }, [setZoomLevelAnchored, totalDurationMs]);

  /* Slider 下限：fit-to-screen 对应的 zoom 值（防止滑到比 fit 还小） */
  const sliderMin = useMemo(() => {
    if (refVpWidth <= 0 || totalDurationMs <= 0) return 0.005;
    return Math.max(0.005, refVpWidth / totalDurationMs);
  }, [refVpWidth, totalDurationMs]);

  /* ── DnD sensors ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /* ── DnD active item state for overlay ── */
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  /**
   * Batch C P14：拖拽中的"类型联动"提示。
   * dragType = 当前拖动的来源类型；overTrackType = 当前悬停的轨道类型；
   * mismatch = !recommended（角标 + tooltip 用）。
   */
  const [dragType, setDragType] = useState<'device' | 'scene' | 'media' | null>(null);
  const [overTrackType, setOverTrackType] = useState<TrackTypeEnum | null>(null);
  const dragMismatch = useMemo(() => {
    if (!dragType || !overTrackType) return false;
    return !isTrackTypeRecommended(dragType, overTrackType);
  }, [dragType, overTrackType]);

  /**
   * 构造 snap 候选：整秒 + 当前游标 + 其它 action 的起点和终点（剔除自身）。
   * （提前到 DnD 之前定义，handleDragEnd / drag-move 都引用它。）
   */
  const buildSnapCandidates = useCallback((excludeId: number | null): number[] => {
    const seconds = buildSecondCandidates(totalDurationMs);
    const edges = buildActionEdgeCandidates(tracks, excludeId);
    return [...seconds, Math.round(currentTimeMs), ...edges];
  }, [tracks, totalDurationMs, currentTimeMs]);

  /* ── DnD handlers ── */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return;
    setDragType(data.type);
    switch (data.type) {
      case 'device': setDragLabel(data.command.name); break;
      case 'scene': setDragLabel(data.scene.name); break;
      case 'media': setDragLabel(data.content.name); break;
    }
  }, []);

  /* ── DnD over：跟踪当前悬停轨道类型，给类型联动警告用 ── */
  const handleDragOver = useCallback((event: { over: { data?: { current?: unknown } } | null }) => {
    const overData = event.over?.data?.current as { trackId?: number } | undefined;
    if (!overData?.trackId) {
      setOverTrackType(null);
      return;
    }
    const track = tracks.find((t) => t.id === overData.trackId);
    setOverTrackType(track ? (track.track_type as TrackTypeEnum) : null);
  }, [tracks]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragLabel(null);
    setDragType(null);
    setOverTrackType(null);
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
    const rawDropMs = Math.max(0, Math.round((dropX + view.scrollLeft) / view.zoomLevel));
    // Snap drop time（除非按住 shift）
    const shiftAtDrop = (event.activatorEvent as PointerEvent)?.shiftKey ?? false;
    let dropTimeMs = rawDropMs;
    if (!shiftAtDrop) {
      const candidates = buildSnapCandidates(null);
      const snap = findSnapTarget(rawDropMs, candidates, SNAP_THRESHOLD_PX, view.zoomLevel);
      if (snap) dropTimeMs = snap.snappedMs;
    }

    // Create action based on drag data type
    const tempId = -(Date.now() % 1_000_000) - Math.floor(Math.random() * 10000);

    let newAction: ShowAction;
    switch (data.type) {
      case 'device': {
        // Batch C P21：用 deviceId/deviceName 直接填；按 params_schema.required + widget.default 预填
        // ADR-0024：source=command_preset 的"现场别名"卡（code 形如 "preset:<name>"）落卡时
        // 用 resolved_code/resolved_params 展开为标准 device_action，让 ShowEngine /
        // 展厅 / 中控协议路径不需要识别 "preset:" 前缀。
        const cmd = data.command;
        const isPresetCard =
          cmd.source === 'command_preset' && !!cmd.resolved_code;
        const command = isPresetCard ? cmd.resolved_code! : cmd.code;
        const params = isPresetCard
          ? (cmd.resolved_params ?? {})
          : buildInitialParams(cmd);
        newAction = {
          id: tempId,
          device_id: data.deviceId,
          device_name: data.deviceName,
          name: cmd.name,
          action_type: 'device',
          start_time_ms: dropTimeMs,
          duration_ms: 2000,
          command,
          params,
        };
        break;
      }
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
          duration_ms: data.content.duration_ms > 0 ? data.content.duration_ms : 5000,
          command: String(data.content.id),
          params: {},
        };
        break;
    }

    addAction(trackId, newAction);
    clearSelection();
    selectAction(tempId);
  }, [view.scrollLeft, view.zoomLevel, addAction, clearSelection, selectAction, buildSnapCandidates]);

  const handleDragCancel = useCallback(() => {
    setDragLabel(null);
    setDragType(null);
    setOverTrackType(null);
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

  /* ── Bug 6：轨道名称栏宽度（左侧 reference label 列 + TrackArea label 列共享） ── */
  const [labelWidth, setLabelWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LABEL_W_KEY);
      const v = raw ? Number(raw) : NaN;
      if (!Number.isFinite(v)) return LABEL_W_DEFAULT;
      return Math.max(LABEL_W_MIN, Math.min(LABEL_W_MAX, v));
    } catch { return LABEL_W_DEFAULT; }
  });
  /** 当前是否在拖动调宽：拖动期间让全局 cursor=col-resize + 禁用文本选中 */
  const [resizingLabel, setResizingLabel] = useState(false);
  const handleLabelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = labelWidth;
    setResizingLabel(true);
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(LABEL_W_MIN, Math.min(LABEL_W_MAX, startW + (ev.clientX - startX)));
      setLabelWidth(next);
    };
    const onUp = () => {
      setResizingLabel(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // 仅在 mouseup 落盘 — 避免每像素写一次 localStorage
      try {
        // 用闭包当时的 next 不可得，直接读 state；此函数已被 setLabelWidth 调用，
        // setState 是异步，这里 read 可能拿到旧值。改成读 DOM data attribute 不优雅 —
        // 用 setLabelWidth 的回调拿到 next 写盘。
      } catch { /* ignore */ }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [labelWidth]);
  // labelWidth 变化时持久化（mouseup 时也走这里 — useEffect 是异步的，等止住 mousemove 风暴后再写）
  useEffect(() => {
    if (resizingLabel) return; // 拖动中不写盘
    try { localStorage.setItem(LABEL_W_KEY, String(labelWidth)); } catch { /* ignore */ }
  }, [labelWidth, resizingLabel]);
  // 拖动期间锁住光标 + 禁选（防止跨子元素时光标闪烁/选中文本）
  useEffect(() => {
    if (!resizingLabel) return;
    const prevCursor = document.body.style.cursor;
    const prevUserSel = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSel;
    };
  }, [resizingLabel]);

  /* ── Batch D：Minimap 显隐（默认展开），localStorage 持久化 ── */
  const [minimapVisible, setMinimapVisible] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(MINIMAP_VISIBLE_KEY);
      return v == null ? true : v === '1';
    } catch { return true; }
  });
  const toggleMinimap = useCallback(() => {
    setMinimapVisible((prev) => {
      const next = !prev;
      try { localStorage.setItem(MINIMAP_VISIBLE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  /* ── 1s tick — drives "X 分钟前/X 分钟" 实时刷新 ── */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── 离开拦截 1：useBlocker（react-router 内部跳转） ── */
  const blocker = useBlocker(
    useCallback(({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
    [dirty]),
  );
  // React StrictMode dev 会让 effect 跑两遍 → Modal 弹两次；用 ref 守门
  const blockedHandledRef = useRef(false);
  useEffect(() => {
    if (blocker.state === 'blocked' && !blockedHandledRef.current) {
      blockedHandledRef.current = true;
      Modal.confirm({
        title: '有未保存改动',
        content: '当前演出时间轴有未保存的改动，确定离开吗？离开后改动会丢失。',
        okText: '离开',
        okButtonProps: { danger: true },
        cancelText: '留下继续编辑',
        onOk: () => { blockedHandledRef.current = false; blocker.proceed?.(); },
        onCancel: () => { blockedHandledRef.current = false; blocker.reset?.(); },
      });
    }
    if (blocker.state === 'unblocked') blockedHandledRef.current = false;
  }, [blocker, blocker.state]);

  /* ── 离开拦截 2：beforeunload（关页签 / 刷新 / 关浏览器） ── */
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Chrome 需要赋值才弹原生确认
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /* ── Batch C P11：pre/post roll inline 编辑（节流 500ms） ── */
  const rollMutation = useMutation({
    mutationFn: (patch: { pre_roll_ms?: number; post_roll_ms?: number }) =>
      showApi.updateShow(showId, patch),
    onError: () => { message.error('前导/尾声更新失败'); },
  });
  const rollTimerRef = useRef<{ pre?: ReturnType<typeof setTimeout>; post?: ReturnType<typeof setTimeout> }>({});
  const handlePreRollChange = useCallback((sec: number | null) => {
    if (sec == null || sec < 0) return;
    const ms = Math.round(sec * 1000);
    setShowMeta({ pre_roll_ms: ms }); // 立即视觉反馈
    if (rollTimerRef.current.pre) clearTimeout(rollTimerRef.current.pre);
    rollTimerRef.current.pre = setTimeout(() => {
      rollMutation.mutate({ pre_roll_ms: ms });
    }, ROLL_THROTTLE_MS);
  }, [setShowMeta, rollMutation]);
  const handlePostRollChange = useCallback((sec: number | null) => {
    if (sec == null || sec < 0) return;
    const ms = Math.round(sec * 1000);
    setShowMeta({ post_roll_ms: ms });
    if (rollTimerRef.current.post) clearTimeout(rollTimerRef.current.post);
    rollTimerRef.current.post = setTimeout(() => {
      rollMutation.mutate({ post_roll_ms: ms });
    }, ROLL_THROTTLE_MS);
  }, [setShowMeta, rollMutation]);
  // 卸载清理 timer
  useEffect(() => () => {
    if (rollTimerRef.current.pre) clearTimeout(rollTimerRef.current.pre);
    if (rollTimerRef.current.post) clearTimeout(rollTimerRef.current.post);
  }, []);

  /* ── Save mutation ──
   * Bug 5a：本次保存来源（manual / auto）通过 saveSourceRef 区分，
   * autosave 不抢用户注意力（小提示），manual 给绿勾 success。
   * 失败两种都报错，但 autosave 失败提示语区别（提醒用户手动救一次）。 */
  const saveSourceRef = useRef<'manual' | 'auto'>('manual');
  const saveMutation = useMutation({
    mutationFn: (body: SaveTimelineBody) => showApi.saveTimeline(showId, body),
    onSuccess: (res) => {
      if (saveSourceRef.current === 'auto') {
        // autosave 静默落盘 — 用更小的 info 提示，不打扰
        message.info({ content: '已自动保存', duration: 1.2 });
      } else {
        message.success('时间轴已保存');
      }
      markClean();
      const newShow = res.data.data;
      if (newShow) loadShow(newShow);
      // 落盘成功 → 清掉本地草稿
      try { localStorage.removeItem(DRAFT_KEY_PREFIX + showId); } catch { /* ignore */ }
    },
    onError: () => {
      message.error(
        saveSourceRef.current === 'auto'
          ? '自动保存失败，请手动点保存'
          : '保存失败',
      );
    },
  });

  /* ── Save handler — build body from store tracks ── */
  const buildSaveBody = useCallback((): SaveTimelineBody => ({
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
  }), [tracks]);

  const handleSave = useCallback(() => {
    if (!show) return;
    saveSourceRef.current = 'manual';
    saveMutation.mutate(buildSaveBody());
  }, [show, buildSaveBody, saveMutation]);

  /* Bug 1 / Ctrl+S：把最新 handleSave 写入 ref，让 useTimelineKeyboard 拿到 */
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  /* ── Bug 5a：autosave — dirty 后 30s 防抖落盘 ── */
  useEffect(() => {
    if (!dirty || !show) return;
    if (saveMutation.isPending) return;
    const id = setTimeout(() => {
      saveSourceRef.current = 'auto';
      saveMutation.mutate(buildSaveBody());
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // tracks 在依赖里 → 用户继续编辑时 effect 重跑 → 上一个 timer 被清，重新计时
  }, [dirty, show, tracks, buildSaveBody, saveMutation]);

  /* ── Bug 5a：本地草稿 ──
   * 每次 dirty 变化 / tracks 变化都写一份到 localStorage；
   * 落盘成功时由 onSuccess 清掉。
   * 进入页面时若发现有该 show 的草稿且与服务端不同 → 弹 Modal 让用户选恢复/丢弃。 */
  useEffect(() => {
    if (!show || !dirty) return;
    try {
      localStorage.setItem(
        DRAFT_KEY_PREFIX + showId,
        JSON.stringify({ savedAt: Date.now(), body: buildSaveBody() }),
      );
    } catch { /* quota exceed 等忽略，不阻塞编辑 */ }
  }, [show, dirty, tracks, showId, buildSaveBody]);

  /* 进入页面 → 检查是否有未落盘草稿（仅在 show 加载完且 store 非 dirty 时检查，
   * 避免和 loadShow 的 reset dirty=false 竞态弹两次）。 */
  const draftCheckedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!show) return;
    if (draftCheckedRef.current === show.id) return; // 同 show 只检查一次
    draftCheckedRef.current = show.id;
    let raw: string | null = null;
    try { raw = localStorage.getItem(DRAFT_KEY_PREFIX + showId); } catch { /* ignore */ }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { savedAt: number };
      const ageMin = Math.round((Date.now() - parsed.savedAt) / 60000);
      Modal.confirm({
        title: '发现未保存草稿',
        content: `检测到 ${ageMin} 分钟前在本浏览器有一份该演出的未保存编辑（可能因登出/崩溃丢失）。是否查看草稿数据？`,
        okText: '导出草稿 JSON',
        cancelText: '丢弃',
        onOk: () => {
          // 导出文件让用户人工对比 — 不直接覆盖 store，避免误盖服务端最新数据
          const blob = new Blob([raw!], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `timeline-draft-show-${showId}-${parsed.savedAt}.json`;
          a.click();
          URL.revokeObjectURL(url);
        },
        onCancel: () => {
          try { localStorage.removeItem(DRAFT_KEY_PREFIX + showId); } catch { /* ignore */ }
        },
      });
    } catch { /* 解析失败直接清掉 */
      try { localStorage.removeItem(DRAFT_KEY_PREFIX + showId); } catch { /* ignore */ }
    }
  }, [show, showId]);

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

  const handleReorderTrack = useCallback((fromIdx: number, toIdx: number) => {
    reorderTrack(fromIdx, toIdx);
  }, [reorderTrack]);

  /* ── Action callbacks ── */
  const handleSelectAction = useCallback((id: number, multi: boolean) => {
    if (multi) {
      toggleActionSelection(id);
    } else {
      clearSelection();
      selectAction(id);
    }
  }, [toggleActionSelection, clearSelection, selectAction]);

  /** PropertyPanel 高亮触发时间戳；每次值变就跑一次 0.6s flash 动画 */
  const [panelFlashAt, setPanelFlashAt] = useState(0);

  /**
   * 双击 / 右键「编辑属性」入口：
   * - 选中目标 action（覆盖原选区，单选）；
   * - 触发 PropertyPanel 高亮 1 次（panelFlashAt 时间戳变化驱动 CSS 动画），
   *   让用户能注意到右栏切到了该 action。
   * 老版本是 no-op（注释说"selection 已在 mousedown 处理"），
   * 但右键菜单 'edit' 也走这条路 → 导致点击无反应（Bug 7）。
   */
  const handleDoubleClickAction = useCallback((id: number) => {
    clearSelection();
    selectAction(id);
    setPanelFlashAt(Date.now());
  }, [clearSelection, selectAction]);

  const handleDragMoveAction = useCallback((id: number, newStartMs: number, shift: boolean) => {
    if (shift) {
      updateAction(id, { start_time_ms: newStartMs });
      setSnapHint(null);
      return;
    }
    const candidates = buildSnapCandidates(id);
    const snap = findSnapTarget(newStartMs, candidates, SNAP_THRESHOLD_PX, view.zoomLevel);
    if (snap) {
      updateAction(id, { start_time_ms: snap.snappedMs });
      setSnapHint(snap.hitTarget);
    } else {
      updateAction(id, { start_time_ms: newStartMs });
      setSnapHint(null);
    }
  }, [updateAction, buildSnapCandidates, view.zoomLevel, setSnapHint]);

  const handleResizeAction = useCallback((id: number, newStartMs: number, newDurationMs: number, edge: ResizeEdge, shift: boolean) => {
    if (shift) {
      updateAction(id, { start_time_ms: newStartMs, duration_ms: newDurationMs });
      setSnapHint(null);
      return;
    }
    const candidates = buildSnapCandidates(id);
    if (edge === 'left') {
      // 左边缘吸附：保持右边缘不动 → newEnd = newStartMs + newDurationMs
      const newEnd = newStartMs + newDurationMs;
      const snap = findSnapTarget(newStartMs, candidates, SNAP_THRESHOLD_PX, view.zoomLevel);
      if (snap) {
        const snappedStart = Math.max(0, Math.min(newEnd - 100, snap.snappedMs));
        updateAction(id, { start_time_ms: snappedStart, duration_ms: newEnd - snappedStart });
        setSnapHint(snap.hitTarget);
      } else {
        updateAction(id, { start_time_ms: newStartMs, duration_ms: newDurationMs });
        setSnapHint(null);
      }
    } else {
      // 右边缘吸附：保持起点不动 → 吸附 end 时间
      const oldEnd = newStartMs + newDurationMs;
      const snap = findSnapTarget(oldEnd, candidates, SNAP_THRESHOLD_PX, view.zoomLevel);
      if (snap) {
        const snappedDur = Math.max(100, snap.snappedMs - newStartMs);
        updateAction(id, { start_time_ms: newStartMs, duration_ms: snappedDur });
        setSnapHint(snap.hitTarget);
      } else {
        updateAction(id, { start_time_ms: newStartMs, duration_ms: newDurationMs });
        setSnapHint(null);
      }
    }
  }, [updateAction, buildSnapCandidates, view.zoomLevel, setSnapHint]);

  const handleActionDragEnd = useCallback((_id: number) => {
    setSnapHint(null);
  }, [setSnapHint]);

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
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden', minWidth: 0, margin: '-32px', width: 'calc(100% + 64px)' }}>
        {/* ── Top Bar ──
         * Bug 1：原版顶栏左侧塞了 8 项（返回/标题/dirty/总时长/前导/尾声/视频Tag/详情页），
         * 父容器 overflow:hidden 在窄屏会把右侧 Space（含保存按钮）裁出可视区。
         * 重排后：左侧只保留必看（返回 + 标题 + dirty + 总时长），
         * 前导/尾声折进「演出参数」Popover；右侧 Space 加 flexShrink: 0 永远可见；
         * 标题 flex-shrink + ellipsis 长名也不挤掉右侧。 */}
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 12px', borderBottom: '1px solid var(--ant-color-border-secondary)',
            background: 'var(--ant-color-bg-container)', flexShrink: 0,
            gap: 8, minWidth: 0,
          }}
        >
          <Space size={8} style={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/shows/${showId}`)}>返回</Button>
            <Tooltip title={show.name}>
              <span
                style={{
                  fontWeight: 600, fontSize: 15,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: 200, display: 'inline-block', verticalAlign: 'middle',
                }}
              >
                {show.name}
              </span>
            </Tooltip>
            <span
              style={{
                fontSize: 11,
                color: dirty ? '#faad14' : 'var(--ant-color-text-tertiary)',
                fontWeight: dirty ? 500 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {dirty ? '● ' : '○ '}
              {formatSavedAgo(now, lastSavedAt, dirty)}
            </span>
            <Tag style={{ fontSize: 11 }}>{formatMs(totalDurationMs)}</Tag>
            {/* 演出参数 Popover：折叠 pre/post roll + 基准视频，腾出顶栏空间 */}
            <Popover
              trigger="click"
              placement="bottomLeft"
              content={(
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', marginBottom: 4 }}>前导（秒）</div>
                    <InputNumber
                      size="small"
                      min={0} step={0.5} precision={1}
                      value={(show.pre_roll_ms ?? 0) / 1000}
                      onChange={handlePreRollChange}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', marginBottom: 4 }}>尾声（秒）</div>
                    <InputNumber
                      size="small"
                      min={0} step={0.5} precision={1}
                      value={(show.post_roll_ms ?? 0) / 1000}
                      onChange={handlePostRollChange}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ borderTop: '1px solid var(--ant-color-border-secondary)', paddingTop: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', marginBottom: 4 }}>基准视频</div>
                    {show.base_content_name || show.base_content_id ? (
                      <Space size={4} wrap>
                        <Tag icon={<VideoCameraOutlined />} color="blue" style={{ fontSize: 11 }}>
                          {show.base_content_name || `视频 #${show.base_content_id}`}
                        </Tag>
                        <Button type="link" size="small" style={{ fontSize: 11, padding: 0, height: 'auto' }} onClick={() => navigate(`/shows/${showId}`)}>
                          在详情页修改
                        </Button>
                      </Space>
                    ) : (
                      <Button size="small" icon={<VideoCameraOutlined />} onClick={() => navigate(`/shows/${showId}`)}>
                        前往详情页选择
                      </Button>
                    )}
                  </div>
                </div>
              )}
            >
              <Button size="small" icon={<SettingOutlined />} type="text" title="演出参数（前导/尾声/基准视频）">
                参数
              </Button>
            </Popover>
            {/* 基准视频缺失时给一个独立警示色 Tag 直接可见，避免折进 popover 后用户察觉不到 */}
            {!(show.base_content_name || show.base_content_id) && (
              <Tag color="warning" style={{ fontSize: 11 }} onClick={() => navigate(`/shows/${showId}`)}>
                未选基准视频
              </Tag>
            )}
          </Space>

          <Space size={4} style={{ flexShrink: 0 }}>
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
              min={sliderMin} max={0.5} step={0.001}
              value={view.zoomLevel}
              onChange={handleZoomChange}
              tooltip={{ formatter: (v) => `${((v ?? 0.1) * 1000).toFixed(0)} px/s` }}
            />
            <ZoomInOutlined style={{ fontSize: 12, color: 'var(--ant-color-text-quaternary)' }} />
            <Button
              type="primary" size="small" icon={<SaveOutlined />}
              onClick={handleSave} loading={saveMutation.isPending} disabled={!dirty}
              className={dirty ? 'excs-save-pulse' : undefined}
            >
              保存
            </Button>
          </Space>
        </div>

        {/* ── Main 3-column area ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Left: Action Library */}
          <ActionLibrary hallId={show.hall_id} />

          {/* Center: Video + Refs + Tracks（30:70 SplitPane） */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <SplitPane
              storageKey={PREVIEW_RATIO_KEY}
              initialRatio={0.3}
              minTopPx={120}
              minBottomPx={160}
              top={(
                <VideoPreview
                  currentTimeMs={currentTimeMs}
                  spriteSheets={spriteSheets}
                  totalDurationMs={totalDurationMs}
                  preRollMs={preRollMs}
                  videoDurationMs={videoDurationMs}
                  baseContentId={show.base_content_id || null}
                  pipelineStatus={show.base_content_pipeline_status}
                  showId={showId}
                />
              )}
              bottom={(
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Reference Strip (ruler + sprite + waveform + cursor) */}
            <div style={{ display: 'flex', borderTop: '1px solid var(--ant-color-border-secondary)', flexShrink: 0 }}>
              <div style={{
                width: labelWidth, flexShrink: 0,
                borderRight: '1px solid var(--ant-color-border-secondary)',
                background: 'var(--ant-color-bg-layout)',
                position: 'relative',
              }}>
                <div style={{ height: REF_RULER_H, display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 10, color: '#999' }}>时间</div>
                <div style={{ height: REF_SPRITE_H, display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 10, color: '#999', borderTop: '1px solid var(--ant-color-border)' }}>帧参考</div>
                <div style={{ height: REF_RULER2_H, display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 10, color: '#999', borderTop: '1px solid var(--ant-color-border)' }}>秒数</div>
                <div style={{ height: REF_WAVE_H, display: 'flex', alignItems: 'center', padding: '0 6px', fontSize: 10, color: '#999', borderTop: '1px solid var(--ant-color-border)' }}>波形</div>
                {/* Bug 6：宽度拖拽手柄（reference 列与 TrackArea label 列共宽，拖任一即同步） */}
                <div
                  onMouseDown={handleLabelResizeStart}
                  title="拖动调整轨道名称栏宽度"
                  style={{
                    position: 'absolute', top: 0, right: -2, bottom: 0, width: 4,
                    cursor: 'col-resize', zIndex: 5,
                    background: resizingLabel ? 'var(--ant-color-primary)' : 'transparent',
                  }}
                />
              </div>

              <div
                ref={refPanelRef}
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
                {/* Bug 3：雪碧图下方第二条秒数刻度尺，紧贴各业务轨道作对齐参考 */}
                <div style={{ borderTop: '1px solid var(--ant-color-border)' }}>
                  <TimeRuler
                    totalTimeMs={totalTimeMs}
                    preRollMs={preRollMs}
                    postRollMs={postRollMs}
                    width={refVpWidth}
                    scrollLeft={view.scrollLeft}
                    zoomLevel={view.zoomLevel}
                    onClick={handleRulerClick}
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
            <div style={{ flex: 1, minHeight: 80, overflow: 'hidden', borderTop: '1px solid var(--ant-color-border-secondary)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
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
                onReorderTrack={handleReorderTrack}
                onSelectAction={handleSelectAction}
                onDoubleClickAction={handleDoubleClickAction}
                onClearSelection={clearSelection}
                onDragMoveAction={handleDragMoveAction}
                onResizeAction={handleResizeAction}
                onActionDragEnd={handleActionDragEnd}
                onAddAction={handleAddAction}
                onScrollLeftChange={setScrollLeft}
                onZoomAtAnchor={handleZoomAtAnchor}
                onCopySelected={copySelected}
                onPaste={paste}
                onDeleteSelected={handleDeleteSelected}
                currentTimeMs={currentTimeMs}
                snapHintMs={snapHintMs}
                labelWidth={labelWidth}
                onLabelResizeStart={handleLabelResizeStart}
                labelResizing={resizingLabel}
              />
              </div>
              {minimapVisible && (
                <Minimap
                  tracks={tracks}
                  totalDurationMs={totalDurationMs}
                  preRollMs={preRollMs}
                  postRollMs={postRollMs}
                  viewportWidth={refVpWidth}
                  zoomLevel={view.zoomLevel}
                  scrollLeft={view.scrollLeft}
                  currentTimeMs={currentTimeMs}
                  onScrollLeftChange={setScrollLeft}
                />
              )}
            </div>
                </div>
              )}
            />
          </div>

          {/* Right: Property Panel */}
          <div
            key={panelFlashAt /* key 变 → 重挂 → 重跑 flash 动画 */}
            className={panelFlashAt > 0 ? 'excs-panel-flash' : undefined}
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
              currentTimeMs={currentTimeMs}
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
          {snapHintMs != null && (
            <span style={{ color: '#ff4d4f', fontWeight: 500 }}>
              · 对齐到 {formatMsHint(snapHintMs)}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ant-color-text-quaternary)' }}>
            Space 播放 · Ctrl+S 保存 · Del 删除 · Ctrl+Z 撤销 · Ctrl+C/V 复制粘贴 · Ctrl+滚轮 锚点缩放 · Shift 临时关 Snap
          </span>
          <Tooltip title={minimapVisible ? '折叠总览' : '展开总览'}>
            <Button
              type="text"
              size="small"
              icon={minimapVisible ? <CompressOutlined /> : <ExpandAltOutlined />}
              onClick={toggleMinimap}
              style={{ fontSize: 12 }}
            />
          </Tooltip>
        </div>
      </div>

      {/* ── Drag Overlay — Batch C P14：类型不匹配显示黄色警告角标 ── */}
      <DragOverlay>
        {dragLabel && (
          <Tooltip
            open={dragMismatch}
            title={dragType ? `建议拖到 ${recommendedTrackLabel(dragType)} 轨道` : ''}
            placement="top"
          >
            <div style={{
              position: 'relative',
              padding: '6px 12px', borderRadius: 4,
              background: 'var(--ant-color-primary)', color: '#fff',
              fontSize: 12, fontWeight: 500,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              {dragLabel}
              {dragMismatch && (
                <WarningFilled
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    fontSize: 14,
                    color: '#faad14',
                    background: '#fff',
                    borderRadius: '50%',
                    padding: 1,
                    boxShadow: '0 0 4px rgba(0,0,0,0.2)',
                  }}
                />
              )}
            </div>
          </Tooltip>
        )}
      </DragOverlay>

    </DndContext>
  );
}
