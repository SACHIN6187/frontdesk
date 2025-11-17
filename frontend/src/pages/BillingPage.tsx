import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/authContext';
import type { Billing } from '../types';

export function BillingPage() {
  const { session } = useAuth();
  const token = session?.token ?? '';
  const isOwner = session?.role === 'owner';

  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getBilling(token);
      setBilling(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to load billing.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySubscription = (next: Billing) => setBilling(next);

  const handleUpgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const sub = await api.upgradeBilling(token);
      applySubscription(sub);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Upgrade failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const sub = await api.cancelBilling(token);
      applySubscription(sub);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Cancel failed.');
    } finally {
      setBusy(false);
    }
  };

  const seatPct =
    billing && billing.seat_limit > 0
      ? Math.min(100, Math.round((billing.seats / billing.seat_limit) * 100))
      : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">Your plan, seats, and subscription.</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading billing…</p>
      ) : billing ? (
        <div className="billing-grid">
          <div className="card plan-card">
            <div className="plan-head">
              <div>
                <span className="plan-eyebrow">Current plan</span>
                <h2 className="plan-name">
                  {billing.plan === 'pro' ? 'Pro' : 'Free'}
                </h2>
              </div>
              <span
                className={`badge plan-status plan-status--${
                  billing.status === 'active' ? 'active' : 'muted'
                }`}
              >
                {billing.status}
              </span>
            </div>

            <div className="seat-meter">
              <div className="seat-meter-top">
                <span>Seats used</span>
                <span>
                  <strong>{billing.seats}</strong> / {billing.seat_limit}
                </span>
              </div>
              <div className="meter" aria-hidden="true">
                <div
                  className={`meter-fill ${seatPct >= 100 ? 'meter-fill--full' : ''}`}
                  style={{ width: `${seatPct}%` }}
                />
              </div>
            </div>

            {billing.stripe_subscription_id && (
              <p className="plan-sub-id">
                Subscription: <code>{billing.stripe_subscription_id}</code>
              </p>
            )}

            {isOwner ? (
              <div className="plan-actions">
                {billing.plan === 'free' ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleUpgrade}
                    disabled={busy}
                  >
                    {busy ? 'Working…' : 'Upgrade to Pro'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleCancel}
                    disabled={busy}
                  >
                    {busy ? 'Working…' : 'Cancel plan'}
                  </button>
                )}
              </div>
            ) : (
              <p className="muted plan-note">
                Only owners can change the plan.
              </p>
            )}
          </div>

          <div className="card plan-compare">
            <h3 className="card-title">What Pro adds</h3>
            <ul className="feature-list">
              <li>More seats for your growing team</li>
              <li>Priority live-sync across every tab</li>
              <li>Full audit history on tickets</li>
              <li>Email + chat support</li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
