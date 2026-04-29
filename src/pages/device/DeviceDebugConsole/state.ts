/**
 * device-mgmt-v2 P9-C.2 — 调试台状态推断辅助。
 *
 * 把 retained MQTT state.fields.channels（K32 的 "AABB..." / 闪优的 poweron 位图）
 * 解析为 per-channel 的 'on' | 'off' | 'unknown' 视图。
 */
import type { ChannelEntry } from '@/api/channelMap';

export type ChannelState = 'on' | 'off' | 'unknown';

export interface MatrixCellView {
  index: number;
  label?: string;
  group?: string;
  state: ChannelState;
}

/**
 * fromRetainedState 从 retained payload 解 per-channel 状态。
 *
 * 三种来源（按优先级）：
 *   1. fields.channels: string —— K32 协议族 'A'(on) / 'B'(off) / '?'(unknown)
 *   2. fields.poweron: number —— 闪优 16 路位图（bit i = 通道 i+1 的开关）
 *   3. fields.channels: number[] —— 0/1 数组（通用回退）
 *
 * 不在 channel_map 中声明的通道：返回 unknown 而非占位 off（让 UI 用 dashed 显示）。
 */
export function fromRetainedState(
  state: Record<string, unknown> | null | undefined,
  total: number,
): ChannelState[] {
  const out: ChannelState[] = new Array(total).fill('unknown' as ChannelState);
  const fields = (state?.fields ?? null) as Record<string, unknown> | null;
  if (!fields) return out;

  const ch = fields.channels;
  if (typeof ch === 'string') {
    for (let i = 0; i < Math.min(total, ch.length); i++) {
      const c = ch[i];
      if (c === 'A' || c === 'a') out[i] = 'on';
      else if (c === 'B' || c === 'b') out[i] = 'off';
      else out[i] = 'unknown';
    }
    return out;
  }

  const poweron = fields.poweron;
  if (typeof poweron === 'number' && Number.isFinite(poweron)) {
    for (let i = 0; i < total; i++) {
      out[i] = (poweron >> i) & 1 ? 'on' : 'off';
    }
    return out;
  }

  if (Array.isArray(ch)) {
    for (let i = 0; i < Math.min(total, ch.length); i++) {
      const v = ch[i];
      out[i] = v === 1 || v === true || v === 'on' ? 'on' : 'off';
    }
  }
  return out;
}

/** 从 channel_map 索引出 entry，O(N) 但总量小（K32 32 / 闪优 16）。 */
export function findEntry(map: ChannelEntry[], index: number): ChannelEntry | undefined {
  return map.find((e) => e.index === index);
}

/** 校验 ChannelMap 全部条目 index ≤ maxChannel；返回超界条目。 */
export function entriesOutOfRange(map: ChannelEntry[], maxChannel: number): ChannelEntry[] {
  return map.filter((e) => e.index < 1 || e.index > maxChannel);
}

export interface PresetVerifyResult {
  ok: boolean;
  failedChannels: number[];
  ts: number;
}

/** 把 retained payload 与 preset.expected_* 做实测对比。 */
export function verifyPreset(
  preset: {
    expected_channels?: number[];
    expected_state?: '' | 'on' | 'off' | 'blink';
  },
  retained: Record<string, unknown> | null,
  total: number,
): PresetVerifyResult | null {
  if (!preset.expected_channels || preset.expected_channels.length === 0) return null;
  if (!preset.expected_state) {
    return { ok: true, failedChannels: [], ts: Date.now() };
  }
  const states = fromRetainedState(retained, total);
  const failed: number[] = [];
  for (const idx of preset.expected_channels) {
    const s = states[idx - 1];
    if (s !== preset.expected_state) failed.push(idx);
  }
  return { ok: failed.length === 0, failedChannels: failed, ts: Date.now() };
}
