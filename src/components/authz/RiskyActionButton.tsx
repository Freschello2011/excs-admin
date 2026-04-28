/**
 * RiskyActionButton —— Phase 7.4 风险操作二次确认按钮。
 *
 * 根据 Action 注册表元数据（authzMetaStore）自动决定交互：
 *   - critical → 弹 Modal 强制输入 reason（≥5 字）
 *   - high     → 弹 Modal 简单确认（无 reason）
 *   - 其它     → 直接 onConfirm(undefined)
 *
 * 使用 antd 的 `modal.confirm()` 命令式 API（走 App.useApp hook）—— 避免在表格行内联
 * `<Modal>` 时的 leave 动画卡住问题（v6 CSS-in-JS 在行再挂载时会打断）。
 *
 * Action 元数据复用 `useAuthzMetaStore.loadActions()` 的 TTL 10 分钟缓存，不新建 store。
 *
 * 与 `<Can>` 的配合：本组件只负责「风险 gate」。前端是否有权仍由外层 `<Can>` / `can()` 控制。
 *
 * 用法：
 *   <RiskyActionButton
 *     action="user.grant"
 *     onConfirm={async (reason) => { await api.revoke(id, reason); }}
 *     danger
 *   >
 *     撤销授权
 *   </RiskyActionButton>
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from 'antd';
import type { ButtonProps } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { useAuthzMetaStore } from '@/stores/authzMetaStore';
import type { ActionDef, RiskLevel, ResourceRef } from '@/api/gen/client';

interface RiskyActionButtonProps
  extends Omit<
    ButtonProps,
    'onClick' | 'onMouseDown' | 'onMouseUp' | 'onKeyDown' | 'resource'
  > {
  /** 要执行的 action code（匹配 Action 注册表条目） */
  action: string;
  /** 资源引用（当前仅审计透传，不做 gate） */
  resource?: ResourceRef;
  /** 触发前校验通过后调用；reason 在 critical 时非空、其它为 undefined */
  onConfirm: (reason?: string) => Promise<void> | void;
  /** 覆盖默认确认文案 */
  confirmTitle?: string;
  /** 覆盖默认确认说明 */
  confirmContent?: React.ReactNode;
  /** 覆盖 reason 输入的最小字数（默认 5） */
  reasonMinLength?: number;
  /** 若需要显示二次确认而 action 的风险低于 medium（例：需要显示 reason 但 action 自身是 medium） */
  forceRiskLevel?: RiskLevel;
  /** 可选；icon-only 按钮（仅 `icon` 无文字标签）时省略。 */
  children?: React.ReactNode;
}

const DEFAULT_REASON_MIN_LENGTH = 5;

function riskFromRegistry(actions: ActionDef[] | null, code: string): RiskLevel {
  if (!actions) return 'info';
  const def = actions.find((a) => a.code === code);
  // gen.ActionDef.risk 是 free-form string；service 层只填 5 种值（info/low/medium/high/critical），
  // 前端窄化为 RiskLevel（Phase 3-G 后端 service 层未做 oneof 校验，前端兜底）。
  return (def?.risk as RiskLevel) ?? 'info';
}

export default function RiskyActionButton({
  action,
  resource: _resource,
  onConfirm,
  confirmTitle,
  confirmContent,
  reasonMinLength = DEFAULT_REASON_MIN_LENGTH,
  forceRiskLevel,
  children,
  loading: loadingProp,
  ...btnProps
}: RiskyActionButtonProps) {
  const { message, modal } = useMessage();
  const actions = useAuthzMetaStore((s) => s.actions);
  const loadActions = useAuthzMetaStore((s) => s.loadActions);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // 懒加载：首次挂载本按钮时触发（若 TTL 内已加载则立即返回）
    loadActions().catch(() => {
      // swallow：即使元数据加载失败，按钮仍可用（按 info 风险处理）
    });
  }, [loadActions]);

  const actualRisk: RiskLevel = useMemo(() => {
    const registryRisk = riskFromRegistry(actions, action);
    if (!forceRiskLevel) return registryRisk;
    const order: RiskLevel[] = ['info', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(forceRiskLevel) > order.indexOf(registryRisk)
      ? forceRiskLevel
      : registryRisk;
  }, [actions, action, forceRiskLevel]);

  /** 保持最新的 props / state 引用给 modal.confirm 回调使用（confirm 是命令式，回调闭包快照） */
  const latestRef = useRef({
    onConfirm,
    reasonMinLength,
    actualRisk,
    setSubmitting,
    message,
    confirmContent,
  });
  latestRef.current = {
    onConfirm,
    reasonMinLength,
    actualRisk,
    setSubmitting,
    message,
    confirmContent,
  };

  function handleClick() {
    const risk = actualRisk;
    const needsReason = risk === 'critical';
    const needsConfirm = risk === 'critical' || risk === 'high';

    if (!needsConfirm) {
      void runOnConfirm(undefined);
      return;
    }

    const defaultTitle =
      risk === 'critical' ? '高风险操作确认' : '请确认操作';

    if (!needsReason) {
      modal.confirm({
        title: confirmTitle ?? defaultTitle,
        content: confirmContent ?? '确认执行此操作？',
        okText: '确认执行',
        cancelText: '取消',
        onOk: () => runOnConfirm(undefined),
      });
      return;
    }

    // critical：reason 输入框 —— 用受控 ref 拿值（modal.confirm 回调拿不到 React state）
    let reasonVal = '';
    modal.confirm({
      title: confirmTitle ?? defaultTitle,
      content: (
        <div>
          <div style={{ marginBottom: 12 }}>
            {confirmContent ?? '此操作风险较高且会写入审计日志。请说明操作原因：'}
          </div>
          <Input.TextArea
            rows={3}
            autoFocus
            placeholder={`操作原因（≥ ${reasonMinLength} 字，审计必填）`}
            onChange={(e) => {
              reasonVal = e.target.value;
            }}
            maxLength={500}
            showCount
          />
        </div>
      ),
      okText: '确认执行',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        if (reasonVal.trim().length < reasonMinLength) {
          message.warning(`请输入至少 ${reasonMinLength} 字的操作原因（审计用）`);
          // 返回 rejected Promise 阻止关闭
          return Promise.reject(new Error('reason too short'));
        }
        return runOnConfirm(reasonVal.trim());
      },
    });
  }

  async function runOnConfirm(r?: string) {
    setSubmitting(true);
    try {
      await onConfirm(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败';
      message.error(msg);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button
      {...btnProps}
      loading={loadingProp || submitting}
      onClick={handleClick}
    >
      {children}
    </Button>
  );
}
