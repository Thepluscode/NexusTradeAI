import { Navigate } from 'react-router-dom';
import { getStoredTokens, isTokenValid } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { accessToken } = getStoredTokens();
  if (!accessToken || !isTokenValid(accessToken)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
