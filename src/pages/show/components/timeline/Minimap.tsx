import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShowTrack, TrackType } from '@/api/gen/client';

/* ──────────────── Constants ──────────────── */

const HEIGHT = 60;
const PADDING_X = 4;
const PADDING_Y = 4;

/** 单 action 微缩矩形最小宽度（防止极短动作消失成 0px） */
const MIN_ACTION_W = 1.5;
/** action 行高 = (可绘高度 / 行数) - GAP；最多平铺 4 行 */
const MAX_ROWS = 4;
const ROW_GAP = 1;

const BG = 'var(--ant-color-bg-layout)';
const TRACK_BG = 'rgba(0,0,0,0.04)';
const ROLL_BG = 'rgba(0,0,0,0.10)';
const VP_FILL = 'rgba(22,119,255,0.18)';
const VP_STROKE = '#1677ff';
const CURSOR = '#ff4d4f';

/** 与 TrackArea 同款配色（保持视觉一致） */
const TRACK_TYPE_COLORS: Record<TrackType, string> = {
  video: '#1677ff', light: '#faad14', mechanical: '#722ed1', audio: '#52c41a', custom: '#8c8c8c',
};

/* ──────────────── Props ──────────────── */

export interface MinimapProps {
  tracks: ShowTrack[];
  totalDurationMs: number;
  preRollMs: number;
  postRollMs: number;
  /** 主时间线 viewport 宽度（px，用于计算蓝框宽度比例） */
  viewportWidth: number;
  /** 主时间线缩放（px/ms） */
  zoomLevel: number;
  /** 主时间线 scrollLeft（px） */
  scrollLeft: number;
  /** 当前播放位置（ms） */
  currentTimeMs: number;
  /** 滚动主时间线（px） */
  onScrollLeftChange: (px: number) => void;
}

/* ──────────────── Component ──────────────── */

export default function Minimap({
  tracks, totalDurationMs, preRollMs, postRollMs,
  viewportWidth, zoomLevel, scrollLeft, currentTimeMs,
  onScrollLeftChange,
}: MinimapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  /* 拖动状态：true 时 mousemove 平移 viewport */
  const dragRef = useRef<{ active: boolean; offsetMs: number }>({ active: false, offsetMs: 0 });

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  /* 测量自身宽度 */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* px ↔ ms 比例（minimap 自己的） */
  const drawableW = Math.max(0, width - PADDING_X * 2);
  const msToMiniPx = totalDurationMs > 0 ? drawableW / totalDurationMs : 0;

  /* 主 timeline 总宽（px）+ 最大可滚距 */
  const mainTotalW = totalDurationMs * zoomLevel;
  const maxScroll = Math.max(0, mainTotalW - viewportWidth);

  /* viewport 蓝框（在 minimap 上的位置）—— 直接按 ms 区间换算 */
  const vpStartMs = zoomLevel > 0 ? scrollLeft / zoomLevel : 0;
  const vpEndMs = zoomLevel > 0 ? (scrollLeft + viewportWidth) / zoomLevel : totalDurationMs;
  const vpMidMs = (vpStartMs + vpEndMs) / 2;
  const vpDurationMs = Math.max(0, vpEndMs - vpStartMs);

  /* ──────────────── Draw ──────────────── */

  useEffect(() => {
    const cvs = cvsRef.current;
    if (!cvs || width <= 0) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    cvs.width = width * dpr;
    cvs.height = HEIGHT * dpr;
    cvs.style.width = `${width}px`;
    cvs.style.height = `${HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);

    if (drawableW <= 0 || totalDurationMs <= 0) return;

    /* 1. 全长背景灰条 */
    ctx.fillStyle = TRACK_BG;
    ctx.fillRect(PADDING_X, PADDING_Y, drawableW, HEIGHT - PADDING_Y * 2);

    /* 2. pre/post-roll 区段（更深灰） */
    if (preRollMs > 0) {
      ctx.fillStyle = ROLL_BG;
      ctx.fillRect(PADDING_X, PADDING_Y, preRollMs * msToMiniPx, HEIGHT - PADDING_Y * 2);
    }
    if (postRollMs > 0) {
      const x = PADDING_X + (totalDurationMs - postRollMs) * msToMiniPx;
      ctx.fillStyle = ROLL_BG;
      ctx.fillRect(x, PADDING_Y, postRollMs * msToMiniPx, HEIGHT - PADDING_Y * 2);
    }

    /* 3. Action 微缩矩形（最多平铺 MAX_ROWS 行；溢出按 mod 折叠到现有行） */
    const rowCount = Math.max(1, Math.min(MAX_ROWS, tracks.length || 1));
    const rowAreaH = HEIGHT - PADDING_Y * 2;
    const rowH = (rowAreaH - ROW_GAP * (rowCount - 1)) / rowCount;

    tracks.forEach((track, ti) => {
      const rowIdx = ti % rowCount;
      const y = PADDING_Y + rowIdx * (rowH + ROW_GAP);
      const color = TRACK_TYPE_COLORS[track.track_type as TrackType] ?? TRACK_TYPE_COLORS.custom;
      ctx.fillStyle = color;
      for (const a of track.actions ?? []) {
        const ax = PADDING_X + a.start_time_ms * msToMiniPx;
        const aw = Math.max(MIN_ACTION_W, a.duration_ms * msToMiniPx);
        ctx.fillRect(ax, y, aw, rowH);
      }
    });

    /* 4. Viewport 蓝框 */
    if (vpDurationMs > 0) {
      const vx = PADDING_X + vpStartMs * msToMiniPx;
      const vw = Math.max(2, vpDurationMs * msToMiniPx);
      ctx.fillStyle = VP_FILL;
      ctx.fillRect(vx, 0, vw, HEIGHT);
      ctx.strokeStyle = VP_STROKE;
      ctx.lineWidth = 1;
      ctx.strokeRect(vx + 0.5, 0.5, vw - 1, HEIGHT - 1);
    }

    /* 5. 当前时间红线 */
    if (currentTimeMs >= 0 && currentTimeMs <= totalDurationMs) {
      const cx = PADDING_X + currentTimeMs * msToMiniPx;
      ctx.strokeStyle = CURSOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 0.5, 0);
      ctx.lineTo(cx + 0.5, HEIGHT);
      ctx.stroke();
    }
  }, [
    width, drawableW, dpr,
    tracks, totalDurationMs, preRollMs, postRollMs, msToMiniPx,
    vpStartMs, vpDurationMs,
    currentTimeMs,
  ]);

  /* ──────────────── Interactions ──────────────── */

  /** minimap x 像素 → 主时间线对应 ms */
  const miniXToMs = useCallback((mx: number): number => {
    if (msToMiniPx <= 0) return 0;
    const local = Math.max(0, Math.min(drawableW, mx - PADDING_X));
    return local / msToMiniPx;
  }, [drawableW, msToMiniPx]);

  /** 把指定 ms 居中到主 viewport（或保留 dragOffset） */
  const scrollMainToMs = useCallback((centerMs: number) => {
    const targetScroll = Math.max(0, Math.min(maxScroll, centerMs * zoomLevel - viewportWidth / 2));
    onScrollLeftChange(targetScroll);
  }, [maxScroll, zoomLevel, viewportWidth, onScrollLeftChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const rect = cvsRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const clickMs = miniXToMs(mx);

    // 点击在蓝框内 → 拖动模式（保留 click→vpMid 的偏移，使指针下方位置稳定）
    if (clickMs >= vpStartMs && clickMs <= vpEndMs) {
      dragRef.current = { active: true, offsetMs: clickMs - vpMidMs };
    } else {
      // 点击外部 → 立即将该位置滚到 viewport 中央，并进入拖动（offset=0）
      dragRef.current = { active: true, offsetMs: 0 };
      scrollMainToMs(clickMs);
    }

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      const r = cvsRef.current?.getBoundingClientRect();
      if (!r) return;
      const ms = miniXToMs(ev.clientX - r.left);
      scrollMainToMs(ms - dragRef.current.offsetMs);
    };
    const handleUp = () => {
      dragRef.current.active = false;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [miniXToMs, vpStartMs, vpEndMs, vpMidMs, scrollMainToMs]);

  /* 鼠标悬停在蓝框上 → grab；其它位置 → pointer */
  const [hoverInVp, setHoverInVp] = useState(false);
  const handleMouseMoveCursor = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) return;
    const rect = cvsRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ms = miniXToMs(e.clientX - rect.left);
    setHoverInVp(ms >= vpStartMs && ms <= vpEndMs);
  }, [miniXToMs, vpStartMs, vpEndMs]);

  return (
    <div
      ref={wrapRef}
      style={{
        height: HEIGHT,
        flexShrink: 0,
        background: BG,
        borderTop: '1px solid var(--ant-color-border-secondary)',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <canvas
        ref={cvsRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveCursor}
        onMouseLeave={() => setHoverInVp(false)}
        style={{
          display: 'block',
          cursor: hoverInVp ? 'grab' : 'pointer',
        }}
      />
    </div>
  );
}
