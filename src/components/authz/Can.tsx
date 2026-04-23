/**
 * <Can> 组件 — Phase 5b 起前端按钮/元素鉴权入口；Phase 7 扩 `mode='explain'`。
 *
 * 用法：
 *   <Can action="show.control" resource={{type:'hall', id:String(hallId)}}>
 *     <Button>启动演出</Button>
 *   </Can>
 *
 *   <Can action="device.control" ... mode="disable">...</Can>
 *   <Can action="show.control" ... mode="explain">...</Can>
 *
 * mode='hide'（默认）：不满足时渲染 fallback（默认 null）。
 * mode='disable'：包裹子元素为禁用态 + 悬浮 tooltip（文案来自 /authz/explain 的 hint）。
 * mode='explain'：允许/拒绝都渲染 + 右侧 ⓘ 图标，popover 显示来源 / 原因 + 建议申请路径。
 */
import { useEffect, useState, type ReactElement } from 'react';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Popover, Tooltip, Typography } from 'antd';
import { useCan, explain } from '@/lib/authz/can';
import { useExplain } from '@/lib/authz/useExplain';
import type { ExplainResult, ResourceRef } from '@/types/authz';

const { Text } = Typography;

interface CanProps {
  action: string;
  resource?: ResourceRef;
  /** 'hide' = 不满足时渲染 fallback；'disable' = 渲染禁用态 + tooltip；'explain' = 始终渲染 + ⓘ 弹窗 */
  mode?: 'hide' | 'disable' | 'explain';
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

  if (mode === 'explain') {
    return (
      <ExplainWrapper action={action} resource={resource} allowed={allowed}>
        {children}
      </ExplainWrapper>
    );
  }

  if (mode === 'disable') {
    return (
      <DisableWrapper action={action} resource={resource} allowed={allowed}>
        {children}
      </DisableWrapper>
    );
  }

  // mode === 'hide'
  if (allowed) return <>{children}</>;
  return <>{fallback}</>;
}

/** disable 模式：拒绝时灰显 + tooltip 显示 explain 的 suggestion/apply_path */
function DisableWrapper({
  action,
  resource,
  allowed,
  children,
}: {
  action: string;
  resource?: ResourceRef;
  allowed: boolean;
  children: React.ReactNode;
}) {
  const [hint, setHint] = useState<string>(DEFAULT_DENY_HINT);

  useEffect(() => {
    if (allowed) return;
    let cancelled = false;
    explain(action, resource).then((res) => {
      if (cancelled || !res) return;
      const parts = [res.suggestion, res.apply_path].filter(Boolean);
      if (parts.length) setHint(parts.join(' · '));
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, action, resource]);

  if (allowed) return <>{children}</>;

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

/** explain 模式：始终渲染，允许时绑定 ⓘ popover 显示来源，拒绝时灰显 + ⓘ popover 显示原因 */
function ExplainWrapper({
  action,
  resource,
  allowed,
  children,
}: {
  action: string;
  resource?: ResourceRef;
  allowed: boolean;
  children: React.ReactNode;
}) {
  const { loading, result } = useExplain(action, resource);

  const popoverContent = renderExplainContent(loading, allowed, result);

  const icon = (
    <Popover content={popoverContent} title={allowed ? '已授权' : '无权操作'} trigger="click">
      <InfoCircleOutlined
        style={{
          marginInlineStart: 4,
          color: allowed ? 'var(--ant-color-text-tertiary)' : 'var(--ant-color-warning)',
          cursor: 'pointer',
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </Popover>
  );

  if (allowed) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {children}
        {icon}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span
        style={{ display: 'inline-block', opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' }}
        aria-disabled="true"
      >
        {children as ReactElement}
      </span>
      {icon}
    </span>
  );
}

function renderExplainContent(
  loading: boolean,
  allowed: boolean,
  result: ExplainResult | null,
): React.ReactNode {
  if (loading && !result) return <Text type="secondary">正在查询...</Text>;
  if (!result) {
    return <Text type="secondary">{allowed ? '已授权（详情加载失败）' : DEFAULT_DENY_HINT}</Text>;
  }
  if (allowed) {
    const grant = result.matched_grant;
    return (
      <div style={{ maxWidth: 320 }}>
        <div style={{ marginBottom: 6 }}>{result.decision.reason || '已通过授权'}</div>
        {grant && (
          <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
            授权：#{grant.id} · 模板 #{grant.role_template_id} · scope {grant.scope_type}
            {grant.scope_id ? `:${grant.scope_id}` : ''}
            {grant.expires_at ? ` · 到期 ${grant.expires_at.slice(0, 10)}` : ''}
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 320 }}>
      <div style={{ marginBottom: 6 }}>{result.decision.reason || DEFAULT_DENY_HINT}</div>
      {result.suggestion && (
        <div style={{ color: 'var(--ant-color-text-secondary)', marginBottom: 4 }}>
          {result.suggestion}
        </div>
      )}
      {result.apply_path && (
        <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
          {result.apply_path}
        </div>
      )}
    </div>
  );
}
