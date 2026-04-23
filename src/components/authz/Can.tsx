/**
 * <Can> 组件 — Phase 5b 起前端按钮/元素鉴权入口。
 *
 * 用法：
 *   <Can action="show.control" resource={{type:'hall', id:String(hallId)}}>
 *     <Button>启动演出</Button>
 *   </Can>
 *
 *   <Can action="device.control" resource={{type:'device', id:String(deviceId), hall_id:hallId}} mode="disable">
 *     <Button>打开</Button>
 *   </Can>
 *
 * mode='hide'（默认）：不满足时渲染 fallback（默认 null）。
 * mode='disable'：包裹子元素为禁用态 + 悬浮 tooltip（文案来自 /authz/explain 的 hint）。
 */
import { useEffect, useState, type ReactElement } from 'react';
import { Tooltip } from 'antd';
import { useCan, explain } from '@/lib/authz/can';
import type { ResourceRef } from '@/types/authz';

interface CanProps {
  action: string;
  resource?: ResourceRef;
  /** 'hide' = 不满足时渲染 fallback；'disable' = 渲染禁用态 + tooltip */
  mode?: 'hide' | 'disable';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

const DEFAULT_DENY_HINT = '您没有此操作的权限';

export default function Can({
  action,
  resource,
  mode = 'hide',
  fallback = null,
  children,
}: CanProps) {
  const allowed = useCan(action, resource);
  const [hint, setHint] = useState<string>(DEFAULT_DENY_HINT);

  // disable 模式下异步拉取 explain，拿到人类可读的 hint
  useEffect(() => {
    if (allowed || mode !== 'disable') return;
    let cancelled = false;
    explain(action, resource).then((res) => {
      if (cancelled) return;
      if (res?.hint) setHint(res.hint);
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, action, resource, mode]);

  if (allowed) return <>{children}</>;

  if (mode === 'hide') return <>{fallback}</>;

  // disable：单子元素时克隆并禁用；多子元素时退回 div 包裹
  return (
    <Tooltip title={hint} placement="top">
      <span
        style={{
          display: 'inline-block',
          opacity: 0.5,
          cursor: 'not-allowed',
          pointerEvents: 'none',
        }}
        aria-disabled="true"
      >
        {children as ReactElement}
      </span>
    </Tooltip>
  );
}
