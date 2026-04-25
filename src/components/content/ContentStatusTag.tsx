/**
 * ContentStatusTag —— 内容生命周期状态徽章（Phase 12 抽出）。
 *
 * 全站统一 5 态配色（PRD §7.2）：
 *   - pending_accept → gold（待接收）
 *   - bound          → green（已绑定）
 *   - rejected       → red（已驳回）
 *   - withdrawn      → default（已撤回）
 *   - archived       → default-dim（已归档）
 * 老流水线状态（uploading/processing/ready/error）兜底显示。
 *
 * 使用：替换 ContentGroupListPage / MyContentsPage / VendorDetailPage 内分散的
 * Tag color 表，避免配色漂移。
 */
import { Tag } from 'antd';
import type { ContentStatus } from '@/types/content';

interface ContentStatusTagProps {
  status: ContentStatus | string;
}

const META: Record<string, { color: string; label: string }> = {
  pending_accept: { color: 'gold', label: '待接收' },
  bound: { color: 'green', label: '已绑定' },
  rejected: { color: 'red', label: '已驳回' },
  withdrawn: { color: 'default', label: '已撤回' },
  archived: { color: 'default', label: '已归档' },
  // 兼容老流水线
  uploading: { color: 'blue', label: '上传中' },
  processing: { color: 'blue', label: '处理中' },
  ready: { color: 'green', label: '就绪' },
  error: { color: 'red', label: '失败' },
};

export const CONTENT_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(META).map(([k, v]) => [k, v.label]),
);

export default function ContentStatusTag({ status }: ContentStatusTagProps) {
  const meta = META[status] ?? { color: 'default', label: status };
  if (status === 'archived') {
    return <Tag color="default" style={{ opacity: 0.65 }}>{meta.label}</Tag>;
  }
  return <Tag color={meta.color}>{meta.label}</Tag>;
}
