import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/authContext';

type Tab = 'login' | 'signup';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('login');
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth =
        tab === 'signup'
          ? await api.signup({ org_name: orgName, name, email, password })
          : await api.login({ email, password });
      signIn({
        token: auth.access_token,
        role: auth.role,
        orgId: auth.org_id,
        name: tab === 'signup' ? name : '',
        email,
      });
      navigate('/tickets', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || 'Something went wrong. Please try again.');
      } else {
        setError('Unable to reach the server. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-head">
          <span className="auth-logo" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 13a8 8 0 0116 0v4a3 3 0 01-3 3h-1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <rect x="2.5" y="12" width="4" height="7" rx="2" fill="currentColor" />
              <rect x="17.5" y="12" width="4" height="7" rx="2" fill="currentColor" />
            </svg>
          </span>
          <h1 className="auth-title">Frontdesk</h1>
          <p className="auth-subtitle">
            The calm, fast support desk for your whole team.
          </p>
        </div>

        <div className="tabs" role="tablist" aria-label="Authentication">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'login'}
            className={`tab ${tab === 'login' ? 'tab--active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signup'}
            className={`tab ${tab === 'signup' ? 'tab--active' : ''}`}
            onClick={() => switchTab('signup')}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {tab === 'signup' && (
            <>
              <label className="field">
                <span className="field-label">Organization name</span>
                <input
                  className="input"
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="Acme Support"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Your name</span>
                <input
                  className="input"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Jordan Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              required
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy
              ? 'Please wait…'
              : tab === 'signup'
                ? 'Create organization'
                : 'Log in'}
          </button>
        </form>

        <p className="auth-foot">
          {tab === 'login' ? (
            <>
              New to Frontdesk?{' '}
              <button type="button" className="link" onClick={() => switchTab('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="link" onClick={() => switchTab('login')}>
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
