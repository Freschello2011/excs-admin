/**
 * <SceneKpiStrip> — 场景编辑页 v2 顶部 4 块 KPI 卡
 *
 * SSOT：admin-UI §4.20.4 + mockup M1 line 525-545
 *   动作总数 / 总执行时长（估）/ 前置条件 / 上次发布
 *
 * 估时算法：sum(action.delay_seconds_after_prev_start)（首步=0）；不算 ack/precond timeout。
 */
import { Card } from 'antd';
import type { ActionStep } from '@/pages/_shared/runbook/types';

interface Props {
  steps: ActionStep[];
  updatedAt?: string | null;
}

export default function SceneKpiStrip({ steps, updatedAt }: Props) {
  const total = steps.length;
  const deviceCount = steps.filter((s) => s.type === 'device').length;
  const contentCount = steps.filter((s) => s.type === 'content').length;

  const totalSeconds = steps.reduce(
    (acc, s) => acc + (s.delay_seconds_after_prev_start || 0),
    0,
  );

  const precondCount = steps.reduce(
    (acc, s) => acc + (s.preconditions?.length ?? 0),
    0,
  );

  const updatedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString('zh-CN')
    : '—';
  const updatedTime = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div
      data-testid="scene-kpi-strip"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 16,
      }}
    >
      <Card size="small" variant="outlined">
        <Kpi
          label="动作总数"
          value={`${total} 步`}
          meta={`设备 ${deviceCount} · 数字内容 ${contentCount}`}
        />
      </Card>
      <Card size="small" variant="outlined">
        <Kpi
          label="总执行时长（估）"
          value={`~${totalSeconds} 秒`}
          meta="按相对延时累加（不含 ack）"
        />
      </Card>
      <Card size="small" variant="outlined">
        <Kpi
          label="前置条件"
          value={`${precondCount} 处`}
          meta={precondCount === 0 ? '无前置条件' : '点击各步查看'}
        />
      </Card>
      <Card size="small" variant="outlined">
        <Kpi
          label="上次发布"
          value={updatedDate}
          meta={updatedTime || '尚未发布'}
        />
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--ant-color-text-secondary)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: 'var(--ant-color-text)',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--ant-color-text-tertiary)',
          marginTop: 4,
        }}
      >
        {meta}
      </div>
    </div>
  );
}
