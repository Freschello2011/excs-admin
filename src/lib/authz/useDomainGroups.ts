/**
 * useDomainGroups —— 把 `action_set.entries` 按业务域 (action.domain) 聚合，并在域内
 * 按 action_code 折叠为「该 action 在哪些 scope 生效」。
 *
 * 与 useScopeGroups 互补：
 *   - useScopeGroups：scope 优先（"在上海能做哪些事"）
 *   - useDomainGroups：域优先（"在演出域能做哪些事"），更贴近操作员业务心智
 *
 * 同时返回每个域下「未授予的关键能力」（risk ≥ medium 且用户没有），用于"反向陈述"卡片：
 *   admin 一眼能判断"是不是还要补授一项"。
 *
 * 兜底：entries / actions 任一为空时返回 []（不抛、不白屏）。
 */
import { useMemo } from 'react';
import type {
  ActionDef,
  GrantRef,
  RiskLevel,
  ScopeType,
  UserActionEntry,
} from '@/api/gen/client';
import { compareDomain, compareRiskDesc, getDomainLabel, RISK_ORDER } from './actionMeta';

export interface DomainGrantedAction {
  code: string;
  nameZh: string;
  domain: string;
  risk: RiskLevel;
  requireReason: boolean;
  requireConfirm: boolean;
  internalOnly: boolean;
  coveredApis: string[];
  /** 该 action 生效的 scope 列表（按 (type, id) 去重） */
  scopes: Array<{ type: ScopeType; id: string }>;
  /** 该 action 的授权来源（同一 entry 在多 grant 重叠时全部列出，按 grant_id 去重） */
  sources: GrantRef[];
}

export interface DomainMissingAction {
  code: string;
  nameZh: string;
  risk: RiskLevel;
  requireReason: boolean;
  requireConfirm: boolean;
}

export interface DomainGroup {
  domain: string;
  domainLabel: string;
  granted: DomainGrantedAction[];
  /** 该域的关键空白：risk ≥ medium 且用户未授予 */
  missingHighRisk: DomainMissingAction[];
  /** granted 中 risk in {high, critical} 的条数（用于卡片角标） */
  highRiskCount: number;
}

const HIGH_RISK_THRESHOLD = RISK_ORDER.indexOf('medium');

function isHighRisk(risk: RiskLevel): boolean {
  return RISK_ORDER.indexOf(risk) >= HIGH_RISK_THRESHOLD;
}

function isCriticalOrHigh(risk: RiskLevel): boolean {
  return risk === 'high' || risk === 'critical';
}

export function useDomainGroups(
  entries: UserActionEntry[] | undefined | null,
  actions: ActionDef[] | undefined | null,
): DomainGroup[] {
  return useMemo(() => {
    const safeEntries = entries ?? [];
    const safeActions = actions ?? [];
    if (safeEntries.length === 0 || safeActions.length === 0) return [];

    const actionByCode = new Map<string, ActionDef>();
    for (const a of safeActions) actionByCode.set(a.code, a);

    // 1. 按 action_code 聚合 scope + sources
    const byCode = new Map<
      string,
      { scopes: Set<string>; sources: Map<number, GrantRef> }
    >();
    for (const e of safeEntries) {
      const key = `${e.scope.type}:${e.scope.id ?? ''}`;
      const slot = byCode.get(e.action_code) ?? {
        scopes: new Set<string>(),
        sources: new Map<number, GrantRef>(),
      };
      slot.scopes.add(key);
      // 同 action_code 多 entry 重叠 → 按 grant_id 去重；后到的覆盖（template_code 期望一致）
      slot.sources.set(e.source.grant_id, e.source);
      byCode.set(e.action_code, slot);
    }

    // 2. 按 domain 分组
    const byDomain = new Map<string, DomainGrantedAction[]>();
    for (const [code, slot] of byCode) {
      const def = actionByCode.get(code);
      if (!def) continue; // 元数据缺失（旧 action 已下架），保守跳过
      const scopes = Array.from(slot.scopes)
        .map((k) => {
          const [type, id] = k.split(':');
          return { type: type as ScopeType, id };
        })
        .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
      const sources = Array.from(slot.sources.values()).sort(
        (a, b) => a.grant_id - b.grant_id,
      );
      const item: DomainGrantedAction = {
        code: def.code,
        nameZh: def.name_zh,
        domain: def.domain,
        risk: def.risk as RiskLevel,
        requireReason: !!def.require_reason,
        requireConfirm: !!def.require_confirm,
        internalOnly: !!def.internal_only,
        coveredApis: def.covered_apis ?? [],
        scopes,
        sources,
      };
      const arr = byDomain.get(def.domain) ?? [];
      arr.push(item);
      byDomain.set(def.domain, arr);
    }

    // 3. 计算域内「关键空白」：仅在该用户已涉及的域上算
    const groups: DomainGroup[] = [];
    for (const [domain, granted] of byDomain) {
      const grantedCodes = new Set(granted.map((g) => g.code));
      const missingHighRisk: DomainMissingAction[] = [];
      for (const def of safeActions) {
        if (def.domain !== domain) continue;
        if (grantedCodes.has(def.code)) continue;
        const risk = def.risk as RiskLevel;
        if (!isHighRisk(risk)) continue;
        missingHighRisk.push({
          code: def.code,
          nameZh: def.name_zh,
          risk,
          requireReason: !!def.require_reason,
          requireConfirm: !!def.require_confirm,
        });
      }
      missingHighRisk.sort(
        (a, b) => compareRiskDesc(a.risk, b.risk) || a.code.localeCompare(b.code),
      );
      granted.sort(
        (a, b) => compareRiskDesc(a.risk, b.risk) || a.code.localeCompare(b.code),
      );
      groups.push({
        domain,
        domainLabel: getDomainLabel(domain),
        granted,
        missingHighRisk,
        highRiskCount: granted.filter((g) => isCriticalOrHigh(g.risk)).length,
      });
    }

    // 4. 域排序：业务优先级
    groups.sort((a, b) => compareDomain(a.domain, b.domain));
    return groups;
  }, [entries, actions]);
}
