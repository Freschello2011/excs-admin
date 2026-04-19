import { create } from 'zustand';
import type { ShowDetail, ShowTrack, ShowAction, SpriteSheet, TrackType } from '@/types/show';

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

  /* Undo / Redo history */
  _past: ShowTrack[][];
  _future: ShowTrack[][];

  /* Clipboard */
  clipboard: ShowAction[] | null;
}

interface TimelineActions {
  /* Data loading */
  loadShow: (show: ShowDetail) => void;
  setSpriteSheets: (sheets: SpriteSheet[]) => void;
  setWaveformPeaks: (peaks: number[]) => void;

  /* Track/action mutations */
  setTracks: (tracks: ShowTrack[]) => void;
  addTrack: (name: string, trackType: TrackType) => void;
  removeTrack: (trackId: number) => void;
  renameTrack: (trackId: number, name: string) => void;
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
  setScrollLeft: (px: number) => void;

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
  view: { zoomLevel: 0.1, scrollLeft: 0 },   // 0.1 px/ms = 100px per second
  selectedActionIds: new Set(),
  dirty: false,
  _past: [],
  _future: [],
  clipboard: null,
};

/** Deep-clone tracks array for history snapshot */
function cloneTracks(tracks: ShowTrack[]): ShowTrack[] {
  return tracks.map((t) => ({ ...t, actions: t.actions.map((a) => ({ ...a, params: { ...a.params } })) }));
}

/* ==================== Store ==================== */

export const useTimelineStore = create<TimelineStore>()((set, get) => {
  /** Push current tracks to _past before a mutation */
  function pushHistory() {
    const { tracks, _past } = get();
    const past = [..._past, cloneTracks(tracks)];
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
      set({
        show,
        tracks: show.tracks ?? [],
        spriteSheets: mapSpriteSheets(show.sprite_sheets as unknown[]),
        waveformPeaks,
        dirty: false,
        selectedActionIds: new Set(),
        playback: { isPlaying: false, currentTimeMs: 0 },
        _past: [],
        _future: [],
      });
    },

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
    markClean: () => set({ dirty: false }),

    /* Undo / Redo */
    undo: () => {
      const { _past, tracks, _future } = get();
      if (_past.length === 0) return;
      const prev = _past[_past.length - 1];
      set({
        _past: _past.slice(0, -1),
        _future: [cloneTracks(tracks), ..._future].slice(0, MAX_HISTORY),
        tracks: prev,
        dirty: true,
      });
    },

    redo: () => {
      const { _past, tracks, _future } = get();
      if (_future.length === 0) return;
      const next = _future[0];
      set({
        _future: _future.slice(1),
        _past: [..._past, cloneTracks(tracks)].slice(-MAX_HISTORY),
        tracks: next,
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

    /* View */
    setZoomLevel: (level) =>
      set((s) => ({ view: { ...s.view, zoomLevel: level } })),
    setScrollLeft: (px) =>
      set((s) => ({ view: { ...s.view, scrollLeft: px } })),

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