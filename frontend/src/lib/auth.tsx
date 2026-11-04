'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, authApi, refreshSession, setAccessToken } from './api';
import type { User } from './types';

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((session) => {
        if (!cancelled && session) {
          setUser(session.user);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    const onLogout = () => {
      setAccessToken(null);
      setUser(null);
    };
    window.addEventListener('booknest:logout', onLogout);
    return () => {
      cancelled = true;
      window.removeEventListener('booknest:logout', onLogout);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi().login({ email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await authApi().register({ name, email, password });
      setAccessToken(data.accessToken);
      setUser(data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi().logout();
    } finally {
      setAccessToken(null);
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  const value = useMemo(
    () => ({ user, ready, login, register, logout }),
    [user, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

export function useRequiredUser() {
  const { user, ready } = useAuth();
  return { user, ready };
}

export { api };
