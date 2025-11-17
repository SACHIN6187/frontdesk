import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/authContext';
import { RoleBadge } from '../components/RoleBadge';
import type { Member, Role } from '../types';

const ROLES: Role[] = ['owner', 'agent', 'viewer'];

export function MembersPage() {
  const { session } = useAuth();
  const token = session?.token ?? '';
  const isOwner = session?.role === 'owner';

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // invite form
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [inviting, setInviting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [seatLimitHit, setSeatLimitHit] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api.listMembers(token);
      setMembers(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.detail : 'Failed to load members.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setFormError(null);
    setSeatLimitHit(false);
    try {
      const created = await api.inviteMember(token, {
        email: email.trim(),
        name: name.trim(),
        password,
        role,
      });
      setMembers((prev) => [...prev, created]);
      setEmail('');
      setName('');
      setPassword('');
      setRole('agent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setSeatLimitHit(true);
      } else {
        setFormError(
          err instanceof ApiError ? err.detail : 'Failed to invite member.',
        );
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, nextRole: Role) => {
    setRowError(null);
    const prev = members;
    setMembers((cur) =>
      cur.map((m) => (m.user_id === userId ? { ...m, role: nextRole } : m)),
    );
    try {
      const updated = await api.updateMemberRole(token, userId, nextRole);
      setMembers((cur) =>
        cur.map((m) => (m.user_id === userId ? updated : m)),
      );
    } catch (err) {
      setMembers(prev);
      setRowError(
        err instanceof ApiError ? err.detail : 'Failed to change role.',
      );
    }
  };

  const handleRemove = async (userId: string) => {
    setRowError(null);
    try {
      await api.removeMember(token, userId);
      setMembers((cur) => cur.filter((m) => m.user_id !== userId));
    } catch (err) {
      setRowError(
        err instanceof ApiError ? err.detail : 'Failed to remove member.',
      );
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-subtitle">Manage who can access your support desk.</p>
        </div>
      </div>

      {isOwner && (
        <form className="card invite-form" onSubmit={handleInvite}>
          <h2 className="card-title">Invite a teammate</h2>
          <div className="invite-grid">
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sam Lee"
              />
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sam@company.com"
              />
            </label>
            <label className="field">
              <span className="field-label">Temp password</span>
              <input
                className="input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <label className="field">
              <span className="field-label">Role</span>
              <select
                className="select"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {seatLimitHit && (
            <div className="alert alert-warn" role="alert">
              <strong>You&apos;ve hit your seat limit.</strong> Upgrade to Pro to
              add more teammates.{' '}
              <a className="link" href="/billing">
                Go to billing →
              </a>
            </div>
          )}
          {formError && (
            <div className="alert alert-error" role="alert">
              {formError}
            </div>
          )}

          <div className="invite-actions">
            <button type="submit" className="btn btn-primary" disabled={inviting}>
              {inviting ? 'Inviting…' : 'Send invite'}
            </button>
          </div>
        </form>
      )}

      {rowError && (
        <div className="alert alert-error" role="alert">
          {rowError}
        </div>
      )}
      {loadError && (
        <div className="alert alert-error" role="alert">
          {loadError}
        </div>
      )}

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              {isOwner && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isOwner ? 4 : 3} className="muted">
                  Loading members…
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={isOwner ? 4 : 3} className="muted">
                  No members yet.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.name}</td>
                  <td className="td-muted">{m.email}</td>
                  <td>
                    {isOwner ? (
                      <select
                        className="select select-sm"
                        value={m.role}
                        aria-label={`Role for ${m.name}`}
                        onChange={(e) =>
                          handleRoleChange(m.user_id, e.target.value as Role)
                        }
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r[0].toUpperCase() + r.slice(1)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={m.role} />
                    )}
                  </td>
                  {isOwner && (
                    <td className="td-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRemove(m.user_id)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
