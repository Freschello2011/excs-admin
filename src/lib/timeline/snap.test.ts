import { describe, it, expect } from 'vitest';
import {
  findSnapTarget,
  buildSecondCandidates,
  buildActionEdgeCandidates,
} from './snap';

describe('findSnapTarget', () => {
  it('returns null when no candidate is within threshold', () => {
    // zoomLevel 0.1 px/ms → 50ms = 5px > 8px? no, = 5px ≤ 8 → would snap.
    // Use bigger gap: 200ms = 20px (> 8px threshold).
    const r = findSnapTarget(800, [1000], 8, 0.1);
    expect(r).toBeNull();
  });

  it('snaps to a candidate within threshold', () => {
    // 950 ms vs candidate 1000 ms; gap 50ms × 0.1 px/ms = 5px ≤ 8px → snap.
    const r = findSnapTarget(950, [1000], 8, 0.1);
    expect(r).not.toBeNull();
    expect(r!.snappedMs).toBe(1000);
    expect(r!.hitTarget).toBe(1000);
  });

  it('picks the nearest candidate when multiple are within threshold', () => {
    // 970 ms vs [1000, 940]: gaps 30ms (3px) vs 30ms (3px) — tie; take first
    // 980 ms vs [1000, 940]: gaps 20ms (2px) vs 40ms (4px); pick 1000.
    const r = findSnapTarget(980, [1000, 940], 8, 0.1);
    expect(r!.snappedMs).toBe(1000);
  });

  it('returns null on empty candidates', () => {
    expect(findSnapTarget(500, [], 8, 0.1)).toBeNull();
  });

  it('returns null when zoomLevel <= 0', () => {
    expect(findSnapTarget(500, [500], 8, 0)).toBeNull();
    expect(findSnapTarget(500, [500], 8, -1)).toBeNull();
  });

  it('threshold scales with zoomLevel', () => {
    // 500 ms gap. At zoomLevel 0.01 px/ms → 5px ≤ 8 → snap.
    expect(findSnapTarget(0, [500], 8, 0.01)).not.toBeNull();
    // Same gap at zoomLevel 0.1 → 50px > 8 → no snap.
    expect(findSnapTarget(0, [500], 8, 0.1)).toBeNull();
  });

  it('snaps exactly at threshold boundary (≤)', () => {
    // 80ms × 0.1 = 8px == threshold → snap
    expect(findSnapTarget(0, [80], 8, 0.1)).not.toBeNull();
    // 81ms × 0.1 = 8.1 > 8 → no snap
    expect(findSnapTarget(0, [81], 8, 0.1)).toBeNull();
  });
});

describe('buildSecondCandidates', () => {
  it('emits all whole-second marks 0..floor(total/1000)', () => {
    expect(buildSecondCandidates(0)).toEqual([]);
    expect(buildSecondCandidates(2500)).toEqual([0, 1000, 2000]);
    expect(buildSecondCandidates(3000)).toEqual([0, 1000, 2000, 3000]);
  });

  it('handles negative duration', () => {
    expect(buildSecondCandidates(-1000)).toEqual([]);
  });
});

describe('buildActionEdgeCandidates', () => {
  const tracks = [
    { actions: [
      { id: 1, start_time_ms: 1000, duration_ms: 2000 },  // edges 1000, 3000
      { id: 2, start_time_ms: 5000, duration_ms: 500 },   // edges 5000, 5500
    ] },
    { actions: [
      { id: 3, start_time_ms: 8000, duration_ms: 1000 },  // edges 8000, 9000
    ] },
  ];

  it('collects start + end of every action across all tracks', () => {
    const out = buildActionEdgeCandidates(tracks, null);
    expect(out.sort((a, b) => a - b)).toEqual([1000, 3000, 5000, 5500, 8000, 9000]);
  });

  it('excludes the action whose id is excludeId', () => {
    const out = buildActionEdgeCandidates(tracks, 2);
    expect(out.sort((a, b) => a - b)).toEqual([1000, 3000, 8000, 9000]);
  });

  it('excludeId=null keeps all', () => {
    expect(buildActionEdgeCandidates(tracks, null)).toHaveLength(6);
  });
});
