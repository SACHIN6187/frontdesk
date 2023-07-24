import type { TicketStatus } from '../types';
import { STATUS_LABEL } from './status';

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`badge badge-status badge-status--${status}`}>
      <span className="badge-dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
