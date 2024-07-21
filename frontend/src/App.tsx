import { Navigate, Route, Routes } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { TicketsPage } from './pages/TicketsPage';
import { MembersPage } from './pages/MembersPage';
import { BillingPage } from './pages/BillingPage';

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main">{children}</main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route
          path="/tickets"
          element={
            <AppShell>
              <TicketsPage />
            </AppShell>
          }
        />
        <Route
          path="/members"
          element={
            <AppShell>
              <MembersPage />
            </AppShell>
          }
        />
        <Route
          path="/billing"
          element={
            <AppShell>
              <BillingPage />
            </AppShell>
          }
        />
      </Route>
      <Route path="/" element={<Navigate to="/tickets" replace />} />
      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  );
}
