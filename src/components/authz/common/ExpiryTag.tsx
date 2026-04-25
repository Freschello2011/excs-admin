/**
 * ExpiryTag —— 统一过期时间徽章。
 *
 * 替换前散落在 6 处的零散写法（GrantSummaryCard / VendorListPage / VendorInfoCard /
 * GrantListPage / UserAuthzPanel / VendorDetailPage）。
 *
 * 颜色规则（与 PRD §6.4 决策对齐）：
 *   - 已过期         → red
 *   - 剩 ≤ 7 天      → red（即将过期）
 *   - 剩 ≤ 30 天     → orange（warning）
 *   - 剩 ≤ 90 天     → gold
 *   - 永久 / null    → default 灰
 *   - 其他           → default
 */
import { Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';

export type ExpiryTagVariant = 'full' | 'compact' | 'days-only';

export interface ExpiryTagProps {
  /** 过期时间 ISO 字符串；null / undefined = 永久 */
  expiresAt?: string | null;
  /** full = "到期 2026-04-25（剩 30 天）"；compact = "2026-04-25"；days-only = "剩 30 天" */
  variant?: ExpiryTagVariant;
  /** 永久时显示的文本，默认 "永久" */
  permanentText?: string;
}

export default function ExpiryTag({
  expiresAt,
  variant = 'full',
  permanentText = '永久',
}: ExpiryTagProps) {
  if (!expiresAt) {
    return <Tag>{permanentText}</Tag>;
  }
  const now = dayjs();
  const exp = dayjs(expiresAt);
  const diffDays = exp.diff(now, 'day');
  const dateText = exp.format('YYYY-MM-DD');

  if (diffDays < 0) {
    const daysAgo = -diffDays;
    return (
      <Tooltip title={`已于 ${dateText} 过期（${daysAgo} 天前）`}>
        <Tag color="error">
          {variant === 'days-only' ? `已过期 ${daysAgo} 天` : `已过期 ${dateText}`}
        </Tag>
      </Tooltip>
    );
  }

  let color: string;
  if (diffDays <= 7) color = 'error';
  else if (diffDays <= 30) color = 'warning';
  else if (diffDays <= 90) color = 'gold';
  else color = 'default';

  let label: string;
  if (variant === 'compact') label = dateText;
  else if (variant === 'days-only') label = `剩 ${diffDays} 天`;
  else label = `${dateText}（剩 ${diffDays} 天）`;

  return (
    <Tooltip title={`到期：${dateText} · 剩 ${diffDays} 天`}>
      <Tag color={color}>{label}</Tag>
    </Tooltip>
  );
}
