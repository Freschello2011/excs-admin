import { useRef, useEffect, useCallback, useMemo } from 'react';

const HEIGHT = 32;
const VID_COLOR = '#1890ff';
const ROLL_COLOR = 'rgba(24,144,255,0.2)';

/* ── Props ── */
export interface WaveformStripProps {
  /** uint8 peaks (0-255), ~10 samples/sec within the video segment */
  waveformPeaks: number[];
  totalTimeMs: number;
  preRollMs: number;
  postRollMs: number;
  videoDurationMs: number;
  width: number;
  scrollLeft: number;
  zoomLevel: number;
}

export default function WaveformStrip({
  waveformPeaks, totalTimeMs, preRollMs, postRollMs,
  videoDurationMs, width, scrollLeft, zoomLevel,
}: WaveformStripProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const sampleMs = useMemo(
    () => (waveformPeaks.length > 0 && videoDurationMs > 0 ? videoDurationMs / waveformPeaks.length : 100),
    [waveformPeaks.length, videoDurationMs],
  );

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

    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, w, h);

    if (waveformPeaks.length === 0) {
      ctx.fillStyle = '#ccc';
      ctx.font = '11px -apple-system,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无波形数据', w / 2, h / 2);
      return;
    }

    const midY = h / 2;
    const maxAmp = h / 2 - 2;
    const vidStartMs = preRollMs;
    const vidEndMs = totalTimeMs - postRollMs;

    /* Center line */
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    /* Waveform bars */
    ctx.lineWidth = 1;
    for (let i = 0; i < waveformPeaks.length; i++) {
      const ms = vidStartMs + i * sampleMs;
      const x = ms * zoomLevel - scrollLeft;
      if (x < -1 || x > w + 1) continue;

      const amp = (waveformPeaks[i] / 255) * maxAmp;
      ctx.strokeStyle = (ms >= vidStartMs && ms <= vidEndMs) ? VID_COLOR : ROLL_COLOR;
      ctx.beginPath();
      ctx.moveTo(x, midY - amp);
      ctx.lineTo(x, midY + amp);
      ctx.stroke();
    }

    /* Pre-roll overlay */
    const preEnd = preRollMs * zoomLevel - scrollLeft;
    if (preEnd > 0) { ctx.fillStyle = 'rgba(0,0,0,0.04)'; ctx.fillRect(0, 0, Math.min(preEnd, w), h); }

    /* Post-roll overlay */
    const postStart = vidEndMs * zoomLevel - scrollLeft;
    if (postStart < w) {
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.fillRect(Math.max(0, postStart), 0, w - Math.max(0, postStart), h);
    }
  }, [width, waveformPeaks, sampleMs, totalTimeMs, preRollMs, postRollMs, scrollLeft, zoomLevel, dpr]);

  useEffect(() => { draw(); }, [draw]);

  return <canvas ref={ref} style={{ display: 'block', height: HEIGHT }} />;
}
