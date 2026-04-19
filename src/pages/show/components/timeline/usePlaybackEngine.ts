import { useRef, useCallback, useEffect } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';

/**
 * rAF-driven playback clock.
 * Reads/writes through the Zustand store; auto-stops at totalTimelineMs.
 */
export function usePlaybackEngine() {
  const { playback, show, setPlaying, setCurrentTime } = useTimelineStore();
  const rafId = useRef(0);

  const totalMs = show
    ? (show.pre_roll_ms ?? 0) + show.duration_ms + (show.post_roll_ms ?? 0)
    : 0;

  /* Store latest values in refs for the rAF loop */
  const totalMsRef = useRef(totalMs);
  const setCurrentTimeRef = useRef(setCurrentTime);
  const setPlayingRef = useRef(setPlaying);
  useEffect(() => { totalMsRef.current = totalMs; }, [totalMs]);
  useEffect(() => { setCurrentTimeRef.current = setCurrentTime; }, [setCurrentTime]);
  useEffect(() => { setPlayingRef.current = setPlaying; }, [setPlaying]);

  /* Start / stop rAF loop when isPlaying changes */
  useEffect(() => {
    if (!playback.isPlaying) return;

    let prevTs = 0;
    let id = 0;

    function tick(ts: number) {
      if (prevTs === 0) prevTs = ts;
      const dt = ts - prevTs;
      prevTs = ts;

      const s = useTimelineStore.getState();
      if (!s.playback.isPlaying) return;

      const next = s.playback.currentTimeMs + dt;
      const limit = totalMsRef.current;
      if (next >= limit) {
        setCurrentTimeRef.current(limit);
        setPlayingRef.current(false);
        return;
      }
      setCurrentTimeRef.current(next);
      id = requestAnimationFrame(tick);
    }

    id = requestAnimationFrame(tick);
    rafId.current = id;

    return () => cancelAnimationFrame(id);
  }, [playback.isPlaying]);

  /* Public controls */
  const play = useCallback(() => {
    const s = useTimelineStore.getState();
    if (s.playback.currentTimeMs >= totalMs) setCurrentTime(0);
    setPlaying(true);
  }, [totalMs, setCurrentTime, setPlaying]);

  const pause = useCallback(() => setPlaying(false), [setPlaying]);

  const seek = useCallback(
    (ms: number) => setCurrentTime(Math.max(0, Math.min(totalMs, ms))),
    [totalMs, setCurrentTime],
  );

  const toggle = useCallback(() => {
    if (playback.isPlaying) pause(); else play();
  }, [playback.isPlaying, play, pause]);

  return {
    play, pause, seek, toggle,
    isPlaying: playback.isPlaying,
    currentTimeMs: playback.currentTimeMs,
    totalTimeMs: totalMs,
  };
}
