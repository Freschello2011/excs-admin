/**
 * RiskyActionButton —— Phase 7.4 风险操作二次确认按钮。
 *
 * 根据 Action 注册表元数据（authzMetaStore）自动决定交互：
 *   - critical → 弹 Modal 强制输入 reason（≥5 字）
 *   - high     → 弹 Modal 简单确认（无 reason）
 *   - 其它     → 直接 onConfirm(undefined)
 *
 * 不自取元数据 —— 复用 `useAuthzMetaStore.loadActions()` 的 TTL 10 分钟缓存，
 * 避免重复请求 `/authz/actions`。
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
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal } from 'antd';
import type { ButtonProps } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { useAuthzMetaStore } from '@/stores/authzMetaStore';
import type { ActionDef, RiskLevel, ResourceRef } from '@/types/authz';

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
  children: React.ReactNode;
}

const DEFAULT_REASON_MIN_LENGTH = 5;

function riskFromRegistry(actions: ActionDef[] | null, code: string): RiskLevel {
  if (!actions) return 'info';
  const def = actions.find((a) => a.code === code);
  return def?.risk ?? 'info';
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
  const { message } = useMessage();
  const actions = useAuthzMetaStore((s) => s.actions);
  const loadActions = useAuthzMetaStore((s) => s.loadActions);

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
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

  const needsReason = actualRisk === 'critical';
  const needsConfirm = actualRisk === 'critical' || actualRisk === 'high';

  async function runOnConfirm(r?: string) {
    setSubmitting(true);
    try {
      await onConfirm(r);
      setOpen(false);
      setReason('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClick() {
    if (!needsConfirm) {
      runOnConfirm(undefined);
      return;
    }
    setOpen(true);
  }

  function handleOk() {
    if (needsReason) {
      if (reason.trim().length < reasonMinLength) {
        message.warning(`请输入至少 ${reasonMinLength} 字的操作原因（审计用）`);
        return;
      }
      runOnConfirm(reason.trim());
      return;
    }
    runOnConfirm(undefined);
  }

  const defaultTitle = actualRisk === 'critical' ? '高风险操作确认' : '请确认操作';
  const defaultContent =
    actualRisk === 'critical'
      ? '此操作风险较高且会写入审计日志。请说明操作原因：'
      : '确认执行此操作？';

  return (
    <>
      <Button
        {...btnProps}
        loading={loadingProp || submitting}
        onClick={handleClick}
      >
        {children}
      </Button>
      <Modal
        open={open}
        title={confirmTitle ?? defaultTitle}
        onOk={handleOk}
        onCancel={() => {
          setOpen(false);
          setReason('');
        }}
        okText="确认执行"
        okButtonProps={{
          danger: actualRisk === 'critical',
          loading: submitting,
        }}
        destroyOnHidden
      >
        <div style={{ marginBottom: needsReason ? 12 : 0 }}>
          {confirmContent ?? defaultContent}
        </div>
        {needsReason && (
          <Input.TextArea
            rows={3}
            placeholder={`操作原因（≥ ${reasonMinLength} 字，审计必填）`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            showCount
          />
        )}
      </Modal>
    </>
  );
}
