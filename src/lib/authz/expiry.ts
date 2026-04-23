/**
 * 默认过期天数 —— Phase 7 统一抽出（Phase 6 在 GrantWizardPage 内联 makeDefaultExpiry）。
 *
 * 与 PRD §6.4 对齐：
 *   - vendor（供应商账号）   → 180 天
 *   - 含 critical 的 internal → 90 天
 *   - 其他 internal           → 永久（null）
 *
 * 三步向导、续期、RiskyActionButton 默认值共用本函数。
 */
import dayjs, { type Dayjs } from 'dayjs';
import type { AccountType } from '@/types/authz';

/** 返回默认过期天数；null = 永久。 */
export function defaultExpiryDays(
  hasCritical: boolean,
  accountType?: AccountType | null,
): number | null {
  if (accountType === 'vendor') return 180;
  if (hasCritical) return 90;
  return null;
}

/** 便利：返回 Dayjs（用于 DatePicker 预填）。 */
export function makeDefaultExpiry(
  hasCritical: boolean,
  accountType?: AccountType | null,
): Dayjs | null {
  const days = defaultExpiryDays(hasCritical, accountType);
  return days == null ? null : dayjs().add(days, 'day');
}

/** 兼容 Phase 6 `isVendor: boolean` 签名 —— 内部映射为 accountType。 */
export function makeDefaultExpiryLegacy(hasCritical: boolean, isVendor: boolean): Dayjs | null {
  return makeDefaultExpiry(hasCritical, isVendor ? 'vendor' : 'internal');
}
