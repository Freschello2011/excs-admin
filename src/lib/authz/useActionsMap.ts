/**
 * useActionsMap —— 给审计视图用的 ActionDef 映射 hook。
 *
 * 内部走 authzMetaStore（10min TTL，跨页面复用），首次挂载触发 loadActions()，
 * 返回 `Map<code, ActionDef>` 给 audit 行做 code→中文名翻译用。
 *
 * 元数据加载失败时返回空 Map，audit 行 graceful 回退到 raw code 显示。
 */
import { useEffect, useMemo } from 'react';
import { useAuthzMetaStore } from '@/stores/authzMetaStore';
import type { ActionDef } from '@/api/gen/client';

export function useActionsMap(): Map<string, ActionDef> {
  const actions = useAuthzMetaStore((s) => s.actions);
  const loadActions = useAuthzMetaStore((s) => s.loadActions);

  useEffect(() => {
    loadActions().catch(() => {
      /* swallow：元数据失败时降级到 raw code */
    });
  }, [loadActions]);

  return useMemo(() => {
    const m = new Map<string, ActionDef>();
    (actions ?? []).forEach((a) => m.set(a.code, a));
    return m;
  }, [actions]);
}
