/**
 * 时间轴 Snap 引擎。
 * 把候选时间点（整秒 / 游标 / 其它 action 边缘）都换算成像素距离，
 * 取小于阈值且最近的命中。
 */

export interface SnapResult {
  /** 吸附后的 ms 值 */
  snappedMs: number;
  /** 命中的目标 ms（与 snappedMs 当前一致；保留作为别名以便上层显示用） */
  hitTarget: number;
}

/**
 * 在 candidates 中寻找与 timeMs 距离 ≤ thresholdPx 的最近候选。
 * @param timeMs 当前时间（ms）
 * @param candidates 候选时间点（ms）数组
 * @param thresholdPx 像素阈值（默认 8）
 * @param zoomLevel px / ms
 */
export function findSnapTarget(
  timeMs: number,
  candidates: number[],
  thresholdPx: number,
  zoomLevel: number,
): SnapResult | null {
  if (zoomLevel <= 0 || candidates.length === 0) return null;
  let best: SnapResult | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const distPx = Math.abs((c - timeMs) * zoomLevel);
    if (distPx <= thresholdPx && distPx < bestDist) {
      bestDist = distPx;
      best = { snappedMs: c, hitTarget: c };
    }
  }
  return best;
}

/**
 * 生成整秒候选数组（含 0 和最大整秒）。
 * 总时长很长时（例如 1 小时 = 3600 项）依然 O(N) 可接受。
 */
export function buildSecondCandidates(totalDurationMs: number): number[] {
  if (totalDurationMs <= 0) return [];
  const totalSec = Math.floor(totalDurationMs / 1000);
  const out: number[] = [];
  for (let i = 0; i <= totalSec; i++) out.push(i * 1000);
  return out;
}

/**
 * 收集"其它 action 的起点和终点"作为候选（剔除 excludeId 自身）。
 */
export function buildActionEdgeCandidates(
  tracks: { actions: { id: number; start_time_ms: number; duration_ms: number }[] }[],
  excludeId: number | null,
): number[] {
  const out: number[] = [];
  for (const t of tracks) {
    for (const a of t.actions) {
      if (a.id === excludeId) continue;
      out.push(a.start_time_ms);
      out.push(a.start_time_ms + a.duration_ms);
    }
  }
  return out;
}
