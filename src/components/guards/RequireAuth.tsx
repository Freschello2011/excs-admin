import { useAuthStore } from '@/stores/authStore';
import { redirectToSSO } from '@/api/request';
import { useEffect } from 'react';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn()) {
      redirectToSSO();
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
