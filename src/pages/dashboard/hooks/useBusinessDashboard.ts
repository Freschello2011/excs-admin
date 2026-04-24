import { useQueries, useQuery } from '@tanstack/react-query';
import { platformApi } from '@/api/platform';
import { queryKeys } from '@/api/queryKeys';
import type {
  AiInteractionDTO,
  BusinessPeriod,
  BusinessTodosResp,
  CostTrendDTO,
  RunningStatsDTO,
  StorageCapacityDTO,
} from '@/types/platform';

const BUSINESS_REFRESH_MS = 5 * 60_000;

/**
 * 业务看板 Tab —— 5 min 刷新；period 变化立即刷新（queryKey 含 period，切换即重拉）。
 * PRD §5.1。
 *
 * 返回：todos / running / storage / cost / ai —— 每项独立 loading & error，便于分卡降级。
 */
export function useBusinessDashboard(period: BusinessPeriod, enabled = true) {
  const [todos, running, storage, cost, ai] = useQueries({
    queries: [
      {
        queryKey: queryKeys.platformBusinessTodos,
        queryFn: async (): Promise<BusinessTodosResp> => {
          const res = await platformApi.getBusinessTodos();
          return res.data.data;
        },
        enabled,
        refetchInterval: BUSINESS_REFRESH_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: queryKeys.platformBusinessRunning(period),
        queryFn: async (): Promise<RunningStatsDTO> => {
          const res = await platformApi.getBusinessRunning(period);
          return res.data.data;
        },
        enabled,
        refetchInterval: BUSINESS_REFRESH_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: queryKeys.platformBusinessStorage,
        queryFn: async (): Promise<StorageCapacityDTO> => {
          const res = await platformApi.getBusinessStorage();
          return res.data.data;
        },
        enabled,
        refetchInterval: BUSINESS_REFRESH_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: queryKeys.platformBusinessCost(period),
        queryFn: async (): Promise<CostTrendDTO> => {
          const res = await platformApi.getBusinessCost(period);
          return res.data.data;
        },
        enabled,
        refetchInterval: BUSINESS_REFRESH_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: queryKeys.platformBusinessAi(period),
        queryFn: async (): Promise<AiInteractionDTO> => {
          const res = await platformApi.getBusinessAiInteraction(period);
          return res.data.data;
        },
        enabled,
        refetchInterval: BUSINESS_REFRESH_MS,
        refetchOnWindowFocus: false,
      },
    ],
  });

  return { todos, running, storage, cost, ai };
}

/** 仅 Todos（用在 header / 其它场景独立嵌入时可复用） */
export function useBusinessTodos(enabled = true) {
  return useQuery<BusinessTodosResp>({
    queryKey: queryKeys.platformBusinessTodos,
    queryFn: async () => {
      const res = await platformApi.getBusinessTodos();
      return res.data.data;
    },
    enabled,
    refetchInterval: BUSINESS_REFRESH_MS,
    refetchOnWindowFocus: false,
  });
}
