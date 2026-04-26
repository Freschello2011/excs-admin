/**
 * useExplain —— Phase 7 解释器 hook。
 *
 * 在 `lib/authz/can.ts` 的 `explain()` + 60s LRU 之上薄封装，供组件级消费：
 *   - `<Can mode='explain'>` 展示允许/拒绝的原因
 *   - `<RiskyActionButton>` 取决策并在操作前告知风险
 *
 * 不重做缓存 —— 走底层 explain() 的 LRU。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { explain } from '@/lib/authz/can';
import type { ExplainResult, ResourceRef } from '@/api/gen/client';

interface UseExplainResult {
  loading: boolean;
  result: ExplainResult | null;
  refetch: () => Promise<void>;
}

export function useExplain(
  action: string,
  resource?: ResourceRef,
  enabled: boolean = true,
): UseExplainResult {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resKey = resource ? `${resource.type}:${resource.id}` : '';

  const doFetch = useCallback(async () => {
    if (!enabled || !action) return;
    setLoading(true);
    const res = await explain(action, resource);
    if (!mountedRef.current) return;
    setResult(res);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, enabled, resKey]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return {
    loading,
    result,
    refetch: doFetch,
  };
}
