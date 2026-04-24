import { useMemo } from 'react';
import type { ScopeType, UserActionEntry } from '@/types/authz';

export interface ScopeGroup {
  key: string;
  scopeType: ScopeType;
  scopeId: string;
  actions: string[];
}

/**
 * useScopeGroups —— 把 `action_set.entries` 按 scope (type + id) 聚合并去重 action_code。
 *
 * 抽自 UserAuthzPanel.tsx:118-138（原 scopeGroups useMemo），作为基本信息 Tab
 * 「能做什么」卡片与「权限」Tab 共用逻辑（PRD §8.8.8）。
 *
 * Part 0 修复兜底（防 0-grant 白屏）：入参可能为 undefined / null（后端未返回 entries
 * 或前端缓存未命中），此处统一按 [] 处理，不依赖调用方再 guard。
 */
export function useScopeGroups(
  entries: UserActionEntry[] | undefined | null,
): ScopeGroup[] {
  return useMemo(() => {
    const safe = entries ?? [];
    if (safe.length === 0) return [];
    const groups = new Map<string, UserActionEntry[]>();
    for (const entry of safe) {
      const key = `${entry.scope.type}:${entry.scope.id || ''}`;
      const arr = groups.get(key) ?? [];
      arr.push(entry);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).map(([key, items]) => {
      const [scopeType, scopeId] = key.split(':');
      const actionsSet = new Set(items.map((e) => e.action_code));
      return {
        key,
        scopeType: scopeType as ScopeType,
        scopeId,
        actions: Array.from(actionsSet).sort(),
      };
    });
  }, [entries]);
}
