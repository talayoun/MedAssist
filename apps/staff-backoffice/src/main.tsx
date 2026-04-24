import React, { createContext, useContext, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet } from 'react-router-dom';
import Login from './pages/Login';
import Queue from './pages/Queue';
import PatientDetail from './pages/PatientDetail';
import Admin from './pages/Admin';
import NavigationRoutes from './pages/Admin/NavigationRoutes';

// ─── Auth Context ─────────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'staff' | 'admin';
  department_id: string | null;
  department_name?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/queue" replace />;
  return <>{children}</>;
}

// ─── Admin Layout (tabs) ──────────────────────────────────────────────────────

function AdminLayout() {
  const tabStyle: React.CSSProperties = {
    padding: '8px 14px', textDecoration: 'none', color: '#374151', fontSize: 14,
    borderRadius: 7, fontWeight: 500,
  };
  const activeStyle: React.CSSProperties = {
    ...tabStyle, background: '#1b3a6b', color: '#fff', fontWeight: 600,
  };
  return (
    <div style={{ direction: 'rtl' }}>
      <nav style={{
        display: 'flex', gap: 8, padding: '12px 24px', borderBottom: '1px solid #e5e7eb',
        background: '#fff',
      }}>
        <NavLink to="/admin" end style={({ isActive }) => isActive ? activeStyle : tabStyle}>
          תבניות צ׳קליסט
        </NavLink>
        <NavLink to="/admin/navigation-routes" style={({ isActive }) => isActive ? activeStyle : tabStyle}>
          מסלולי ניווט
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/queue"
            element={
              <RequireAuth>
                <Queue />
              </RequireAuth>
            }
          />
          <Route
            path="/patients/:appointmentId"
            element={
              <RequireAuth>
                <PatientDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Admin />} />
            <Route path="navigation-routes" element={<NavigationRoutes />} />
          </Route>
          <Route path="*" element={<Navigate to="/queue" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
