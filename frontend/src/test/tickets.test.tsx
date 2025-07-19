import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider } from '../auth/AuthProvider';
import { STORAGE_KEY } from '../auth/authContext';
import { TicketsPage } from '../pages/TicketsPage';
import { api } from '../api/client';
import type { Ticket } from '../types';

/** Minimal controllable WebSocket stand-in. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  emitOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function makeTicket(over: Partial<Ticket>): Ticket {
  return {
    id: 'T1',
    subject: 'Subject',
    body: 'Body',
    requester_email: 'a@b.com',
    status: 'open',
    assignee_id: null,
    created_by: 'U1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: 'tok',
      role: 'owner',
      orgId: 'org-1',
      name: 'Owner',
      email: 'o@a.com',
    }),
  );
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TicketsPage board', () => {
  it('renders the three status columns', async () => {
    vi.spyOn(api, 'listTickets').mockResolvedValue([]);
    render(<TicketsPage />, { wrapper });

    expect(await screen.findByRole('region', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pending' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Closed' })).toBeInTheDocument();
  });

  it('shows a live indicator that flips to connected on ws open', async () => {
    vi.spyOn(api, 'listTickets').mockResolvedValue([]);
    render(<TicketsPage />, { wrapper });

    const pill = await screen.findByTestId('live-indicator');
    expect(pill).toHaveTextContent(/connecting/i);

    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toContain('/ws?token=tok');
    ws.emitOpen();

    await waitFor(() => expect(pill).toHaveTextContent(/live/i));
  });

  it('refetches and shows a new ticket when a ticket.created event arrives', async () => {
    const listSpy = vi
      .spyOn(api, 'listTickets')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeTicket({ id: 'T9', subject: 'Printer on fire', status: 'open' }),
      ]);

    render(<TicketsPage />, { wrapper });

    // initial empty state
    const openCol = await screen.findByRole('region', { name: 'Open' });
    expect(within(openCol).queryByText('Printer on fire')).not.toBeInTheDocument();

    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    ws.emit({ type: 'ticket.created', id: 'T9', subject: 'Printer on fire', status: 'open' });

    await waitFor(() =>
      expect(within(openCol).getByText('Printer on fire')).toBeInTheDocument(),
    );
    expect(listSpy).toHaveBeenCalledTimes(2);
  });
});
