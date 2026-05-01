import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MagicLinkEntry from './pages/MagicLinkEntry';
import Checklist from './pages/Checklist';
import Navigation from './pages/Navigation';
import Waiting from './pages/Waiting';
import Forms from './pages/Forms';
import { SignaturePage } from './pages/Forms/SignaturePage';
import ErrorPage from './pages/Error';

// Hebrew RTL for all patient-facing content
document.documentElement.setAttribute('dir', 'rtl');
document.documentElement.setAttribute('lang', 'he');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/visit/:token" element={<MagicLinkEntry />} />
        <Route path="/visit/:token/checklist" element={<Checklist />} />
        <Route path="/visit/:token/navigation" element={<Navigation />} />
        <Route path="/visit/:token/waiting" element={<Waiting />} />
        <Route path="/visit/:token/forms" element={<Forms />} />
        <Route path="/visit/:token/forms/:itemId" element={<SignaturePage />} />
        <Route path="/error/:type" element={<ErrorPage />} />
        <Route path="*" element={<Navigate to="/error/not_found" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
