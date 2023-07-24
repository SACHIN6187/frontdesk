import type { TicketStatus } from '../types';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  closed: 'Closed',
};

export const STATUS_ORDER: TicketStatus[] = ['open', 'pending', 'closed'];
