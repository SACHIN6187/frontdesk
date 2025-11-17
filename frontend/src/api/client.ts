import type {
  AuthResponse,
  AuthContextResponse,
  Billing,
  Comment,
  CreateTicketPayload,
  InviteMemberPayload,
  LoginPayload,
  Member,
  Role,
  SignupPayload,
  Subscription,
  Ticket,
  UpdateTicketPayload,
} from '../types';

export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

/**
 * Error thrown for any non-2xx API response. Carries the HTTP status so
 * callers can branch on things like 402 (seat limit) or 403 (forbidden).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const data = (await res.json()) as { detail?: string } | Json;
      if (data && typeof data === 'object' && 'detail' in data) {
        const d = (data as { detail?: unknown }).detail;
        detail = typeof d === 'string' ? d : JSON.stringify(d);
      }
    } catch {
      detail = res.statusText;
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/** Typed API surface. Every method returns a typed promise. */
export const api = {
  // ---- Auth ----
  signup(payload: SignupPayload): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: payload,
    });
  },
  login(payload: LoginPayload): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/login-json', {
      method: 'POST',
      body: payload,
    });
  },
  context(token: string): Promise<AuthContextResponse> {
    return request<AuthContextResponse>('/api/auth/context', { token });
  },

  // ---- Tickets ----
  listTickets(token: string): Promise<Ticket[]> {
    return request<Ticket[]>('/api/tickets', { token });
  },
  createTicket(token: string, payload: CreateTicketPayload): Promise<Ticket> {
    return request<Ticket>('/api/tickets', {
      method: 'POST',
      body: payload,
      token,
    });
  },
  getTicket(token: string, id: string): Promise<Ticket> {
    return request<Ticket>(`/api/tickets/${id}`, { token });
  },
  updateTicket(
    token: string,
    id: string,
    payload: UpdateTicketPayload,
  ): Promise<Ticket> {
    return request<Ticket>(`/api/tickets/${id}`, {
      method: 'PATCH',
      body: payload,
      token,
    });
  },
  deleteTicket(token: string, id: string): Promise<void> {
    return request<void>(`/api/tickets/${id}`, { method: 'DELETE', token });
  },
  listComments(token: string, ticketId: string): Promise<Comment[]> {
    return request<Comment[]>(`/api/tickets/${ticketId}/comments`, { token });
  },
  addComment(token: string, ticketId: string, body: string): Promise<Comment> {
    return request<Comment>(`/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: { body },
      token,
    });
  },

  // ---- Members ----
  listMembers(token: string): Promise<Member[]> {
    return request<Member[]>('/api/members', { token });
  },
  inviteMember(token: string, payload: InviteMemberPayload): Promise<Member> {
    return request<Member>('/api/members', {
      method: 'POST',
      body: payload,
      token,
    });
  },
  updateMemberRole(
    token: string,
    userId: string,
    role: Role,
  ): Promise<Member> {
    return request<Member>(`/api/members/${userId}`, {
      method: 'PATCH',
      body: { role },
      token,
    });
  },
  removeMember(token: string, userId: string): Promise<void> {
    return request<void>(`/api/members/${userId}`, {
      method: 'DELETE',
      token,
    });
  },

  // ---- Billing ----
  getBilling(token: string): Promise<Billing> {
    return request<Billing>('/api/billing', { token });
  },
  upgradeBilling(token: string): Promise<Subscription> {
    return request<Subscription>('/api/billing/upgrade', {
      method: 'POST',
      token,
    });
  },
  cancelBilling(token: string): Promise<Subscription> {
    return request<Subscription>('/api/billing/cancel', {
      method: 'POST',
      token,
    });
  },
};

/**
 * Build the WebSocket URL for live events, deriving ws/wss from the API base
 * and appending the auth token as a query param.
 */
export function buildWsUrl(token: string): string {
  const base = new URL(API_BASE);
  const wsProtocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${base.host}/ws?token=${encodeURIComponent(token)}`;
}
