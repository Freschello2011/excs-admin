import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useHallStore } from '@/stores/hallStore';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';

/**
 * 页面级"展项上下文"双向同步：
 * - URL `?exhibit=:id` ↔ `useHallStore.selectedExhibitId`
 * - 进入页面（深链）时读 URL → store；在本页通过顶栏 / 行内按钮切换展项时 store → URL
 * - 浏览器前进后退改变 URL 时，同步回 store
 * - 切换展厅（`setSelectedHall` 内部清空 exhibit）后自动把 `?exhibit` 从 URL 拿掉
 * - 若 URL 上的 exhibit 不属于当前展厅 → 视为无效深链，抹掉
 *
 * 返回当前有效的 exhibitId（供页面决定显示列表 / 聚焦视图）。
 *
 * 复用 react-query 已有的 `queryKeys.exhibits(hallId)` 缓存，不会多拉一次列表。
 */
export function useExhibitContextSync(): number | undefined {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const selectedExhibitId = useHallStore((s) => s.selectedExhibitId);
  const setSelectedExhibit = useHallStore((s) => s.setSelectedExhibit);
  const clearSelectedExhibit = useHallStore((s) => s.clearSelectedExhibit);

  const { data: exhibits } = useQuery({
    queryKey: queryKeys.exhibits(selectedHallId!),
    queryFn: () => hallApi.getExhibits(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  const urlExhibitId = (() => {
    const raw = searchParams.get('exhibit');
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  const prevUrlRef = useRef<number | undefined>(urlExhibitId);
  const prevStoreRef = useRef<number | undefined>(selectedExhibitId);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const urlChanged = urlExhibitId !== prevUrlRef.current;
    const storeChanged = selectedExhibitId !== prevStoreRef.current;
    const isFirstRun = !hydratedRef.current;

    prevUrlRef.current = urlExhibitId;
    prevStoreRef.current = selectedExhibitId;

    // 已经一致：收工
    if (urlExhibitId === selectedExhibitId) {
      hydratedRef.current = true;
      return;
    }

    // 首次挂载 或 浏览器历史导致 URL 单独变化 → URL 优先（深链来源）
    if (isFirstRun || (urlChanged && !storeChanged)) {
      if (urlExhibitId === undefined) {
        if (isFirstRun) {
          // 首次挂载：URL 无参但 store 有值（localStorage 持久化回填）→ 镜像到 URL
          hydratedRef.current = true;
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (selectedExhibitId) next.set('exhibit', String(selectedExhibitId));
              return next;
            },
            { replace: true },
          );
        } else {
          // 后退/清理：URL 被外部清空 → store 也清
          clearSelectedExhibit();
        }
        return;
      }

      // URL 带 exhibit：等当前展厅的 exhibits 列表加载出来才能拿 name
      if (!exhibits) return;
      hydratedRef.current = true;
      const ex = exhibits.find((e) => e.id === urlExhibitId);
      if (ex) {
        setSelectedExhibit(ex.id, ex.name);
      } else {
        // 无效（不属于当前展厅 / 已删除）→ 抹掉 URL 参数
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('exhibit');
            return next;
          },
          { replace: true },
        );
      }
      return;
    }

    // 其它情况（store 变化，含同步由切展厅触发的清空）→ 镜像 store 到 URL
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selectedExhibitId) next.set('exhibit', String(selectedExhibitId));
        else next.delete('exhibit');
        return next;
      },
      { replace: true },
    );
  }, [
    urlExhibitId,
    selectedExhibitId,
    exhibits,
    setSearchParams,
    setSelectedExhibit,
    clearSelectedExhibit,
  ]);

  return selectedExhibitId;
}
