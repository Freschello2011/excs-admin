import { useRef, useCallback, useEffect, useState } from 'react';

const COLOR = '#ff4d4f';
const TRI = 8; // triangle half-width

/* ── Props ── */
export interface PlaybackCursorProps {
  currentTimeMs: number;
  totalTimeMs: number;
  /** Height of the overlay area */
  height: number;
  scrollLeft: number;
  zoomLevel: number;
  onSeek: (timeMs: number) => void;
}

export default function PlaybackCursor({
  currentTimeMs, totalTimeMs, height, scrollLeft, zoomLevel, onSeek,
}: PlaybackCursorProps) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef<{ x: number; t: number } | null>(null);

  const x = currentTimeMs * zoomLevel - scrollLeft;

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    origin.current = { x: e.clientX, t: currentTimeMs };
  }, [currentTimeMs]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      if (!origin.current) return;
      const dx = e.clientX - origin.current.x;
      const t = Math.max(0, Math.min(totalTimeMs, origin.current.t + dx / zoomLevel));
      onSeek(t);
    };
    const up = () => { setDragging(false); origin.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [dragging, zoomLevel, totalTimeMs, onSeek]);

  /* Off-screen → hide */
  if (x < -TRI * 2 || x > 9999) return null;

  return (
    <div
      style={{
        position: 'absolute', top: 0, left: x, width: 0, height,
        pointerEvents: 'none', zIndex: 100,
      }}
    >
      {/* Triangle head */}
      <svg
        width={TRI * 2} height={TRI}
        style={{
          position: 'absolute', top: 0, left: -TRI,
          pointerEvents: 'auto', cursor: dragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={onDown}
      >
        <polygon points={`0,0 ${TRI * 2},0 ${TRI},${TRI}`} fill={COLOR} />
      </svg>
      {/* Vertical line */}
      <div
        style={{
          position: 'absolute', top: TRI, left: -0.5,
          width: 1, height: height - TRI,
          background: COLOR,
          pointerEvents: 'auto', cursor: dragging ? 'grabbing' : 'ew-resize',
        }}
        onMouseDown={onDown}
      />
    </div>
  );
}
