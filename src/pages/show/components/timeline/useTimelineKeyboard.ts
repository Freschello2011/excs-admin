import { useEffect } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';

/**
 * Comprehensive keyboard shortcuts for the timeline editor.
 *
 * Space        — play / pause
 * Delete/Bksp  — delete selected actions
 * Ctrl/Cmd+C   — copy selected actions
 * Ctrl/Cmd+V   — paste at playback cursor (to first track)
 * Ctrl/Cmd+Z   — undo
 * Shift+Ctrl/Cmd+Z (or Ctrl+Y) — redo
 * +/=          — zoom in
 * -            — zoom out
 * Left         — nudge selected actions left 100ms
 * Right        — nudge selected actions right 100ms
 */
export function useTimelineKeyboard(toggle: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when typing in input fields
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const isMeta = e.metaKey || e.ctrlKey;
      const store = useTimelineStore.getState();

      /* Space — play / pause */
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        toggle();
        return;
      }

      /* Delete / Backspace — remove selected actions */
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (store.selectedActionIds.size > 0) {
          e.preventDefault();
          for (const id of store.selectedActionIds) {
            store.removeAction(id);
          }
        }
        return;
      }

      /* Ctrl+C — copy */
      if (isMeta && e.code === 'KeyC' && !e.shiftKey) {
        if (store.selectedActionIds.size > 0) {
          e.preventDefault();
          store.copySelected();
        }
        return;
      }

      /* Ctrl+V — paste at playback cursor position on first track */
      if (isMeta && e.code === 'KeyV' && !e.shiftKey) {
        if (store.clipboard && store.tracks.length > 0) {
          e.preventDefault();
          const trackId = store.tracks[0].id;
          const atMs = Math.round(store.playback.currentTimeMs);
          store.paste(trackId, atMs);
        }
        return;
      }

      /* Ctrl+Z — undo, Shift+Ctrl+Z or Ctrl+Y — redo */
      if (isMeta && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) {
          store.redo();
        } else {
          store.undo();
        }
        return;
      }
      if (isMeta && e.code === 'KeyY') {
        e.preventDefault();
        store.redo();
        return;
      }

      /* + / = — zoom in */
      if ((e.code === 'Equal' || e.code === 'NumpadAdd') && !isMeta) {
        e.preventDefault();
        store.setZoomLevel(Math.min(0.5, store.view.zoomLevel * 1.25));
        return;
      }

      /* - — zoom out */
      if ((e.code === 'Minus' || e.code === 'NumpadSubtract') && !isMeta) {
        e.preventDefault();
        store.setZoomLevel(Math.max(0.03, store.view.zoomLevel / 1.25));
        return;
      }

      /* Left arrow — nudge selected 100ms earlier */
      if (e.code === 'ArrowLeft' && !isMeta) {
        if (store.selectedActionIds.size > 0) {
          e.preventDefault();
          const delta = e.shiftKey ? 1000 : 100;
          for (const id of store.selectedActionIds) {
            for (const t of store.tracks) {
              const a = t.actions.find((act) => act.id === id);
              if (a) {
                store.updateAction(id, { start_time_ms: Math.max(0, a.start_time_ms - delta) });
                break;
              }
            }
          }
        }
        return;
      }

      /* Right arrow — nudge selected 100ms later */
      if (e.code === 'ArrowRight' && !isMeta) {
        if (store.selectedActionIds.size > 0) {
          e.preventDefault();
          const delta = e.shiftKey ? 1000 : 100;
          for (const id of store.selectedActionIds) {
            for (const t of store.tracks) {
              const a = t.actions.find((act) => act.id === id);
              if (a) {
                store.updateAction(id, { start_time_ms: a.start_time_ms + delta });
                break;
              }
            }
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);
}
