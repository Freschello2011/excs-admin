/**
 * PRD-inline-command-code-autogen.md §五·P4 — feature flag。
 *
 * 读 sys_configs.device_mgmt.inline_command_code_autogen_enabled（默认 true）。
 *  - true（默认）：保存前空 code 自动按名字 slug + 拼音生成
 *  - false：回退到「保存前手填 code」旧流程；空 code 视作行错误
 *
 * 后端 PUT 守卫（P3 不可变 / 引用方检测）不受 flag 影响——即使关闭 autogen，
 * 已持久化 code 仍不可变，避免回退期数据破坏。
 *
 * 使用 react-query 缓存到全局 store；首次 hit 失败（用户没权限读 sys_config）
 * 兜底为 true，保持默认行为。
 */
import { useQuery } from '@tanstack/react-query';
import { sysConfigApi } from '@/api/sysConfig';
import { queryKeys } from '@/api/queryKeys';

export function useInlineCommandCodeAutogenEnabled(): boolean {
  const { data } = useQuery({
    queryKey: queryKeys.sysConfigGroup('device_mgmt'),
    queryFn: () => sysConfigApi.getGroupConfigs('device_mgmt'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const items = data?.data?.data?.items ?? [];
  const flag = items.find((i) => i.key === 'inline_command_code_autogen_enabled');
  if (!flag) return true; // 配置缺失 / 拉取失败 → 默认开
  return flag.value !== 'false';
}
