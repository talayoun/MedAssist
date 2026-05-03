import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams, useNavigate } from 'react-router-dom';
import MagicLinkEntry from './pages/MagicLinkEntry';
import Checklist from './pages/Checklist';
import Navigation from './pages/Navigation';
import Waiting from './pages/Waiting';
import { SignaturePage } from './pages/Forms/SignaturePage';
import ErrorPage from './pages/Error';
import BottomNav from './components/BottomNav';
import { resolveVisit, ApiError } from './services/api';
import { VisitPhaseContext, AppPhase } from './context/VisitPhaseContext';

// Hebrew RTL for all patient-facing content
document.documentElement.setAttribute('dir', 'rtl');
document.documentElement.setAttribute('lang', 'he');

// Layout wrapper for visit pages that should show the bottom nav.
// Fetches visit phase and provides it via context; polls every 30s.
// Adds bottom padding so content is never hidden behind the fixed nav.
function VisitLayout() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<AppPhase>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const fetchPhase = () => {
      resolveVisit(token)
        .then(v => { if (!cancelled) setPhase(v.phase); })
        .catch(err => {
          if (cancelled) return;
          if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
            navigate('/error/not_found', { replace: true });
          }
        });
    };

    fetchPhase();
    const id = setInterval(fetchPhase, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [token]);

  return (
    <VisitPhaseContext.Provider value={phase}>
      <div style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
        <Outlet />
        <BottomNav />
      </div>
    </VisitPhaseContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/visit/:token">
          <Route index element={<MagicLinkEntry />} />
          <Route element={<VisitLayout />}>
            <Route path="checklist" element={<Checklist />} />
            <Route path="navigation" element={<Navigation />} />
            <Route path="waiting" element={<Waiting />} />
          </Route>
          <Route path="forms/:itemId" element={<SignaturePage />} />
        </Route>
        <Route path="/error/:type" element={<ErrorPage />} />
        <Route path="*" element={<Navigate to="/error/not_found" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
