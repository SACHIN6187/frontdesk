import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/authContext';
import { RoleBadge } from './RoleBadge';

export function NavBar() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  if (!session) return null;

  const handleLogout = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <header className="nav">
      <div className="nav-inner">
        <div className="nav-brand">
          <span className="nav-logo" aria-hidden="true">
            {/* stylised support headset mark */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
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
          <div className="nav-brand-text">
            <span className="nav-title">Frontdesk</span>
            <span className="nav-org" title={session.orgId}>
              {session.orgId}
            </span>
          </div>
        </div>

        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/tickets" className="nav-link">
            Tickets
          </NavLink>
          <NavLink to="/members" className="nav-link">
            Members
          </NavLink>
          <NavLink to="/billing" className="nav-link">
            Billing
          </NavLink>
        </nav>

        <div className="nav-right">
          <div className="nav-user">
            <span className="nav-user-name">{session.name || session.email}</span>
            <RoleBadge role={session.role} />
          </div>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
