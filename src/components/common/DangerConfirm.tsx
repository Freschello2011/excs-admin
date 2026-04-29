/**
 * device-mgmt-v2 P9-D：危险操作冷却确认。
 *
 * 默认行为同 antd Popconfirm（点 Yes 立即触发 onConfirm）。
 * 当现场模式开启时：
 *   - 改用 Modal.confirm 弹窗
 *   - OK 按钮初始 disabled，5 秒倒计时启用
 *   - 标题与按钮文字按 props 透传
 */
import { useRef, type ReactNode } from 'react';
import { Popconfirm } from 'antd';
import type { PopconfirmProps } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { useFieldMode } from '@/stores/fieldModeStore';

interface DangerConfirmProps {
  title: ReactNode;
  description?: ReactNode;
  okText?: string;
  cancelText?: string;
  onConfirm: () => void;
  /** 现场态冷却秒数，默认 5 */
  cooldownSeconds?: number;
  /** 触发器：包一层就好，不强制按钮风格 */
  children: ReactNode;
  /** 透传给 Popconfirm（非现场态走原 popover） */
  popconfirmProps?: Omit<PopconfirmProps, 'title' | 'description' | 'onConfirm' | 'okText' | 'cancelText'>;
}

export default function DangerConfirm({
  title,
  description,
  okText = '确定',
  cancelText = '取消',
  onConfirm,
  cooldownSeconds = 5,
  children,
  popconfirmProps,
}: DangerConfirmProps) {
  const { modal } = useMessage();
  const fieldMode = useFieldMode((s) => s.enabled);
  const openRef = useRef(false);

  if (!fieldMode) {
    return (
      <Popconfirm
        {...popconfirmProps}
        title={title}
        description={description}
        okText={okText}
        cancelText={cancelText}
        okButtonProps={{ danger: true, ...(popconfirmProps?.okButtonProps ?? {}) }}
        onConfirm={onConfirm}
      >
        {children}
      </Popconfirm>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (openRef.current) return;
    openRef.current = true;

    let remaining = cooldownSeconds;

    const ref = modal.confirm({
      title,
      content: (
        <div>
          {description && <div style={{ marginBottom: 8 }}>{description}</div>}
          <div style={{ color: 'var(--color-warning, #D68A2A)', fontWeight: 500 }}>
            现场模式：危险操作 {remaining}s 冷却中…
          </div>
        </div>
      ),
      okText: `${okText}（${remaining}s）`,
      cancelText,
      okButtonProps: { danger: true, disabled: true, loading: true },
      onOk: () => {
        onConfirm();
      },
      afterClose: () => {
        openRef.current = false;
      },
    });

    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        ref.update({
          okText: `${okText}（${remaining}s）`,
          okButtonProps: { danger: true, disabled: true, loading: true },
          content: (
            <div>
              {description && <div style={{ marginBottom: 8 }}>{description}</div>}
              <div style={{ color: 'var(--color-warning, #D68A2A)', fontWeight: 500 }}>
                现场模式：危险操作 {remaining}s 冷却中…
              </div>
            </div>
          ),
        });
      } else {
        clearInterval(timer);
        ref.update({
          okText,
          okButtonProps: { danger: true, disabled: false, loading: false },
          content: (
            <div>
              {description && <div style={{ marginBottom: 8 }}>{description}</div>}
              <div style={{ color: 'var(--color-success, #2F9E5A)' }}>
                冷却完成，可以确认操作。
              </div>
            </div>
          ),
        });
      }
    }, 1000);
  };

  return (
    <span onClickCapture={handleClick} style={{ display: 'inline-flex' }}>
      {children}
    </span>
  );
}
