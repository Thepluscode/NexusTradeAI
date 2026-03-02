import { Navigate } from 'react-router-dom';
import { getStoredTokens, isTokenValid } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { accessToken, refreshToken } = getStoredTokens();

  // Allow through if access token is valid
  if (accessToken && isTokenValid(accessToken)) {
    return <>{children}</>;
  }

  // Also allow through if refresh token exists — the axios interceptor will
  // silently renew the access token on the next API call. Kicking the user
  // to /login here would log them out even though they have a valid session.
  if (refreshToken) {
    return <>{children}</>;
  }

  return <Navigate to="/login" replace />;
}
