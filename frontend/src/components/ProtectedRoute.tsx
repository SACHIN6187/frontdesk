import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/authContext';

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
