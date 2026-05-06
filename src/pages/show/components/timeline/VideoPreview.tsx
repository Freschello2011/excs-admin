import { useRef, useEffect, useCallback } from 'react';
import { Spin } from 'antd';
import { VideoCameraOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { SpriteSheet } from '@/api/gen/client';

/* ==================== State inference ==================== */

type PreviewState = 'absent' | 'processing' | 'failed' | 'degraded' | 'ready';

const PROCESSING_STATUSES = new Set([
  'uploading', 'encrypting', 'encrypted',
  'generating_thumbnail', 'ai_tagging', 'publishing',
]);

function inferState(
  baseContentId: number | null | undefined,
  pipelineStatus: string | undefined,
  spriteSheets: SpriteSheet[],
): PreviewState {
  if (!baseContentId) return 'absent';
  if (pipelineStatus === 'failed') return 'failed';
  if (pipelineStatus && PROCESSING_STATUSES.has(pipelineStatus)) return 'processing';
  // ready 边界：pipeline 标 ready 但 sprite_sheets 中无任何可用 url
  // （数据残骸，例如 OSS 上传失败 / 历史迁移漏写 / pipeline 跑半）
  const hasUsableSheet = spriteSheets.some((s) => s.url && s.frame_count > 0);
  if (!hasUsableSheet) return 'degraded';
  return 'ready';
}

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
  /** 基准视频 id；null/undefined → absent */
  baseContentId?: number | null;
  /** excs_contents.pipeline_status 透传；用于 processing/failed 推断 */
  pipelineStatus?: string;
  /** 演出 id，供"前往详情页"链接 */
  showId: number;
}

/* ==================== Component ==================== */

/**
 * 把 sprite sheet 中第 localFrameIdx 帧按 contain 方式画到 (cw,ch) canvas。
 * 拆出来便于同步快路径 + 异步加载完成回调共用。
 */
function drawFrameTo(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement, sheet: SpriteSheet,
  localFrameIdx: number, cw: number, ch: number,
) {
  const cols = sheet.columns > 0 ? sheet.columns : 1;
  const col = localFrameIdx % cols;
  const row = Math.floor(localFrameIdx / cols);
  const sx = col * sheet.frame_width;
  const sy = row * sheet.frame_height;
  const sw = sheet.frame_width;
  const sh = sheet.frame_height;
  const frameAspect = sw / sh;
  const containerAspect = cw / ch;
  let dx: number, dy: number, dw: number, dh: number;
  if (frameAspect > containerAspect) {
    dw = cw; dh = cw / frameAspect; dx = 0; dy = (ch - dh) / 2;
  } else {
    dh = ch; dw = ch * frameAspect; dx = (cw - dw) / 2; dy = 0;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawTimeOverlay(
  ctx: CanvasRenderingContext2D, videoTimeMs: number, totalDurationMs: number,
  cw: number, ch: number,
) {
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
}

export default function VideoPreview({
  currentTimeMs, spriteSheets, totalDurationMs, preRollMs, videoDurationMs,
  baseContentId, pipelineStatus, showId,
}: VideoPreviewProps) {
  const state = inferState(baseContentId, pipelineStatus, spriteSheets);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * 同步 draw（关键修复）：
   * 旧版本是 async，每个 currentTimeMs tick 都会 resize canvas（resize 自带清屏）+ 涂黑 +
   * await loadImg。播放 60fps 时多个 in-flight draw 互相清屏 → canvas 永远黑。
   *
   * 新版本：
   * 1) 仅在容器尺寸变化时 resize canvas（用 sizeRef 比对）；
   * 2) 同步快路径：图已 imgCache 命中 → 直接 drawImage，无 await；
   * 3) 慢路径：未命中时启动 loadImg + epoch 守门，加载完后用 ref 调 redraw 重画一次。
   */
  const sizeRef = useRef({ cw: 0, ch: 0, dpr: 1 });
  const epochRef = useRef(0);
  const drawRef = useRef<() => void>(() => {});

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width: cw, height: ch } = container.getBoundingClientRect();
    if (cw <= 0 || ch <= 0) return;

    const last = sizeRef.current;
    if (last.cw !== cw || last.ch !== ch || last.dpr !== dpr) {
      // resize 会清空 canvas — 仅在确实变化时执行
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      sizeRef.current = { cw, ch, dpr };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 每次 draw 涂背景（现在 resize 不再每帧发生，安全）
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cw, ch);

    // 非 ready 态：JSX overlay 提供文字，canvas 留黑
    if (state !== 'ready') return;

    const validSheets = spriteSheets.filter((s) => s.url && s.frame_count > 0);
    if (validSheets.length === 0 || videoDurationMs <= 0) return;

    const videoTimeMs = Math.max(0, Math.min(currentTimeMs - preRollMs, videoDurationMs));
    const fps = validSheets[0]?.fps || 1;
    const frameIndex = Math.floor(videoTimeMs / 1000 * fps);

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

    // 同步快路径：图已加载完成 → 立即 drawImage
    const cached = imgCache.get(targetSheet.url);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      drawFrameTo(ctx, cached, targetSheet, localFrameIdx, cw, ch);
      drawTimeOverlay(ctx, videoTimeMs, totalDurationMs, cw, ch);
      return;
    }

    // 慢路径：异步加载，epoch 守门
    const myEpoch = ++epochRef.current;
    loadImg(targetSheet.url).then(() => {
      if (myEpoch !== epochRef.current) return; // 已过期，被新 draw 覆盖
      drawRef.current();
    }).catch(() => {
      if (myEpoch !== epochRef.current) return;
      ctx.fillStyle = '#666';
      ctx.font = '12px -apple-system,BlinkMacSystemFont,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('帧加载失败', cw / 2, ch / 2);
    });
  }, [currentTimeMs, spriteSheets, totalDurationMs, preRollMs, videoDurationMs, state]);

  // 把最新 draw 暴露到 ref 给慢路径回调用
  useEffect(() => { drawRef.current = draw; }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ResizeObserver — 容器尺寸变了重画一次（防抖）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => drawRef.current());
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, minHeight: 0, position: 'relative',
        background: '#111', overflow: 'hidden',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {state === 'absent' && (
        <div style={overlayStyle}>
          <VideoCameraOutlined style={{ fontSize: 36 }} />
          <span>无基准视频</span>
          <Link
            to={`/shows/${showId}`}
            style={{ fontSize: 12, color: '#1890ff' }}
          >
            前往详情页选择基准视频 →
          </Link>
        </div>
      )}
      {state === 'processing' && (
        <div style={overlayStyle}>
          <Spin size="large" />
          <span style={{ marginTop: 8 }}>雪碧图生成中（FFmpeg）</span>
          <span style={{ fontSize: 11, color: '#444' }}>
            视频上传后服务端预生成 {pipelineStatus ? `（当前: ${pipelineStatus}）` : ''}；稍后刷新页面
          </span>
        </div>
      )}
      {state === 'failed' && (
        <div style={{ ...overlayStyle, color: '#ff4d4f' }}>
          <ExclamationCircleOutlined style={{ fontSize: 36 }} />
          <span>基准视频处理失败</span>
          <Link to="/contents" style={{ fontSize: 12, color: '#1890ff' }}>
            前往内容管理重试 →
          </Link>
        </div>
      )}
      {state === 'degraded' && (
        <div style={{ ...overlayStyle, color: '#faad14' }}>
          <ExclamationCircleOutlined style={{ fontSize: 36 }} />
          <span>雪碧图 URL 缺失（数据异常）</span>
          <span style={{ fontSize: 11, color: '#888', maxWidth: 360, textAlign: 'center', lineHeight: 1.5 }}>
            pipeline 标 ready 但所有 sheet URL 为空——OSS 上传失败 / 历史迁移漏写 / pipeline 跑半
            {baseContentId ? `（content_id=${baseContentId}）` : ''}
          </span>
          <Link to="/contents" style={{ fontSize: 12, color: '#1890ff' }}>
            前往内容管理重新生成缩略图 →
          </Link>
        </div>
      )}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  color: '#999', gap: 6,
  pointerEvents: 'auto',
};
