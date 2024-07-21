import { createContext, useContext } from 'react';
import type { Role } from '../types';

export interface Session {
  token: string;
  role: Role;
  orgId: string;
  name: string;
  email: string;
}

export interface AuthContextValue {
  session: Session | null;
  isAuthenticated: boolean;
  signIn: (session: Session) => void;
  signOut: () => void;
  setRole: (role: Role) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export const STORAGE_KEY = 'frontdesk.session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (
      typeof parsed.token === 'string' &&
      typeof parsed.role === 'string' &&
      typeof parsed.orgId === 'string'
    ) {
      return {
        token: parsed.token,
        role: parsed.role as Role,
        orgId: parsed.orgId,
        name: parsed.name ?? '',
        email: parsed.email ?? '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function persistSession(session: Session | null): void {
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}
