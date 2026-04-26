/**
 * AccountTypeTag —— 统一账号类型徽章（internal / vendor / customer）。
 *
 * 输入兼容老 user_type（employee / supplier）字段，内部走 resolveAccountType()
 * 兜底推断（PRD §4.4，Phase 9 稳定 2 周后删 user_type）。
 *
 * 替换前散落在 UserProfileCard / UserListPage / GrantListPage / GrantWizardPage 的
 * 零散 ACCOUNT_TYPE_LABELS 写法。
 */
import { Tag } from 'antd';
import { resolveAccountType, type AccountTypeBearer } from '@/api/gen/client';
import type { AccountType } from '@/api/gen/client';

const ACCOUNT_TYPE_META: Record<AccountType, { label: string; color: string }> = {
  internal: { label: '内部员工', color: 'blue' },
  vendor: { label: '供应商', color: 'orange' },
  customer: { label: '客户', color: 'purple' },
};

export function getAccountTypeMeta(accountType: AccountType) {
  return ACCOUNT_TYPE_META[accountType];
}

export interface AccountTypeTagProps {
  /** 直接传 account_type，或传一个含 account_type/user_type 的局部对象（自动 resolve） */
  accountType?: AccountType | string | null;
  user?: AccountTypeBearer | null;
  /** vendor 主账号星标徽章，外部按需追加（不在本组件内判定） */
}

export default function AccountTypeTag({ accountType, user }: AccountTypeTagProps) {
  let resolved: AccountType;
  if (accountType && (accountType === 'internal' || accountType === 'vendor' || accountType === 'customer')) {
    resolved = accountType;
  } else if (user) {
    resolved = resolveAccountType(user);
  } else {
    resolved = 'internal';
  }
  const meta = ACCOUNT_TYPE_META[resolved];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}
