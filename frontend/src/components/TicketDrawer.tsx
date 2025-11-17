import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/authContext';
import type { Comment, Ticket, TicketStatus } from '../types';
import { StatusBadge } from './StatusBadge';
import { STATUS_LABEL, STATUS_ORDER } from './status';

interface TicketDrawerProps {
  ticket: Ticket;
  onClose: () => void;
  onStatusChanged: (ticket: Ticket) => void;
  onDeleted: (id: string) => void;
  /** bump this number to force a comment refetch (e.g. on a ws comment event) */
  commentsRefreshKey: number;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TicketDrawer({
  ticket,
  onClose,
  onStatusChanged,
  onDeleted,
  commentsRefreshKey,
}: TicketDrawerProps) {
  const { session } = useAuth();
  const token = session?.token ?? '';
  const role = session?.role ?? 'viewer';
  const canWrite = role === 'owner' || role === 'agent';
  const canDelete = role === 'owner';

  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const loadComments = useCallback(async () => {
    if (!token) return;
    setLoadingComments(true);
    try {
      const list = await api.listComments(token, ticket.id);
      setComments(list);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, [token, ticket.id]);

  useEffect(() => {
    void loadComments();
  }, [loadComments, commentsRefreshKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const created = await api.addComment(token, ticket.id, newComment.trim());
      setComments((prev) => [...prev, created]);
      setNewComment('');
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to add comment.');
    } finally {
      setPosting(false);
    }
  };

  const handleStatusChange = async (status: TicketStatus) => {
    if (status === ticket.status) return;
    setSavingStatus(true);
    setError(null);
    try {
      const updated = await api.updateTicket(token, ticket.id, { status });
      onStatusChanged(updated);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : 'Failed to update status.',
      );
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await api.deleteTicket(token, ticket.id);
      onDeleted(ticket.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to delete ticket.');
    }
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Ticket: ${ticket.subject}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <StatusBadge status={ticket.status} />
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="drawer-body">
          <h2 className="drawer-title">{ticket.subject}</h2>
          <p className="drawer-meta">
            From <strong>{ticket.requester_email}</strong> ·{' '}
            {formatWhen(ticket.created_at)}
          </p>
          <p className="drawer-desc">{ticket.body}</p>

          {canWrite && (
            <div className="drawer-status">
              <span className="field-label">Status</span>
              <div className="segmented" role="group" aria-label="Set status">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={savingStatus}
                    aria-pressed={ticket.status === s}
                    className={`segmented-btn segmented-btn--${s} ${
                      ticket.status === s ? 'segmented-btn--active' : ''
                    }`}
                    onClick={() => handleStatusChange(s)}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <div className="comments">
            <h3 className="comments-title">
              Conversation
              <span className="comments-count">{comments.length}</span>
            </h3>
            {loadingComments ? (
              <p className="muted">Loading conversation…</p>
            ) : comments.length === 0 ? (
              <p className="muted">No comments yet.</p>
            ) : (
              <ul className="comment-list">
                {comments.map((c) => (
                  <li key={c.id} className="comment">
                    <div className="comment-head">
                      <span className="comment-author">{c.author_id}</span>
                      <span className="comment-when">{formatWhen(c.created_at)}</span>
                    </div>
                    <p className="comment-body">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}

            {canWrite && (
              <form className="comment-form" onSubmit={handleAddComment}>
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder="Write a reply…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <div className="comment-form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={posting || !newComment.trim()}
                  >
                    {posting ? 'Sending…' : 'Add comment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {canDelete && (
          <div className="drawer-foot">
            <button type="button" className="btn btn-danger" onClick={handleDelete}>
              Delete ticket
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
