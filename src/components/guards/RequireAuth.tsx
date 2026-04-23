import { useAuthStore } from '@/stores/authStore';
import { redirectToSSO } from '@/api/request';
import { useEffect } from 'react';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const actionSet = useAuthStore((s) => s.actionSet);
  const refreshActionSet = useAuthStore((s) => s.refreshActionSet);

  useEffect(() => {
    if (!isLoggedIn()) {
      redirectToSSO();
      return;
    }
    // Phase 5b 上线平滑补丁：老登录用户（localStorage 无 action-set）切到新前端后
    // 需自动拉一次 action-set，否则菜单全空 + 按钮全禁
    if (!actionSet) {
      refreshActionSet().catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoggedIn()) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return <>{children}</>;
}
