/**
 * authzMetaStore —— Phase 6 新建。
 *
 * 只管 Action 注册表元数据（code / domain / risk / scope_types / covered_apis / require_*）。
 *
 * **不要**放 currentActionSet —— 那个在 authStore（Phase 5b），本 store 不覆盖。
 * **不要**在 App bootstrap 加载 —— 普通用户用不到；由 RoleTemplateEditPage / GrantWizardPage
 * 挂载时 loadActions() 按需拉取，TTL 10 分钟内复用。
 */
import { create } from 'zustand';
import { authzApi } from '@/api/authz';
import type { ActionDef } from '@/types/authz';

const TTL_MS = 10 * 60 * 1000;

interface AuthzMetaState {
  actions: ActionDef[] | null;
  loadedAt: number | null;
  loading: boolean;
}

interface AuthzMetaActions {
  /** 按需拉取；TTL 内直接返回 actions。force=true 绕过缓存。 */
  loadActions: (force?: boolean) => Promise<ActionDef[]>;
  /** 手动清空（测试 / logout 时调用） */
  clear: () => void;
}

type AuthzMetaStore = AuthzMetaState & AuthzMetaActions;

export const useAuthzMetaStore = create<AuthzMetaStore>()((set, get) => ({
  actions: null,
  loadedAt: null,
  loading: false,

  loadActions: async (force = false) => {
    const { actions, loadedAt, loading } = get();
    const now = Date.now();
    if (!force && actions && loadedAt && now - loadedAt < TTL_MS) {
      return actions;
    }
    if (loading) {
      // 已在加载中 → 等待一下再返回（简单自旋，避免并发重复请求）
      await new Promise((resolve) => setTimeout(resolve, 100));
      const again = get();
      if (again.actions) return again.actions;
    }
    set({ loading: true });
    try {
      const res = await authzApi.listActions();
      const list = res.data.data?.list ?? [];
      set({ actions: list, loadedAt: Date.now(), loading: false });
      return list;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  clear: () => set({ actions: null, loadedAt: null, loading: false }),
}));
