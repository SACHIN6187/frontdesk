import { describe, expect, it } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { AuthProvider } from '../auth/AuthProvider';
import { STORAGE_KEY, useAuth } from '../auth/authContext';
import type { ReactNode } from 'react';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('auth context', () => {
  it('starts unauthenticated with no stored session', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it('signIn stores the token+role+org and persists to localStorage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.signIn({
        token: 'tok-xyz',
        role: 'owner',
        orgId: 'org-1',
        name: 'Jordan',
        email: 'j@acme.com',
      });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.session?.token).toBe('tok-xyz');
    expect(result.current.session?.role).toBe('owner');

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored.token).toBe('tok-xyz');
    expect(stored.orgId).toBe('org-1');
  });

  it('signOut clears the session and storage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => {
      result.current.signIn({
        token: 't',
        role: 'agent',
        orgId: 'o',
        name: 'A',
        email: 'a@b.com',
      });
    });
    act(() => result.current.signOut());
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rehydrates an existing session from localStorage on mount', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: 'persisted',
        role: 'viewer',
        orgId: 'org-9',
        name: 'V',
        email: 'v@b.com',
      }),
    );
    function Probe() {
      const { session } = useAuth();
      return <div>role:{session?.role}</div>;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('role:viewer')).toBeInTheDocument();
  });
});
