import { create } from 'zustand';
import type { ShowDetail, ShowTrack, ShowAction, SpriteSheet, TrackType } from '@/api/gen/client';

/* ==================== Constants ==================== */

const MAX_HISTORY = 50;

/** Default sprite sheet columns (matches backend config content.sprite_cols default) */
const DEFAULT_SPRITE_COLS = 6;

/**
 * Map backend SpriteSheet JSON (sheet_url, frame_count, frame_interval_ms, frame_width, frame_height)
 * to frontend SpriteSheet type (url, columns, rows, fps, ...).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSpriteSheets(raw: any[] | null | undefined): SpriteSheet[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && (s.url || s.sheet_url) && (s.frame_count ?? 0) > 0)
    .map((s) => {
      const url: string = s.url ?? s.sheet_url ?? '';
      const frameCount: number = s.frame_count ?? 0;
      const frameIntervalMs: number = s.frame_interval_ms ?? 1000;
      const frameWidth: number = s.frame_width ?? 320;
      const frameHeight: number = s.frame_height ?? 180;
      const cols: number = s.columns ?? DEFAULT_SPRITE_COLS;
      const rows: number = s.rows ?? Math.ceil(frameCount / cols);
      const fps: number = s.fps ?? (frameIntervalMs > 0 ? 1000 / frameIntervalMs : 1);
      return { url, frame_width: frameWidth, frame_height: frameHeight, columns: cols, rows, frame_count: frameCount, fps, frame_interval_ms: frameIntervalMs };
    });
}

/* ==================== Types ==================== */

interface PlaybackState {
  isPlaying: boolean;
  currentTimeMs: number;
}

interface ViewState {
  zoomLevel: number;       // pixels per millisecond
  scrollLeft: number;      // horizontal scroll offset in px
  /**
   * 用户是否手动调整过缩放/视图。
   * fitToScreen 仅在 false 时生效（避免覆盖用户已选择的缩放）。
   * 任何手动 setZoomLevel / setZoomLevelAnchored 会置为 true。
   */
  _userZoomed: boolean;
}

interface TimelineState {
  /* Show data */
  show: ShowDetail | null;
  tracks: ShowTrack[];

  /* Visual data */
  spriteSheets: SpriteSheet[];
  waveformPeaks: number[];

  /* Playback */
  playback: PlaybackState;

  /* View control */
  view: ViewState;

  /* Selection */
  selectedActionIds: Set<number>;

  /* Dirty flag — tracks unsaved changes */
  dirty: boolean;

  /**
   * 最近一次"已保存/已加载"时间戳（Date.now() 毫秒）。
   * loadShow / markClean 时刷新；用于顶栏 Badge 显示"X 分钟前"。
   */
  lastSavedAt: number | null;

  /* Undo / Redo history — Batch C 起每个 snapshot 也含 view + selection */
  _past: HistorySnapshot[];
  _future: HistorySnapshot[];

  /* Clipboard */
  clipboard: ShowAction[] | null;

  /** 当前正在拖动的 snap hint（ms），用于 overlay 红线和状态栏文案；非拖动状态为 null */
  snapHintMs: number | null;
}

/**
 * 历史栈快照 — Batch C 起新增 view + selection。
 * tracks 是深拷贝；view 是值拷贝；selection 是 Set 拷贝。
 */
interface HistorySnapshot {
  tracks: ShowTrack[];
  view: ViewState;
  selectedActionIds: Set<number>;
}

interface TimelineActions {
  /* Data loading */
  loadShow: (show: ShowDetail) => void;
  /**
   * Batch C P11：仅 patch show 元数据字段（如 pre_roll_ms / post_roll_ms），不动
   * tracks / dirty / history / view。给顶栏 inline 编辑 pre/post roll 用。
   */
  setShowMeta: (patch: Partial<ShowDetail>) => void;
  setSpriteSheets: (sheets: SpriteSheet[]) => void;
  setWaveformPeaks: (peaks: number[]) => void;

  /* Track/action mutations */
  setTracks: (tracks: ShowTrack[]) => void;
  addTrack: (name: string, trackType: TrackType) => void;
  removeTrack: (trackId: number) => void;
  renameTrack: (trackId: number, name: string) => void;
  /**
   * Batch C P10：轨道重排 — splice + 重算 sort_order；走 pushHistory（可撤销）。
   * fromIdx / toIdx 基于 tracks 数组下标（已按 sort_order 由前端展示）。
   */
  reorderTrack: (fromIdx: number, toIdx: number) => void;
  addAction: (trackId: number, action: ShowAction) => void;
  updateAction: (actionId: number, patch: Partial<ShowAction>) => void;
  removeAction: (actionId: number) => void;
  markDirty: () => void;
  markClean: () => void;

  /* Undo / Redo */
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  /* Clipboard */
  copySelected: () => void;
  paste: (trackId: number, atMs: number) => void;

  /* Playback */
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (ms: number) => void;

  /* View */
  setZoomLevel: (level: number) => void;
  /**
   * 锚点缩放：以 anchorPx（容器左边为 0）为锚点缩放，鼠标位置下的时间不漂移。
   * 公式：scrollLeft' = (anchorPx + scrollLeft) * (newLevel/oldLevel) - anchorPx
   * 同时 clamp 到 [0, totalWidth - viewportWidth]。
   */
  setZoomLevelAnchored: (level: number, anchorPx: number, viewportWidth: number, totalDurationMs: number) => void;
  /**
   * 进页 fit-to-screen：仅在 _userZoomed=false 时生效。
   * 计算 zoomLevel = viewportWidth / totalDurationMs 并把 scrollLeft 置 0。
   */
  fitToScreen: (viewportWidth: number, totalDurationMs: number) => void;
  setScrollLeft: (px: number) => void;
  /** Snap hint — 拖动时高亮的对齐目标 ms；非拖动状态为 null */
  setSnapHint: (ms: number | null) => void;

  /* Selection */
  selectAction: (id: number) => void;
  deselectAction: (id: number) => void;
  toggleActionSelection: (id: number) => void;
  clearSelection: () => void;
  /** Get the currently selected action (first selected) */
  getSelectedAction: () => ShowAction | null;

  /* Reset */
  reset: () => void;
}

export type TimelineStore = TimelineState & TimelineActions;

/* ==================== Initial state ==================== */

const initialState: TimelineState = {
  show: null,
  tracks: [],
  spriteSheets: [],
  waveformPeaks: [],
  playback: { isPlaying: false, currentTimeMs: 0 },
  view: { zoomLevel: 0.1, scrollLeft: 0, _userZoomed: false },   // 0.1 px/ms = 100px per second
  selectedActionIds: new Set(),
  dirty: false,
  lastSavedAt: null,
  _past: [],
  _future: [],
  clipboard: null,
  snapHintMs: null,
};

/** Deep-clone tracks array for history snapshot */
function cloneTracks(tracks: ShowTrack[]): ShowTrack[] {
  return tracks.map((t) => ({ ...t, actions: t.actions.map((a) => ({ ...a, params: { ...a.params } })) }));
}

/**
 * 构造历史快照（值拷贝 view + 深拷贝 tracks + 拷贝 selection Set）。
 * Batch C P19：snapshot 增量含 view 和 selection。
 */
function snapshot(s: TimelineState): HistorySnapshot {
  return {
    tracks: cloneTracks(s.tracks),
    view: { ...s.view },
    selectedActionIds: new Set(s.selectedActionIds),
  };
}

/* ==================== Store ==================== */

export const useTimelineStore = create<TimelineStore>()((set, get) => {
  /**
   * Push current state to _past before a mutation.
   *
   * `kind='mutation'`：track / 选区 / 数据类变更，无条件 push。
   * `kind='view'`：手动 view 操作（缩放）— 启用 coalesce，避免 wheel 拖滑爆栈。
   *   coalesce 规则：last past entry 的 tracks 引用 === 当前 tracks 时跳过 push（连续
   *   纯 view 改动只占第一格）。fitToScreen / setScrollLeft 不调用 pushHistory。
   */
  function pushHistory(kind: 'mutation' | 'view' = 'mutation') {
    const s = get();
    if (kind === 'view') {
      const last = s._past[s._past.length - 1];
      if (last && last.tracks === s.tracks) {
        // 连续 view-only 改动：上次 push 的 tracks 引用未变 → 跳过，保留更早的 view 锚点
        return;
      }
    }
    const past = [...s._past, snapshot(s)];
    if (past.length > MAX_HISTORY) past.shift();
    set({ _past: past, _future: [] });
  }

  return {
    ...initialState,

    /* Data loading */
    loadShow: (show) => {
      // 解析波形数据（base64 编码的 uint8 二进制 → number[]）
      let waveformPeaks: number[] = [];
      if (show.waveform_peaks) {
        try {
          const bin = atob(show.waveform_peaks);
          waveformPeaks = Array.from(bin, (c) => c.charCodeAt(0));
        } catch { /* ignore */ }
      }
      set((s) => ({
        show,
        tracks: show.tracks ?? [],
        spriteSheets: mapSpriteSheets(show.sprite_sheets as unknown[]),
        waveformPeaks,
        dirty: false,
        lastSavedAt: Date.now(),
        selectedActionIds: new Set(),
        playback: { isPlaying: false, currentTimeMs: 0 },
        // 重新加载演出 → 重置 fit-to-screen 标记，使下一次首次渲染重新 fit
        view: { ...s.view, _userZoomed: false, scrollLeft: 0 },
        _past: [],
        _future: [],
      }));
    },

    setShowMeta: (patch) =>
      set((s) => (s.show ? { show: { ...s.show, ...patch } as ShowDetail } : {})),

    setSpriteSheets: (sheets) => set({ spriteSheets: sheets }),
    setWaveformPeaks: (peaks) => set({ waveformPeaks: peaks }),

    /* Track/action mutations — each calls pushHistory() */
    setTracks: (tracks) => { pushHistory(); set({ tracks, dirty: true }); },

    addTrack: (name, trackType) => {
      pushHistory();
      set((s) => {
        const maxSort = s.tracks.reduce((m, t) => Math.max(m, t.sort_order), 0);
        const tempId = -(Date.now() % 1_000_000);
        const newTrack: ShowTrack = {
          id: tempId, name, track_type: trackType,
          sort_order: maxSort + 1, actions: [],
        };
        return { tracks: [...s.tracks, newTrack], dirty: true };
      });
    },

    removeTrack: (trackId) => {
      pushHistory();
      set((s) => ({
        tracks: s.tracks.filter((t) => t.id !== trackId),
        dirty: true,
      }));
    },

    renameTrack: (trackId, name) => {
      pushHistory();
      set((s) => ({
        tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, name } : t)),
        dirty: true,
      }));
    },

    reorderTrack: (fromIdx, toIdx) => {
      const { tracks } = get();
      if (
        fromIdx === toIdx
        || fromIdx < 0 || fromIdx >= tracks.length
        || toIdx < 0 || toIdx >= tracks.length
      ) return;
      pushHistory();
      set((s) => {
        const next = [...s.tracks];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        // 重算 sort_order：1, 2, 3, ...（保持简单递增；后端 saveTimeline 直接覆盖）
        const reordered = next.map((t, i) => ({ ...t, sort_order: i + 1 }));
        return { tracks: reordered, dirty: true };
      });
    },

    addAction: (trackId, action) => {
      pushHistory();
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === trackId ? { ...t, actions: [...t.actions, action] } : t,
        ),
        dirty: true,
      }));
    },

    updateAction: (actionId, patch) => {
      pushHistory();
      set((s) => ({
        tracks: s.tracks.map((t) => ({
          ...t,
          actions: t.actions.map((a) =>
            a.id === actionId ? { ...a, ...patch } : a,
          ),
        })),
        dirty: true,
      }));
    },

    removeAction: (actionId) => {
      pushHistory();
      set((s) => ({
        tracks: s.tracks.map((t) => ({
          ...t,
          actions: t.actions.filter((a) => a.id !== actionId),
        })),
        selectedActionIds: (() => {
          const next = new Set(s.selectedActionIds);
          next.delete(actionId);
          return next;
        })(),
        dirty: true,
      }));
    },

    markDirty: () => set({ dirty: true }),
    markClean: () => set({ dirty: false, lastSavedAt: Date.now() }),

    /* Undo / Redo — Batch C P19：snapshot 含 tracks + view + selection，一并恢复 */
    undo: () => {
      const s = get();
      if (s._past.length === 0) return;
      const prev = s._past[s._past.length - 1];
      const cur = snapshot(s);
      set({
        _past: s._past.slice(0, -1),
        _future: [cur, ...s._future].slice(0, MAX_HISTORY),
        tracks: prev.tracks,
        view: prev.view,
        selectedActionIds: prev.selectedActionIds,
        dirty: true,
      });
    },

    redo: () => {
      const s = get();
      if (s._future.length === 0) return;
      const next = s._future[0];
      const cur = snapshot(s);
      set({
        _future: s._future.slice(1),
        _past: [...s._past, cur].slice(-MAX_HISTORY),
        tracks: next.tracks,
        view: next.view,
        selectedActionIds: next.selectedActionIds,
        dirty: true,
      });
    },

    canUndo: () => get()._past.length > 0,
    canRedo: () => get()._future.length > 0,

    /* Clipboard */
    copySelected: () => {
      const { selectedActionIds, tracks } = get();
      if (selectedActionIds.size === 0) return;
      const actions: ShowAction[] = [];
      for (const t of tracks) {
        for (const a of t.actions) {
          if (selectedActionIds.has(a.id)) actions.push({ ...a, params: { ...a.params } });
        }
      }
      set({ clipboard: actions });
    },

    paste: (trackId, atMs) => {
      const { clipboard } = get();
      if (!clipboard || clipboard.length === 0) return;
      pushHistory();
      // Offset: earliest clipboard action starts at atMs
      const minStart = Math.min(...clipboard.map((a) => a.start_time_ms));
      const offset = atMs - minStart;
      const newActions: ShowAction[] = clipboard.map((a) => ({
        ...a,
        id: -(Date.now() % 1_000_000) - Math.floor(Math.random() * 10000),
        start_time_ms: Math.max(0, a.start_time_ms + offset),
        params: { ...a.params },
      }));
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === trackId ? { ...t, actions: [...t.actions, ...newActions] } : t,
        ),
        dirty: true,
      }));
    },

    /* Playback */
    setPlaying: (playing) =>
      set((s) => ({ playback: { ...s.playback, isPlaying: playing } })),
    setCurrentTime: (ms) =>
      set((s) => ({ playback: { ...s.playback, currentTimeMs: ms } })),

    /* View — Batch C P19：手动 view 操作 push 'view' 入栈（fitToScreen / setScrollLeft 不入栈） */
    setZoomLevel: (level) => {
      pushHistory('view');
      set((s) => ({ view: { ...s.view, zoomLevel: level, _userZoomed: true } }));
    },
    setZoomLevelAnchored: (level, anchorPx, viewportWidth, totalDurationMs) => {
      pushHistory('view');
      set((s) => {
        const oldLevel = s.view.zoomLevel;
        if (oldLevel <= 0 || level <= 0) return {};
        const oldScrollLeft = s.view.scrollLeft;
        const rawScrollLeft = (anchorPx + oldScrollLeft) * (level / oldLevel) - anchorPx;
        const totalWidth = totalDurationMs * level;
        const maxScroll = Math.max(0, totalWidth - viewportWidth);
        const clamped = Math.max(0, Math.min(maxScroll, rawScrollLeft));
        return { view: { zoomLevel: level, scrollLeft: clamped, _userZoomed: true } };
      });
    },
    fitToScreen: (viewportWidth, totalDurationMs) =>
      set((s) => {
        if (s.view._userZoomed) return {};
        if (viewportWidth <= 0 || totalDurationMs <= 0) return {};
        const level = viewportWidth / totalDurationMs;
        return { view: { zoomLevel: level, scrollLeft: 0, _userZoomed: false } };
      }),
    setScrollLeft: (px) =>
      set((s) => ({ view: { ...s.view, scrollLeft: px } })),
    setSnapHint: (ms) => set({ snapHintMs: ms }),

    /* Selection */
    selectAction: (id) =>
      set((s) => {
        const next = new Set(s.selectedActionIds);
        next.add(id);
        return { selectedActionIds: next };
      }),
    deselectAction: (id) =>
      set((s) => {
        const next = new Set(s.selectedActionIds);
        next.delete(id);
        return { selectedActionIds: next };
      }),
    toggleActionSelection: (id) =>
      set((s) => {
        const next = new Set(s.selectedActionIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selectedActionIds: next };
      }),
    clearSelection: () => set({ selectedActionIds: new Set() }),
    getSelectedAction: () => {
      const s = get();
      if (s.selectedActionIds.size === 0) return null;
      const firstId = [...s.selectedActionIds][0];
      for (const t of s.tracks) {
        const a = t.actions.find((act) => act.id === firstId);
        if (a) return a;
      }
      return null;
    },

    /* Reset */
    reset: () => set(initialState),
  };
});