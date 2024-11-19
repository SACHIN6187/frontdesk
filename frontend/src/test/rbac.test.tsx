import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider } from '../auth/AuthProvider';
import { STORAGE_KEY } from '../auth/authContext';
import { TicketsPage } from '../pages/TicketsPage';
import { MembersPage } from '../pages/MembersPage';
import { api } from '../api/client';
import type { Role } from '../types';

class NoopWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  close() {}
}

function seedRole(role: Role) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: 'tok',
      role,
      orgId: 'org-1',
      name: 'User',
      email: 'u@a.com',
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', NoopWebSocket as unknown as typeof WebSocket);
  vi.spyOn(api, 'listTickets').mockResolvedValue([]);
  vi.spyOn(api, 'listMembers').mockResolvedValue([
    { user_id: 'U1', email: 'u@a.com', name: 'User', role: 'agent' },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RBAC UI gating', () => {
  it('hides the New ticket control for a viewer', async () => {
    seedRole('viewer');
    render(<TicketsPage />, { wrapper });
    await screen.findByRole('region', { name: 'Open' });
    expect(
      screen.queryByRole('button', { name: /new ticket/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the New ticket control for an agent', async () => {
    seedRole('agent');
    render(<TicketsPage />, { wrapper });
    await screen.findByRole('region', { name: 'Open' });
    expect(
      screen.getByRole('button', { name: /new ticket/i }),
    ).toBeInTheDocument();
  });

  it('hides the invite form and role selects for a viewer on members', async () => {
    seedRole('viewer');
    render(<MembersPage />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText('u@a.com')).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /send invite/i }),
    ).not.toBeInTheDocument();
    // role shown as a static badge, not an editable select
    expect(screen.queryByLabelText(/role for/i)).not.toBeInTheDocument();
  });

  it('shows the invite form for an owner on members', async () => {
    seedRole('owner');
    render(<MembersPage />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText('u@a.com')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: /send invite/i }),
    ).toBeInTheDocument();
  });
});
