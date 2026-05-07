/**
 * <DelayInput> — 每步统一相对延时输入
 *
 * SSOT：admin-UI §4.20.1 行 849；mockup M1 §step-3 / §step-4 .delay-editor
 *
 * 行为：
 *   - antd <InputNumber min={0}> + 前缀「在前一步开始后」+ 后缀「秒执行」
 *   - Step 0（即 stepIndex===0）强制 0 不可改 → 渲染只读 "立即" chip
 *   - value=0 时旁边小字「填 0 = 与前一步同时」（mockup line 778 文案）
 *   - 整数（HTML 5 step="1"）；小数被拒绝
 */

import { InputNumber, Tag, Tooltip } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';

interface Props {
  /** 当前步在数组中的下标（0-based）；==0 时锁死 0 + 渲染 "立即" chip */
  stepIndex: number;
  value: number;
  onChange: (next: number) => void;
  /** 422 detail 命中本字段时给 InputNumber 加 error 描边 */
  error?: string | null;
  disabled?: boolean;
}

export default function DelayInput({ stepIndex, value, onChange, error, disabled }: Props) {
  if (stepIndex === 0) {
    return (
      <Tooltip title="第 1 步永远立即执行，不能延后">
        <Tag
          color="success"
          style={{
            margin: 0,
            padding: '2px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
          }}
          data-testid="delay-input-immediate-chip"
        >
          立即
        </Tag>
      </Tooltip>
    );
  }

  return (
    <div
      data-testid="delay-input-editor"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '8px 12px',
        border: `1px solid ${
          error ? 'var(--ant-color-error)' : 'var(--ant-color-border-secondary)'
        }`,
        borderRadius: 8,
        background: 'var(--ant-color-bg-container)',
      }}
    >
      <ClockCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 14 }} />
      <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
        在前一步开始后
      </span>
      <span data-testid="delay-input-number" style={{ display: 'inline-flex' }}>
        <InputNumber
          size="small"
          min={0}
          step={1}
          precision={0}
          value={value}
          onChange={(v) => {
            if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
              onChange(Math.floor(v));
            } else if (v == null) {
              onChange(0);
            }
          }}
          disabled={disabled}
          status={error ? 'error' : undefined}
          style={{ width: 72 }}
        />
      </span>
      <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>秒执行</span>
      {value === 0 && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: 'var(--ant-color-text-tertiary)',
          }}
        >
          填 0 = 与前一步同时
        </span>
      )}
      {error && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: 'var(--ant-color-error)',
          }}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}
