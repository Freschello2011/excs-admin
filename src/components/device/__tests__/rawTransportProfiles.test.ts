/**
 * ADR-0030 §D4 — profile chip 检测纯函数单测。
 * 校验「当前 connection_mode + heartbeat + 全部命令 mode 集合」如何映射到 5 个 profile key。
 */
import { describe, it, expect } from 'vitest';
import { detectProfile, RAW_TRANSPORT_PROFILES } from '../rawTransportProfiles';

describe('detectProfile', () => {
  it('短连接 + 心跳关 + 全部命令 mode=none → 灯光盒', () => {
    expect(detectProfile('short', { enabled: false }, ['none', 'none'])).toBe('lightbox');
  });

  it('短连接 + 心跳关 + 全部命令 mode=match → 命令-响应', () => {
    expect(detectProfile('short', { enabled: false }, ['match'])).toBe('request_reply');
  });

  it('长连接 + 心跳开 30s + 全部命令 mode=match → 融合软件', () => {
    expect(
      detectProfile('persistent', { enabled: true, interval_ms: 30000 }, ['match', 'match']),
    ).toBe('media_engine');
  });

  it('长连接 + 心跳开 10s + 全部命令 mode=match → 状态机', () => {
    expect(
      detectProfile('persistent', { enabled: true, interval_ms: 10000 }, ['match']),
    ).toBe('stateful');
  });

  it('命令 mode 不一致 → custom（即便 connection 命中某 profile）', () => {
    expect(detectProfile('short', { enabled: false }, ['none', 'match'])).toBe('custom');
  });

  it('心跳 enabled 但 interval 错位 → custom', () => {
    expect(
      detectProfile('persistent', { enabled: true, interval_ms: 60000 }, ['match']),
    ).toBe('custom');
  });

  it('长连接 + 心跳关 → 不命中任何 profile（融合软件 / 状态机都要求心跳开）', () => {
    expect(detectProfile('persistent', { enabled: false }, ['match'])).toBe('custom');
  });

  it('connection_mode undefined → 兜底当 short 处理（兼容老设备）', () => {
    expect(detectProfile(undefined, { enabled: false }, ['none'])).toBe('lightbox');
  });

  it('命令为空 → 仅按 connection 判定（新设备无命令时）', () => {
    expect(detectProfile('short', { enabled: false }, [])).toBe('lightbox');
    expect(detectProfile('persistent', { enabled: true, interval_ms: 30000 }, [])).toBe(
      'media_engine',
    );
  });

  it('5 个 profile key 全部覆盖（防新加 profile 漏 detect 分支）', () => {
    const keys = RAW_TRANSPORT_PROFILES.map((p) => p.key).sort();
    expect(keys).toEqual(['custom', 'lightbox', 'media_engine', 'request_reply', 'stateful']);
  });
});
