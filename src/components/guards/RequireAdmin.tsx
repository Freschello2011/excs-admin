import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const isAdmin = useAuthStore((s) => s.isAdmin);

  if (!isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
