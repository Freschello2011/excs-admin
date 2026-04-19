import { useRef, useEffect, useCallback } from 'react';
import { VideoCameraOutlined } from '@ant-design/icons';
import type { SpriteSheet } from '@/types/show';

/* ==================== Image cache ==================== */

const imgCache = new Map<string, HTMLImageElement>();

function loadImg(url: string): Promise<HTMLImageElement> {
  const cached = imgCache.get(url);
  if (cached?.complete) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Note: no crossOrigin needed — we only drawImage, never getImageData/toDataURL
    img.onload = () => { imgCache.set(url, img); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

/* ==================== Props ==================== */

interface VideoPreviewProps {
  currentTimeMs: number;
  spriteSheets: SpriteSheet[];
  totalDurationMs: number;
  preRollMs: number;
  videoDurationMs: number;
}

/* ==================== Component ==================== */

export default function VideoPreview({
  currentTimeMs, spriteSheets, totalDurationMs, preRollMs, videoDurationMs,
}: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width: cw, height: ch } = container.getBoundingClientRect();
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cw, ch);

    // Check if we have valid sprite sheets with URLs
    const validSheets = spriteSheets.filter((s) => s.url && s.frame_count > 0);
    if (validSheets.length === 0 || videoDurationMs <= 0) {
      // Empty state — draw nothing, the JSX overlay handles this
      return;
    }

    // Calculate which frame to show based on current time
    // Frame time is relative to video (subtract pre-roll)
    const videoTimeMs = Math.max(0, Math.min(currentTimeMs - preRollMs, videoDurationMs));
    const fps = validSheets[0]?.fps || 1;
    const frameIndex = Math.floor(videoTimeMs / 1000 * fps);

    // Find which sprite sheet contains this frame
    let accFrames = 0;
    let targetSheet: SpriteSheet | null = null;
    let localFrameIdx = 0;

    for (const sheet of validSheets) {
      if (frameIndex < accFrames + sheet.frame_count) {
        targetSheet = sheet;
        localFrameIdx = frameIndex - accFrames;
        break;
      }
      accFrames += sheet.frame_count;
    }

    if (!targetSheet) {
      targetSheet = validSheets[validSheets.length - 1];
      localFrameIdx = targetSheet.frame_count - 1;
    }

    if (!targetSheet?.url) return;

    try {
      const img = await loadImg(targetSheet.url);

      const col = localFrameIdx % targetSheet.columns;
      const row = Math.floor(localFrameIdx / targetSheet.columns);
      const sx = col * targetSheet.frame_width;
      const sy = row * targetSheet.frame_height;
      const sw = targetSheet.frame_width;
      const sh = targetSheet.frame_height;

      // Draw frame centered with aspect ratio preserved
      const frameAspect = sw / sh;
      const containerAspect = cw / ch;

      let dx: number, dy: number, dw: number, dh: number;
      if (frameAspect > containerAspect) {
        // Frame is wider - fit to width
        dw = cw;
        dh = cw / frameAspect;
        dx = 0;
        dy = (ch - dh) / 2;
      } else {
        // Frame is taller - fit to height
        dh = ch;
        dw = ch * frameAspect;
        dx = (cw - dw) / 2;
        dy = 0;
      }

      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);

      // Time overlay
      const secs = Math.floor(videoTimeMs / 1000);
      const mins = Math.floor(secs / 60);
      const secR = secs % 60;
      const millis = Math.floor(videoTimeMs % 1000);
      const timeStr = `${String(mins).padStart(2, '0')}:${String(secR).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;

      const totalSecs = Math.floor(totalDurationMs / 1000);
      const totalMins = Math.floor(totalSecs / 60);
      const totalSecR = totalSecs % 60;
      const totalStr = `${String(totalMins).padStart(2, '0')}:${String(totalSecR).padStart(2, '0')}`;

      const label = `${timeStr} / ${totalStr}`;
      ctx.font = '12px "SF Mono",Menlo,monospace';
      const tm = ctx.measureText(label);
      const px = cw - tm.width - 16;
      const py = ch - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(px - 6, py - 13, tm.width + 12, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(label, px, py);
    } catch {
      ctx.fillStyle = '#666';
      ctx.font = '12px -apple-system,BlinkMacSystemFont,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('帧加载失败', cw / 2, ch / 2);
    }
  }, [currentTimeMs, spriteSheets, totalDurationMs, preRollMs, videoDurationMs]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer (debounced to avoid loops)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => draw());
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [draw]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, minHeight: 0, position: 'relative',
        background: '#111', overflow: 'hidden',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {(spriteSheets.length === 0 || !spriteSheets.some((s) => s.url && s.frame_count > 0)) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#555', gap: 8,
        }}>
          <VideoCameraOutlined style={{ fontSize: 36 }} />
          <span>无基准视频</span>
          <span style={{ fontSize: 11, color: '#444' }}>选择基准视频后显示帧预览</span>
        </div>
      )}
    </div>
  );
}
