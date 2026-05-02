import React, { createContext, useContext, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Queue from './pages/Queue';
import PatientDetail from './pages/PatientDetail';
import Admin from './pages/Admin';
import NavigationRoutes from './pages/Admin/NavigationRoutes';
import Trash from './pages/Admin/Trash';
import { FormTemplates } from './pages/Admin/FormTemplates';
import { logout, getSessionUser } from './services/api';

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

// ─── Admin Layout ─────────────────────────────────────────────────────────────

function AdminLayout() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout().catch(() => {});
    setUser(null);
    navigate('/login', { replace: true });
  }

  const ghostBtn: React.CSSProperties = {
    padding: '7px 14px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.4)',
    color: '#fff',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  };
  const activeGhostBtn: React.CSSProperties = {
    ...ghostBtn,
    background: '#fff',
    color: '#1b3a6b',
    border: '1px solid #fff',
    fontWeight: 700,
  };

  return (
    <div style={{ direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#eef2f7', minHeight: '100vh' }}>
      <header style={{
        background: '#1b3a6b',
        color: '#fff',
        padding: '14px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(27,58,107,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.2px' }}>MedAssist</span>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <NavLink to="/queue" style={ghostBtn}>לוח בקרה</NavLink>
            <span style={{ color: 'rgba(255,255,255,0.25)', padding: '0 4px' }}>|</span>
            <NavLink to="/admin/checklists" style={({ isActive }) => isActive ? activeGhostBtn : ghostBtn}>
              תבניות צ׳קליסט
            </NavLink>
            <NavLink to="/admin/navigation-routes" style={({ isActive }) => isActive ? activeGhostBtn : ghostBtn}>
              מסלולי ניווט
            </NavLink>
            <NavLink to="/admin/form-templates" style={({ isActive }) => isActive ? activeGhostBtn : ghostBtn}>
              תבניות טפסים
            </NavLink>
            <NavLink to="/admin/trash" style={({ isActive }) => isActive ? activeGhostBtn : ghostBtn}>
              פח אשפה
            </NavLink>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, opacity: 0.75 }}>{user?.name}</span>
          <button onClick={handleLogout} style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            color: 'rgba(255,255,255,0.8)',
            borderRadius: 6,
            padding: '7px 14px',
            cursor: 'pointer',
            fontSize: 13,
          }}>יציאה</button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    getSessionUser()
      .then((user) => { if (user) setUser(user as AuthUser); })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  if (!authChecked) return null;

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
            <Route index element={<Navigate to="checklists" replace />} />
            <Route path="checklists" element={<Admin />} />
            <Route path="navigation-routes" element={<NavigationRoutes />} />
            <Route path="form-templates" element={<FormTemplates />} />
            <Route path="trash" element={<Trash />} />
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
