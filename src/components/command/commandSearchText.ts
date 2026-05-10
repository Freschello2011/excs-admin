/**
 * 给 antd Select 的 filterOption 用：把 EffectiveCommand 的"可搜索文本"展平。
 * 用户输入 "kaishi" / "开始" / "preset" 都能命中。
 *
 * 单独成文件以满足 react-refresh/only-export-components 规则
 * （CommandLabel.tsx 仅 default-export 组件本体）。
 */
import type { EffectiveCommand } from '@/api/gen/client';

export function commandSearchText(
  command: Pick<EffectiveCommand, 'name' | 'code' | 'resolved_code'>,
): string {
  return [command.name ?? '', command.code ?? '', command.resolved_code ?? '']
    .join(' ')
    .toLowerCase();
}
