import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/authContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { TicketDrawer } from '../components/TicketDrawer';
import { STATUS_LABEL, STATUS_ORDER } from '../components/status';
import type { Ticket, TicketStatus, WsEvent } from '../types';

function TicketCard({
  ticket,
  onClick,
}: {
  ticket: Ticket;
  onClick: () => void;
}) {
  return (
    <button type="button" className="ticket-card" onClick={onClick}>
      <span className="ticket-card-subject">{ticket.subject}</span>
      <span className="ticket-card-body">{ticket.body}</span>
      <span className="ticket-card-foot">{ticket.requester_email}</span>
    </button>
  );
}

export function TicketsPage() {
  const { session } = useAuth();
  const token = session?.token ?? '';
  const role = session?.role ?? 'viewer';
  const canCreate = role === 'owner' || role === 'agent';

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);

  // create form
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api.listTickets(token);
      setTickets(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.detail : 'Failed to load tickets.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      switch (event.type) {
        case 'ticket.created':
        case 'ticket.updated':
        case 'ticket.deleted':
          void refetch();
          break;
        case 'comment.created':
          if (event.ticket_id === selectedId) {
            setCommentsRefreshKey((k) => k + 1);
          }
          break;
        case 'connected':
        default:
          break;
      }
    },
    [refetch, selectedId],
  );

  const wsStatus = useWebSocket(token || null, handleWsEvent);

  const columns = useMemo(() => {
    const grouped: Record<TicketStatus, Ticket[]> = {
      open: [],
      pending: [],
      closed: [],
    };
    for (const t of tickets) {
      grouped[t.status].push(t);
    }
    return grouped;
  }, [tickets]);

  const selectedTicket = tickets.find((t) => t.id === selectedId) ?? null;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    try {
      const created = await api.createTicket(token, {
        subject: subject.trim(),
        body: body.trim(),
        requester_email: requesterEmail.trim(),
      });
      setTickets((prev) => [created, ...prev]);
      setSubject('');
      setBody('');
      setRequesterEmail('');
      setShowForm(false);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.detail : 'Failed to create ticket.',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChanged = useCallback((updated: Ticket) => {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setSelectedId(null);
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Tickets</h1>
          <p className="page-subtitle">
            Everything your team is working on, in one live board.
          </p>
        </div>
        <div className="page-head-actions">
          <span
            className={`live-pill live-pill--${wsStatus}`}
            title={`Live updates: ${wsStatus}`}
            data-testid="live-indicator"
          >
            <span className="live-dot" aria-hidden="true" />
            {wsStatus === 'connected'
              ? 'Live'
              : wsStatus === 'connecting'
                ? 'Connecting…'
                : 'Offline'}
          </span>
          {canCreate && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? 'Cancel' : 'New ticket'}
            </button>
          )}
        </div>
      </div>

      {canCreate && showForm && (
        <form className="card create-form" onSubmit={handleCreate}>
          <div className="create-form-grid">
            <label className="field">
              <span className="field-label">Subject</span>
              <input
                className="input"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Login link is broken"
              />
            </label>
            <label className="field">
              <span className="field-label">Requester email</span>
              <input
                className="input"
                type="email"
                required
                value={requesterEmail}
                onChange={(e) => setRequesterEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              className="textarea"
              rows={3}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the issue…"
            />
          </label>
          {formError && (
            <div className="alert alert-error" role="alert">
              {formError}
            </div>
          )}
          <div className="create-form-actions">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create ticket'}
            </button>
          </div>
        </form>
      )}

      {loadError && (
        <div className="alert alert-error" role="alert">
          {loadError}
        </div>
      )}

      <div className="board">
        {STATUS_ORDER.map((status) => (
          <section
            key={status}
            className={`board-col board-col--${status}`}
            aria-label={STATUS_LABEL[status]}
          >
            <header className="board-col-head">
              <span className="board-col-title">
                <span className="badge-dot" aria-hidden="true" />
                {STATUS_LABEL[status]}
              </span>
              <span className="board-col-count">{columns[status].length}</span>
            </header>
            <div className="board-col-body">
              {loading ? (
                <p className="muted">Loading…</p>
              ) : columns[status].length === 0 ? (
                <p className="board-empty">No {STATUS_LABEL[status].toLowerCase()} tickets</p>
              ) : (
                columns[status].map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    onClick={() => setSelectedId(t.id)}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      {selectedTicket && (
        <TicketDrawer
          ticket={selectedTicket}
          commentsRefreshKey={commentsRefreshKey}
          onClose={() => setSelectedId(null)}
          onStatusChanged={handleStatusChanged}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
