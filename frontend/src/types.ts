// Shared domain types mirroring the backend API contract exactly.

export type Role = 'owner' | 'agent' | 'viewer';

export type TicketStatus = 'open' | 'pending' | 'closed';

export interface AuthResponse {
  access_token: string;
  org_id: string;
  role: Role;
}

export interface AuthContextResponse {
  org_id: string;
  role: Role;
}

export interface SignupPayload {
  org_name: string;
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface Ticket {
  id: string;
  subject: string;
  body: string;
  requester_email: string;
  status: TicketStatus;
  assignee_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTicketPayload {
  subject: string;
  body: string;
  requester_email: string;
}

export interface UpdateTicketPayload {
  subject?: string;
  body?: string;
  status?: TicketStatus;
  assignee_id?: string | null;
}

export interface Comment {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Member {
  user_id: string;
  email: string;
  name: string;
  role: Role;
}

export interface InviteMemberPayload {
  email: string;
  name: string;
  password: string;
  role: Role;
}

export type BillingPlan = 'free' | 'pro';

export interface Billing {
  plan: BillingPlan;
  status: string;
  seats: number;
  seat_limit: number;
  stripe_subscription_id: string | null;
}

export interface Subscription {
  plan: BillingPlan;
  status: string;
  seats: number;
  seat_limit: number;
  stripe_subscription_id: string | null;
}

// WebSocket live events.
export interface WsConnected {
  type: 'connected';
  org_id: string;
}

export interface WsTicketCreated {
  type: 'ticket.created';
  id: string;
  subject: string;
  status: TicketStatus;
}

export interface WsTicketUpdated {
  type: 'ticket.updated';
  id: string;
  status: TicketStatus;
}

export interface WsTicketDeleted {
  type: 'ticket.deleted';
  id: string;
}

export interface WsCommentCreated {
  type: 'comment.created';
  ticket_id: string;
  id: string;
}

export type WsEvent =
  | WsConnected
  | WsTicketCreated
  | WsTicketUpdated
  | WsTicketDeleted
  | WsCommentCreated;
