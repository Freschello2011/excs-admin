import { Navigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  permission: string;
  children: React.ReactNode;
}

export default function RequireHallPermission({ permission, children }: Props) {
  const { hallId } = useParams<{ hallId: string }>();
  const hasHallPermission = useAuthStore((s) => s.hasHallPermission);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // Admin bypasses all permission checks
  if (isAdmin()) {
    return <>{children}</>;
  }

  // If no hallId in route, let the page handle it
  if (!hallId) {
    return <>{children}</>;
  }

  if (!hasHallPermission(Number(hallId), permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
