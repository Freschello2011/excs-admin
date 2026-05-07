/**
 * Feature flags 读取工具（admin 浏览器侧）
 *
 * S5-9（ADR-0020-v2 Stage 5 admin Phase C）：runbook_v2_admin。
 *
 * 来源：localStorage（admin 浏览器 console 切换；不入 zustand / 不走 server）
 *   - 'runbook_v2_admin' = '1' | 'true' | 'on'  → on
 *   - 否则                                      → off（默认）
 *
 * 决策：localStorage 而非 sys-config / window.EXCS_FLAGS。理由：
 *   1) 不引入 server 改动（红线"不动 server"）
 *   2) 不引入新 zustand 字段（避免污染 useAppStore）
 *   3) 浏览器 console 一行命令切换：
 *      localStorage.setItem('runbook_v2_admin','1')
 *   4) 每个 admin 自助 canary，互不影响
 *
 * Phase D（v1 清理）后 flag 默认 on，最终下架。
 */

export type FeatureFlagName = 'runbook_v2_admin';

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(name);
    if (!v) return false;
    return TRUTHY.has(v.toLowerCase());
  } catch {
    return false;
  }
}
