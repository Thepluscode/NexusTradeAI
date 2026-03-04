import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import type { User } from '@/types';
import { SERVICE_URLS } from '@/services/api';

interface JwtPayload {
  sub: number;
  email: string;
  exp: number;
}

function getStoredTokens() {
  return {
    accessToken: localStorage.getItem('nexus_access_token'),
    refreshToken: localStorage.getItem('nexus_refresh_token'),
  };
}

function isTokenValid(token: string): boolean {
  try {
    const { exp } = jwtDecode<JwtPayload>(token);
    return Date.now() < exp * 1000;
  } catch {
    return false;
  }
}

function decodeUser(token: string): User | null {
  try {
    const { sub, email } = jwtDecode<JwtPayload>(token);
    return { id: sub, email, role: 'user' };
  } catch {
    return null;
  }
}

export function useAuth() {
  const navigate = useNavigate();
  const { accessToken } = getStoredTokens();

  const isAuthenticated = !!accessToken && isTokenValid(accessToken);
  const user = isAuthenticated && accessToken ? decodeUser(accessToken) : null;

  function logout() {
    const { refreshToken } = getStoredTokens();
    // Best-effort server-side logout (clear refresh token in DB)
    if (refreshToken) {
      fetch(`${import.meta.env.VITE_STOCK_BOT_URL || 'https://nexus-stock-bot-production.up.railway.app'}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    // Best-effort stop of per-user engines on logout
    const { accessToken: tok } = getStoredTokens();
    if (tok) {
      const engineHeaders = { Authorization: `Bearer ${tok}` };
      void Promise.allSettled([
        fetch(`${SERVICE_URLS.stockBot}/api/trading/engine/stop`, { method: 'POST', headers: engineHeaders }),
        fetch(`${SERVICE_URLS.forexBot}/api/forex/engine/stop`, { method: 'POST', headers: engineHeaders }),
        fetch(`${SERVICE_URLS.cryptoBot}/api/crypto/engine/stop`, { method: 'POST', headers: engineHeaders }),
      ]).catch(() => {});
    }
    localStorage.removeItem('nexus_access_token');
    localStorage.removeItem('nexus_refresh_token');
    navigate('/login');
  }

  return { user, isAuthenticated, logout };
}

export { isTokenValid, getStoredTokens };
