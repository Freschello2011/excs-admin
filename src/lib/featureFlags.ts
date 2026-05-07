/**
 * Feature flags 读取工具（admin 浏览器侧）
 *
 * 来源：localStorage（admin 浏览器 console 切换；不入 zustand / 不走 server）
 *   - <flag-name> = '1' | 'true' | 'on' | 'yes' → on
 *   - 否则                                       → off（默认）
 *
 * 决策：localStorage 而非 sys-config / window.EXCS_FLAGS。理由：
 *   1) 不引入 server 改动（红线"不动 server"）
 *   2) 不引入新 zustand 字段（避免污染 useAppStore）
 *   3) 浏览器 console 一行命令切换：
 *      localStorage.setItem('<flag-name>','1')
 *   4) 每个 admin 自助 canary，互不影响
 *
 * 历史：runbook_v2_admin（S5-9 admin Phase C）→ S5-10 Phase D 默认开后下架。
 */

export type FeatureFlagName = string;

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
