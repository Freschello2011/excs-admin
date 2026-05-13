import { Link } from 'react-router-dom';
import { Result, Button } from 'antd';
import { useAuthStore } from '@/stores/authStore';
import type {
  UserActionSet,
  ResourceRefHint as ResourceRef,
} from '@/api/gen/client';

/**
 * 路由级 action guard。
 *
 * ADR-0021 §B 红线（2026-05-12 增补）：admin 前端任何资源 Tab/列表/卡片不许用
 * `isAdmin()` 当门禁，必须 `useCan(action, scope)`。本组件把这条红线落到路由层，
 * 替换 `<RequireAdmin>`（仅 super_admin 通过的字面量门禁）。
 *
 * 语义与 sidebar 的 `requireActions` 对齐：传入 actions 数组按 OR 解释，任一命中即放行；
 * 超管通配符 `*` 自然命中。判不准走 false（fail-safe），由后端 403 兜底。
 *
 * 拒绝时不再静默 Navigate，渲染友好提示页（action code + 人话 label），与
 * PairingCodeTab.tsx guard 文案对齐。
 */
interface Props {
  /** 单个或多个 action code；多个时按 OR 解释（任一命中即放行）。 */
  actions: string | string[];
  /** 可选 scope；未传时按 presence check（与后端 nil-resource 行为一致）。 */
  resource?: ResourceRef;
  /** 友好提示页显示的功能名（人话），如「设备目录」「运营分析」。 */
  label: string;
  children: React.ReactNode;
}

function checkActionSetOr(
  set: UserActionSet | null,
  actions: string[],
  resource?: ResourceRef,
): boolean {
  const entries = set?.entries ?? [];
  if (!entries.length) return false;
  for (const e of entries) {
    if (e.action_code !== '*' && !actions.includes(e.action_code)) continue;
    const { scope } = e;
    if (scope.type === 'G') return true;
    if (!resource) return true; // presence check
    const scopeId = String(scope.id);
    if (scope.type === 'H') {
      if (resource.type === 'hall' && String(resource.id) === scopeId) return true;
      if (resource.hall_id != null && String(resource.hall_id) === scopeId) return true;
      continue;
    }
    if (scope.type === 'E') {
      if (resource.type === 'exhibit' && String(resource.id) === scopeId) return true;
      if (resource.exhibit_id != null && String(resource.exhibit_id) === scopeId) return true;
      continue;
    }
    if (scope.type === 'T' && resource.tenant_id != null && String(resource.tenant_id) === scopeId) return true;
    if (scope.type === 'O' && resource.vendor_id != null && String(resource.vendor_id) === scopeId) return true;
  }
  return false;
}

export default function RequireAction({ actions, resource, label, children }: Props) {
  const set = useAuthStore((s) => s.actionSet);
  const list = Array.isArray(actions) ? actions : [actions];
  const ok = checkActionSetOr(set, list, resource);

  if (!ok) {
    return (
      <Result
        status="403"
        title={`您没有「${label}」的访问权限`}
        subTitle={
          <div>
            <div>请联系管理员授权后再访问。</div>
            <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
              需要以下任一权限：{list.map((a) => <code key={a} style={{ marginRight: 8 }}>{a}</code>)}
            </div>
          </div>
        }
        extra={
          <Link to="/dashboard">
            <Button type="primary">返回仪表盘</Button>
          </Link>
        }
      />
    );
  }

  return <>{children}</>;
}
