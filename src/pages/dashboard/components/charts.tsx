/**
 * SVG 渲染函数 1:1 平移自 07-ui/mockup/03-dashboard/dashboard-v2-mockup.html。
 *
 * 三个场景：
 *  - Trend24Chart —— 24h 资源曲线 + 80% 阈值虚线 + 阈值区域底色
 *  - ValueChart   —— 7 周期原值曲线 + 起始值基线虚线
 *  - PctChart     —— 7 周期环比涨幅曲线 + 0% 基线 + 正负双色渐变
 *
 * 全部用 React + 内联 SVG，不引新图表库。
 */

import { useId } from 'react';

function pointsPath(points: ReadonlyArray<readonly [number, number]>): string {
  return 'M ' + points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ');
}

// ============================================================================
// Trend24Chart —— 24h 资源曲线 + 80% 阈值虚线
// ============================================================================

interface Trend24ChartProps {
  /** 24 个采样点（0-100% 百分比）；长度可为任意，线性分布 */
  data: number[];
  color: string;
  /** 阈值（默认 80%）；超过阈值的区域会有淡红背景 */
  threshold?: number;
}

export function Trend24Chart({ data, color, threshold = 80 }: Trend24ChartProps) {
  const gradId = useId().replace(/[^a-z0-9]/gi, '') + 'gt';

  if (data.length < 2) {
    return <svg width="100%" height="44" viewBox="0 0 100 44" preserveAspectRatio="none" />;
  }

  const W = 100;
  const H = 44;
  const padTop = 4;
  const padBot = 4;
  const yFor = (v: number) => padTop + (1 - v / 100) * (H - padTop - padBot);
  const thrY = yFor(threshold);
  const topY = yFor(100);
  const pts: Array<[number, number]> = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    yFor(v),
  ]);
  const linePath = pointsPath(pts);
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;
  const [lastX, lastY] = pts[pts.length - 1];

  return (
    <svg width="100%" height="44" viewBox="0 0 100 44" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={0} y={topY} width={W} height={thrY - topY} fill="#D84C5E" opacity="0.04" />
      <line x1={0} y1={thrY} x2={W} y2={thrY} stroke="#D84C5E" strokeWidth="0.5" strokeDasharray="3 2" opacity="0.65" />
      <text x={W} y={thrY - 1} fontSize="6" textAnchor="end" fill="#D84C5E">{threshold}%</text>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.2" fill={color} />
    </svg>
  );
}

// ============================================================================
// ValueChart —— 7 周期原值曲线 + 起始值基线
// ============================================================================

interface ValueChartProps {
  data: number[];
  color: string;
}

export function ValueChart({ data, color }: ValueChartProps) {
  const gradId = useId().replace(/[^a-z0-9]/gi, '') + 'gv';

  if (data.length < 2) {
    return <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 100;
  const H = 40;
  const padT = 6;
  const padB = 6;
  const first = data[0];
  const baseY = padT + (1 - (first - min) / range) * (H - padT - padB);
  const pts: Array<[number, number]> = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    padT + (1 - (v - min) / range) * (H - padT - padB),
  ]);
  const linePath = pointsPath(pts);
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;
  const [lastX, lastY] = pts[pts.length - 1];

  return (
    <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={0} y1={baseY} x2={W} y2={baseY} stroke="#C6C9D7" strokeWidth="0.6" strokeDasharray="2 2" />
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

// ============================================================================
// PctChart —— 环比涨幅 % 曲线；0% 基线 + 正绿负红双渐变
// ============================================================================

interface PctChartProps {
  data: number[];
  color: string;
}

export function PctChart({ data, color }: PctChartProps) {
  const gradId = useId().replace(/[^a-z0-9]/gi, '') + 'gp';

  if (data.length < 2) {
    return <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none" />;
  }

  const absMax = Math.max(...data.map((v) => Math.abs(v))) || 1;
  const W = 100;
  const H = 40;
  const zeroY = H / 2;
  const scale = (H / 2 - 4) / absMax;
  const pts: Array<[number, number]> = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    zeroY - v * scale,
  ]);
  const linePath = pointsPath(pts);
  const areaPath = `${linePath} L ${W},${zeroY} L 0,${zeroY} Z`;
  const last = data[data.length - 1];
  const dotColor = last >= 0 ? '#2F9E5A' : '#D84C5E';
  const [lastX, lastY] = pts[pts.length - 1];

  return (
    <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2F9E5A" stopOpacity="0.22" />
          <stop offset="50%" stopColor={color} stopOpacity="0" />
          <stop offset="100%" stopColor="#D84C5E" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#6E7189" strokeWidth="0.7" strokeDasharray="3 2" opacity="0.6" />
      <text x={0} y={zeroY - 1} fontSize="7" fill="#6E7189">0%</text>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.6" fill={dotColor} stroke={color} strokeWidth="0.6" />
    </svg>
  );
}

// ============================================================================
// Ring —— 环形进度（资源使用率卡片左上）
// ============================================================================

interface RingProps {
  percent: number; // 0-100
  color: string;
  size?: number;
}

export function Ring({ percent, color, size = 68 }: RingProps) {
  const R = 32;
  const C = 2 * Math.PI * R;
  const dashoffset = C * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
      <circle cx={40} cy={40} r={R} stroke="var(--color-surface-container)" fill="none" strokeWidth="7" />
      <circle
        cx={40}
        cy={40}
        r={R}
        stroke={color}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={C.toFixed(2)}
        strokeDashoffset={dashoffset.toFixed(2)}
        style={{
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transition: 'stroke-dashoffset 0.5s',
        }}
      />
    </svg>
  );
}
