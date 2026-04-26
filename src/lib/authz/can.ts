/**
 * 前端 can() helper — Phase 5b 起前端鉴权唯一入口。
 *
 * 语义（与后端 PermissionDecisionService.Can 对齐；DDD §5.1 / §13.3）：
 *   遍历当前用户 UserActionSet.entries，命中 action_code（或通配符 '*'）+ scope 匹配即返回 true。
 *   scope 匹配采用**粗粒度 fail-safe**：
 *     - G（Global）→ 恒 true
 *     - H（Hall） → resource.hall_id 或 resource.type==='hall' && resource.id 与 entry.scope.id 等值
 *     - E（Exhibit）→ resource.exhibit_id 或 resource.type==='exhibit' && resource.id 等值
 *     - T（Tenant）→ resource.tenant_id 等值
 *     - O（Ownership）→ resource.vendor_id 等值
 *     - 不传 resource / 判不准 → 采用 presence check（与后端 decideWithSet 的 nil-resource 一致）
 *   任何无法判定的场景一律返回 false，由后端 403 + hint 兜底。
 */
import { useAuthStore } from '@/stores/authStore';
import { authzApi } from '@/api/authz';
import type {
  UserActionSet,
  UserActionEntry,
  ResourceRefHint as ResourceRef,
  ExplainResult,
} from '@/api/gen/client';

/* ==================== 核心匹配 ==================== */

function scopeMatches(entry: UserActionEntry, resource?: ResourceRef): boolean {
  const { scope } = entry;

  // G：全局
  if (scope.type === 'G') return true;

  // 未传 resource → presence check（等同后端 decideWithSet 的 nil-resource 行为）
  if (!resource) return true;

  const scopeId = String(scope.id);

  switch (scope.type) {
    case 'H': {
      if (resource.type === 'hall') return String(resource.id) === scopeId;
      if (resource.hall_id != null) return String(resource.hall_id) === scopeId;
      // 判不准 → fail-safe false（让后端精确判）
      return false;
    }
    case 'E': {
      if (resource.type === 'exhibit') return String(resource.id) === scopeId;
      if (resource.exhibit_id != null) return String(resource.exhibit_id) === scopeId;
      return false;
    }
    case 'T': {
      if (resource.tenant_id != null) return String(resource.tenant_id) === scopeId;
      return false;
    }
    case 'O': {
      if (resource.vendor_id != null) return String(resource.vendor_id) === scopeId;
      return false;
    }
    default:
      return false;
  }
}

function checkActionSet(
  set: UserActionSet | null,
  action: string,
  resource?: ResourceRef,
): boolean {
  // 防御 entries=null（后端已兜底为 []，仍留护栏防脏数据 / 未来 schema 漂移）
  const entries = set?.entries ?? [];
  if (!entries.length) return false;
  for (const e of entries) {
    if (e.action_code !== action && e.action_code !== '*') continue;
    if (scopeMatches(e, resource)) return true;
  }
  return false;
}

/* ==================== 公共 API ==================== */

/** 同步判定：是否可以对 resource 执行 action。
 *  判不准一律返 false，由后端 403 兜底。 */
export function can(action: string, resource?: ResourceRef): boolean {
  const set = useAuthStore.getState().actionSet;
  return checkActionSet(set, action, resource);
}

/** React hook 版，订阅 actionSet 变更自动重渲染 */
export function useCan(action: string, resource?: ResourceRef): boolean {
  const set = useAuthStore((s) => s.actionSet);
  return checkActionSet(set, action, resource);
}

/** 判定当前用户是否持有某 action 的任一授权（presence check，忽略 scope） */
export function hasAnyAction(actions: string[]): boolean {
  const set = useAuthStore.getState().actionSet;
  const entries = set?.entries ?? [];
  for (const e of entries) {
    if (e.action_code === '*') return true;
    if (actions.includes(e.action_code)) return true;
  }
  return false;
}

/* ==================== explain() + 60s LRU 缓存 ==================== */

interface ExplainCacheEntry {
  value: ExplainResult;
  expiresAt: number;
}

const EXPLAIN_CACHE_MAX = 64;
const EXPLAIN_CACHE_TTL = 60_000;
const explainCache = new Map<string, ExplainCacheEntry>();

function explainCacheKey(userId: number, action: string, resource?: ResourceRef): string {
  return `${userId}|${action}|${resource?.type ?? ''}:${resource?.id ?? ''}`;
}

/** 向后端查询 "为什么能 / 不能" 的详细原因（用于按钮 tooltip / 403 弹窗） */
export async function explain(
  action: string,
  resource?: ResourceRef,
): Promise<ExplainResult | null> {
  const user = useAuthStore.getState().user;
  if (!user) return null;
  const key = explainCacheKey(user.id, action, resource);
  const now = Date.now();

  const cached = explainCache.get(key);
  if (cached && cached.expiresAt > now) {
    // LRU：命中后移到末尾
    explainCache.delete(key);
    explainCache.set(key, cached);
    return cached.value;
  }

  try {
    const axiosRes = await authzApi.explainPermission(user.id, action, resource);
    const res = axiosRes.data;
    if (res.code !== 0) return null;

    // 容量控制
    if (explainCache.size >= EXPLAIN_CACHE_MAX) {
      const firstKey = explainCache.keys().next().value;
      if (firstKey !== undefined) explainCache.delete(firstKey);
    }
    explainCache.set(key, { value: res.data, expiresAt: now + EXPLAIN_CACHE_TTL });
    return res.data;
  } catch {
    return null;
  }
}

/** 测试 / 切换用户后手动清缓存 */
export function clearExplainCache(): void {
  explainCache.clear();
}
