import { useRef, useEffect, useCallback, useState } from 'react';
import type { SpriteSheet } from '@/api/gen/client';

const HEIGHT = 32;
const MASK_COLOR = 'rgba(128,128,128,0.5)';

/* ── Image cache (module-level, survives re-renders) ── */
const imgCache = new Map<string, HTMLImageElement>();

function loadImg(url: string): Promise<HTMLImageElement> {
  const cached = imgCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Note: no crossOrigin needed — we only drawImage, never getImageData/toDataURL
    img.onload = () => { imgCache.set(url, img); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

/* ── Props ── */
export interface SpriteStripProps {
  spriteSheets: SpriteSheet[];
  totalTimeMs: number;
  preRollMs: number;
  postRollMs: number;
  width: number;
  scrollLeft: number;
  zoomLevel: number;
}

export default function SpriteStrip({
  spriteSheets, totalTimeMs, preRollMs, postRollMs,
  width, scrollLeft, zoomLevel,
}: SpriteStripProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const [loaded, setLoaded] = useState<Map<string, HTMLImageElement>>(new Map());

  /* Derive frame geometry from first sheet */
  const frame = (() => {
    if (spriteSheets.length === 0) return null;
    const s = spriteSheets[0];
    return {
      intervalMs: s.frame_interval_ms ?? (1000 / s.fps),
      w: s.frame_width,
      h: s.frame_height,
      cols: s.columns,
    };
  })();

  /* Lazy-load sheets intersecting the visible range */
  useEffect(() => {
    if (!frame || spriteSheets.length === 0) return;
    const visStartMs = scrollLeft / zoomLevel;
    const visEndMs = (scrollLeft + width) / zoomLevel;
    const firstF = Math.max(0, Math.floor((visStartMs - preRollMs) / frame.intervalMs));
    const lastF = Math.ceil((visEndMs - preRollMs) / frame.intervalMs);

    const urls: string[] = [];
    let offset = 0;
    for (const sh of spriteSheets) {
      const end = offset + sh.frame_count - 1;
      if (sh.url && end >= firstF && offset <= lastF && !loaded.has(sh.url)) urls.push(sh.url);
      offset += sh.frame_count;
    }
    if (urls.length === 0) return;

    let cancelled = false;
    Promise.all(urls.map(u => loadImg(u).catch(() => null))).then(imgs => {
      if (cancelled) return;
      setLoaded(prev => {
        const next = new Map(prev);
        urls.forEach((u, i) => { if (imgs[i]) next.set(u, imgs[i]!); });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [spriteSheets, scrollLeft, width, zoomLevel, preRollMs, frame, loaded]);

  /* Draw */
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

    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, w, h);

    if (!frame || spriteSheets.length === 0) {
      ctx.fillStyle = '#ccc';
      ctx.font = '11px -apple-system,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无雪碧图数据', w / 2, h / 2);
      return;
    }

    const vidStartPx = preRollMs * zoomLevel;
    const framePx = frame.intervalMs * zoomLevel;

    /* Render frames */
    let gIdx = 0;
    for (const sh of spriteSheets) {
      const img = loaded.get(sh.url);
      for (let f = 0; f < sh.frame_count; f++) {
        if (img) {
          const destX = vidStartPx + (gIdx + f) * framePx - scrollLeft;
          if (destX + framePx >= 0 && destX <= w) {
            const col = f % frame.cols;
            const row = Math.floor(f / frame.cols);
            ctx.drawImage(
              img,
              col * frame.w, row * frame.h, frame.w, frame.h,
              destX, 0, framePx, h,
            );
          }
        }
      }
      gIdx += sh.frame_count;
    }

    /* Pre-roll mask */
    const preEnd = vidStartPx - scrollLeft;
    if (preEnd > 0) { ctx.fillStyle = MASK_COLOR; ctx.fillRect(0, 0, Math.min(preEnd, w), h); }

    /* Post-roll mask */
    const postStart = (totalTimeMs - postRollMs) * zoomLevel - scrollLeft;
    if (postStart < w) {
      ctx.fillStyle = MASK_COLOR;
      ctx.fillRect(Math.max(0, postStart), 0, w - Math.max(0, postStart), h);
    }
  }, [width, spriteSheets, frame, loaded, totalTimeMs, preRollMs, postRollMs, scrollLeft, zoomLevel, dpr]);

  useEffect(() => { draw(); }, [draw]);

  return <canvas ref={ref} style={{ display: 'block', height: HEIGHT }} />;
}
