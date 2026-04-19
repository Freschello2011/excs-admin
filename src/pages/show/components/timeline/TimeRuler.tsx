import { useRef, useEffect, useCallback } from 'react';

/* ── Constants ── */
const HEIGHT = 20;
const MAJOR_TICK = 12;
const MINOR_TICK = 6;
const ROLL_BG = 'rgba(0,0,0,0.06)';
const TICK_CLR = '#999';
const LABEL_CLR = '#666';
const FONT = '10px -apple-system,BlinkMacSystemFont,sans-serif';

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}

/** Pick major/minor tick interval (ms) so major ticks are ~80-200 px apart */
function tickInterval(zoom: number): { major: number; minor: number } {
  const pxPerSec = zoom * 1000;
  const table: [number, number][] = [
    [60_000, 10_000], [30_000, 5_000], [10_000, 2_000],
    [5_000, 1_000], [2_000, 500], [1_000, 200], [500, 100],
  ];
  for (const [maj, min] of table) {
    if ((maj / 1000) * pxPerSec >= 60) return { major: maj, minor: min };
  }
  return { major: 500, minor: 100 };
}

/* ── Props ── */
export interface TimeRulerProps {
  totalTimeMs: number;
  preRollMs: number;
  postRollMs: number;
  width: number;
  scrollLeft: number;
  zoomLevel: number;
  onClick?: (timeMs: number) => void;
}

export default function TimeRuler({
  totalTimeMs, preRollMs, postRollMs, width, scrollLeft, zoomLevel, onClick,
}: TimeRulerProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const draw = useCallback(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const w = width;
    const h = HEIGHT;
    cvs.width = w * dpr;
    cvs.height = h * dpr;
    cvs.style.width = `${w}px`;
    cvs.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const totalW = totalTimeMs * zoomLevel;
    const vidStart = preRollMs * zoomLevel;
    const vidEnd = (totalTimeMs - postRollMs) * zoomLevel;

    /* Pre-roll bg */
    const preL = Math.max(0, -scrollLeft);
    const preR = Math.min(w, vidStart - scrollLeft);
    if (preR > preL) { ctx.fillStyle = ROLL_BG; ctx.fillRect(preL, 0, preR - preL, h); }

    /* Post-roll bg */
    const postL = Math.max(0, vidEnd - scrollLeft);
    const postR = Math.min(w, totalW - scrollLeft);
    if (postR > postL) { ctx.fillStyle = ROLL_BG; ctx.fillRect(postL, 0, postR - postL, h); }

    /* Ticks */
    const { major, minor } = tickInterval(zoomLevel);
    const startMs = Math.max(0, Math.floor(scrollLeft / zoomLevel / minor) * minor);
    const endMs = Math.min(totalTimeMs, (scrollLeft + w) / zoomLevel + minor);

    ctx.strokeStyle = TICK_CLR;
    ctx.fillStyle = LABEL_CLR;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let ms = startMs; ms <= endMs; ms += minor) {
      const x = ms * zoomLevel - scrollLeft;
      if (x < -10 || x > w + 10) continue;
      const isMaj = ms % major === 0;

      ctx.beginPath();
      ctx.lineWidth = isMaj ? 1 : 0.5;
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - (isMaj ? MAJOR_TICK : MINOR_TICK));
      ctx.stroke();

      if (isMaj) ctx.fillText(fmtTime(ms), x, 2);
    }
  }, [width, totalTimeMs, preRollMs, postRollMs, scrollLeft, zoomLevel, dpr]);

  useEffect(() => { draw(); }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClick) return;
    const rect = ref.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ms = Math.max(0, Math.min(totalTimeMs, (x + scrollLeft) / zoomLevel));
    onClick(ms);
  }, [onClick, scrollLeft, zoomLevel, totalTimeMs]);

  return (
    <canvas
      ref={ref}
      style={{ display: 'block', cursor: 'pointer', height: HEIGHT }}
      onClick={handleClick}
    />
  );
}
