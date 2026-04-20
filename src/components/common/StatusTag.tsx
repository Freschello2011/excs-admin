import { Tag } from 'antd';

type StatusType =
  | 'normal' | 'grace' | 'expired'
  | 'online' | 'offline'
  | 'running' | 'draft' | 'published' | 'active' | 'disabled'
  | 'empty' | 'processing' | 'ready' | 'error' | 'uploading'
  | 'pending' | 'downloading' | 'failed' | 'completed' | 'skipped'
  | 'idle' | 'thinking' | 'talking' | 'off';

// 低饱和胶囊 + 状态圆点，替代 AntD 默认鲜艳色系。
// 六类语义：success / warning / error / processing / info / neutral
type SemanticKind = 'success' | 'warning' | 'error' | 'processing' | 'info' | 'neutral';

const SEMANTIC_STYLES: Record<SemanticKind, { bg: string; fg: string; dot: string; border: string }> = {
  success:    { bg: 'rgba(47, 158, 90, 0.10)',  fg: 'var(--color-success)',  dot: 'var(--color-success)',       border: 'rgba(47, 158, 90, 0.25)' },
  warning:    { bg: 'rgba(214, 138, 42, 0.10)', fg: 'var(--color-warning)',  dot: 'var(--color-warning)',       border: 'rgba(214, 138, 42, 0.25)' },
  error:      { bg: 'rgba(216, 76, 94, 0.10)',  fg: 'var(--color-error)',    dot: 'var(--color-error)',         border: 'rgba(216, 76, 94, 0.25)' },
  processing: { bg: 'rgba(106, 78, 232, 0.10)', fg: 'var(--color-primary)',  dot: 'var(--color-primary)',       border: 'rgba(106, 78, 232, 0.25)' },
  info:       { bg: 'rgba(106, 78, 232, 0.08)', fg: 'var(--color-primary)',  dot: 'var(--color-primary)',       border: 'rgba(106, 78, 232, 0.20)' },
  neutral:    { bg: 'var(--color-surface-container)', fg: 'var(--color-on-surface-variant)', dot: 'var(--color-outline)', border: 'var(--color-outline-variant)' },
};

const STATUS_CONFIG: Record<StatusType, { kind: SemanticKind; label: string }> = {
  normal:      { kind: 'success',    label: '正常' },
  grace:       { kind: 'warning',    label: '宽限期' },
  expired:     { kind: 'error',      label: '已过期' },
  online:      { kind: 'success',    label: '在线' },
  offline:     { kind: 'neutral',    label: '离线' },
  running:     { kind: 'info',       label: '运行中' },
  draft:       { kind: 'neutral',    label: '草稿' },
  published:   { kind: 'success',    label: '已发布' },
  active:      { kind: 'success',    label: '启用' },
  disabled:    { kind: 'error',      label: '禁用' },
  empty:       { kind: 'neutral',    label: '空' },
  processing:  { kind: 'processing', label: '处理中' },
  ready:       { kind: 'success',    label: '就绪' },
  error:       { kind: 'error',      label: '错误' },
  uploading:   { kind: 'processing', label: '上传中' },
  pending:     { kind: 'neutral',    label: '待处理' },
  downloading: { kind: 'processing', label: '下载中' },
  failed:      { kind: 'error',      label: '失败' },
  completed:   { kind: 'success',    label: '完成' },
  skipped:     { kind: 'neutral',    label: '跳过' },
  idle:        { kind: 'info',       label: '空闲' },
  thinking:    { kind: 'processing', label: '思考中' },
  talking:     { kind: 'success',    label: '对话中' },
  off:         { kind: 'neutral',    label: '关闭' },
};

interface StatusTagProps {
  status: string;
  label?: string;
}

export default function StatusTag({ status, label }: StatusTagProps) {
  const config = STATUS_CONFIG[status as StatusType] || { kind: 'neutral' as const, label: status };
  const s = SEMANTIC_STYLES[config.kind];
  return (
    <Tag
      style={{
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        borderRadius: 9999,
        padding: '1px 10px 1px 8px',
        fontSize: 12,
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        margin: 0,
        lineHeight: '18px',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: s.dot,
          flexShrink: 0,
        }}
      />
      {label || config.label}
    </Tag>
  );
}
