import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '../types';
import {
  AuthContext,
  loadSession,
  persistSession,
  type AuthContextValue,
  type Session,
} from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const signIn = useCallback((next: Session) => {
    persistSession(next);
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    persistSession(null);
    setSession(null);
  }, []);

  const setRole = useCallback((role: Role) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, role };
      persistSession(next);
      return next;
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      signIn,
      signOut,
      setRole,
    }),
    [session, signIn, signOut, setRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
