import React, { createContext, useContext, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Login from './pages/Login';
import Queue from './pages/Queue';
import PatientDetail from './pages/PatientDetail';
import Admin from './pages/Admin';
import NavigationRoutes from './pages/Admin/NavigationRoutes';
import Trash from './pages/Admin/Trash';
import { FormTemplates } from './pages/Admin/FormTemplates';
import { getSessionUser } from './services/api';
import AppShell from './components/AppShell';

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
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/queue" element={<Queue />} />
            <Route path="/patients/:appointmentId" element={<PatientDetail />} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Outlet />
                </RequireAdmin>
              }
            >
              <Route index element={<Navigate to="checklists" replace />} />
              <Route path="checklists" element={<Admin />} />
              <Route path="navigation-routes" element={<NavigationRoutes />} />
              <Route path="form-templates" element={<FormTemplates />} />
              <Route path="trash" element={<Trash />} />
            </Route>
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
