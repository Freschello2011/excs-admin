/**
 * ScopeTag —— 统一授权范围徽章。
 *
 * 替换前散落在 UserAuthzPanel / GrantSummaryCard / UserActionSetSummaryCard /
 * GrantListPage / GrantWizardPage / HallAuthzPanel 的 SCOPE_META + hallMap 解析。
 *
 * 颜色与 useScopeGroups / GrantSummaryCard 对齐。
 *
 * 用法：
 *   <ScopeTag scopeType="H" scopeId="3" hallNameMap={hallMap} />
 *   → "展厅 · 上海展厅"
 *   <ScopeTag scopeType="G" />
 *   → "全局"
 */
import { Tag } from 'antd';
import type { ScopeType } from '@/api/gen/client';

const SCOPE_META: Record<ScopeType, { label: string; color: string }> = {
  G: { label: '全局', color: 'purple' },
  T: { label: '租户', color: 'cyan' },
  H: { label: '展厅', color: 'blue' },
  E: { label: '展项', color: 'geekblue' },
  O: { label: '归属', color: 'orange' },
};

export const SCOPE_ORDER: ScopeType[] = ['G', 'T', 'H', 'E', 'O'];

export function getScopeMeta(scopeType: ScopeType) {
  return SCOPE_META[scopeType];
}

export interface ScopeTagProps {
  scopeType: ScopeType;
  /** 资源 ID；G scope 可省略 */
  scopeId?: string | number | null;
  /** 展厅 ID → 名称映射；H scope 时若提供则替换 ID 为名称 */
  hallNameMap?: Map<number, string>;
  /** 展项 ID → 名称映射；E scope 时若提供则替换 ID 为名称 */
  exhibitNameMap?: Map<number, string>;
  /** 仅渲染范围标签文本（不带 ID）；适合空间紧张的列表场景 */
  short?: boolean;
}

/** 解析 scope 文本（不含 Tag 包装），便于在 Tooltip / Description 等场景复用 */
export function resolveScopeText(props: Omit<ScopeTagProps, 'short'>): string {
  const { scopeType, scopeId, hallNameMap, exhibitNameMap } = props;
  const meta = SCOPE_META[scopeType];
  if (scopeType === 'G') return meta.label;
  if (scopeId == null || scopeId === '') return meta.label;
  if (scopeType === 'H' && hallNameMap) {
    const name = hallNameMap.get(Number(scopeId));
    return name ? `${meta.label} · ${name}` : `${meta.label} · #${scopeId}`;
  }
  if (scopeType === 'E' && exhibitNameMap) {
    const name = exhibitNameMap.get(Number(scopeId));
    return name ? `${meta.label} · ${name}` : `${meta.label} · #${scopeId}`;
  }
  return `${meta.label} · ${scopeId}`;
}

export default function ScopeTag(props: ScopeTagProps) {
  const meta = SCOPE_META[props.scopeType];
  const text = props.short ? meta.label : resolveScopeText(props);
  return <Tag color={meta.color}>{text}</Tag>;
}
