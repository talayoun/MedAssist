import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import MagicLinkEntry from './pages/MagicLinkEntry';
import Checklist from './pages/Checklist';
import Navigation from './pages/Navigation';
import Waiting from './pages/Waiting';
import { SignaturePage } from './pages/Forms/SignaturePage';
import ErrorPage from './pages/Error';
import BottomNav from './components/BottomNav';

// Hebrew RTL for all patient-facing content
document.documentElement.setAttribute('dir', 'rtl');
document.documentElement.setAttribute('lang', 'he');

// Layout wrapper for visit pages that should show the bottom nav.
// Adds bottom padding so content is never hidden behind the fixed nav.
function VisitLayout() {
  return (
    <div style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
      <Outlet />
      <BottomNav />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/visit/:token" element={<MagicLinkEntry />} />
        <Route element={<VisitLayout />}>
          <Route path="/visit/:token/checklist" element={<Checklist />} />
          <Route path="/visit/:token/navigation" element={<Navigation />} />
          <Route path="/visit/:token/waiting" element={<Waiting />} />
        </Route>
        <Route path="/visit/:token/forms/:itemId" element={<SignaturePage />} />
        <Route path="/error/:type" element={<ErrorPage />} />
        <Route path="*" element={<Navigate to="/error/not_found" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
