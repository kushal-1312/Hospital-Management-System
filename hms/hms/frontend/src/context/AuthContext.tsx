import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { authAPI, setAccessToken, type AuthResponse, type PreAuthResponse } from '../services/api';
import type { Role, User } from '../types/domain';

type LoginResult = User | PreAuthResponse;

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeSession: (session: AuthResponse) => void;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        await authAPI.refresh();
        const response = await authAPI.getMe();
        if (active) setUser(response.data.user);
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setLoading(false);
      }
    };
    restoreSession();
    return () => { active = false; };
  }, [clearSession]);

  useEffect(() => {
    const onExpired = () => clearSession();
    window.addEventListener('session:expired', onExpired);
    return () => window.removeEventListener('session:expired', onExpired);
  }, [clearSession]);

  const completeSession = useCallback((session: AuthResponse) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { data } = await authAPI.login({ email, password });
    if (data.requiresTwoFactor) return data;
    completeSession(data);
    return data.user;
  }, [completeSession]);

  const logout = useCallback(async () => {
    try { await authAPI.logout(); } catch { /* session is cleared locally regardless */ }
    clearSession();
  }, [clearSession]);

  const hasRole = useCallback((...roles: Role[]) => Boolean(user && roles.includes(user.role)), [user]);
  const value = useMemo(
    () => ({ user, loading, login, completeSession, logout, hasRole, setUser }),
    [user, loading, login, completeSession, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
