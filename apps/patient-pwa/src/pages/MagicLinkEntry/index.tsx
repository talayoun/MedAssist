import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveVisit, ApiError } from '../../services/api';
import type { VisitContext } from '@medassist/shared-types';
import AppHeader from '../../components/AppHeader';

const TEAL = '#0D9488';
const TEAL_HOVER = '#0F766E';

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f7fafc',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,
  greeting: { fontSize: '1.125rem', fontWeight: 700, color: '#1a202c' } as React.CSSProperties,
  content: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '32px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  } as React.CSSProperties,
  card: {
    background: '#fff',
    borderRadius: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,
  cardTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#1a202c', textAlign: 'center', marginBottom: '8px' } as React.CSSProperties,
  infoBox: {
    background: '#f7fafc',
    borderRadius: '16px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,
  infoLabel: { fontSize: '1rem', color: '#718096' } as React.CSSProperties,
  infoValue: { fontSize: '1.25rem', fontWeight: 700, color: '#1a202c' } as React.CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } as React.CSSProperties,
  calendarBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    minHeight: '56px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#2d3748',
    cursor: 'pointer',
  } as React.CSSProperties,
  startBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    minHeight: '64px',
    background: TEAL,
    color: '#fff',
    border: 'none',
    borderRadius: '16px',
    fontSize: '1.25rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(13,148,136,0.35)',
  } as React.CSSProperties,
  urgentBox: {
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '16px',
    padding: '16px 20px',
    fontSize: '1.0625rem',
    color: '#7a5c00',
    textAlign: 'center',
  } as React.CSSProperties,
};

const PHASE_CTA: Record<VisitContext['phase'], string> = {
  checklist: 'התכוננות לביקור',
  navigation: 'המשך לניווט',
  waiting: 'המשך למסך ההמתנה',
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function toGCalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export default function MagicLinkEntry() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<VisitContext | null>(null);

  useEffect(() => {
    if (!token) {
      navigate('/error/not_found', { replace: true });
      return;
    }

    resolveVisit(token)
      .then(setCtx)
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          if (err.status === 410) navigate('/error/link_expired', { replace: true });
          else if (err.status === 409) navigate('/error/link_used', { replace: true });
          else navigate('/error/not_found', { replace: true });
        } else {
          navigate('/error/server_error', { replace: true });
        }
      });
  }, [token, navigate]);

  const handleStart = useCallback(() => {
    if (!token || !ctx) return;
    navigate(`/visit/${token}/${ctx.phase}`, { replace: true });
  }, [token, ctx, navigate]);

  const handleCalendarExport = useCallback(() => {
    if (!ctx?.patient.visit_date) return;
    const start = new Date(ctx.patient.visit_date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      `ביקור ב${ctx.patient.department}`
    )}&dates=${toGCalStamp(start)}/${toGCalStamp(end)}&details=${encodeURIComponent(
      `ביקור מתוכנן במחלקת ${ctx.patient.department}`
    )}`;
    window.open(url, '_blank');
  }, [ctx]);

  if (!ctx) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>טוען...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <AppHeader>
        <span style={styles.greeting}>שלום, {ctx.patient.name}</span>
      </AppHeader>

      <main style={styles.content}>
        <div style={styles.card}>
          <h1 style={styles.cardTitle}>הביקור הקרוב שלך</h1>

          <div style={styles.infoBox}>
            <span style={styles.infoLabel}>מחלקה</span>
            <span style={styles.infoValue}>{ctx.patient.department}</span>
          </div>

          {ctx.patient.visit_date ? (
            <>
              <div style={styles.grid2}>
                <div style={styles.infoBox}>
                  <span style={styles.infoLabel}>תאריך</span>
                  <span style={styles.infoValue}>{formatDate(ctx.patient.visit_date)}</span>
                </div>
                <div style={styles.infoBox}>
                  <span style={styles.infoLabel}>שעה</span>
                  <span style={styles.infoValue}>{formatTime(ctx.patient.visit_date)}</span>
                </div>
              </div>

              <button type="button" style={styles.calendarBtn} onClick={handleCalendarExport}>
                <span>הוסף ליומן Google</span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="#4285F4" strokeWidth="2" />
                  <path d="M16 2V6M8 2V6M3 10H21" stroke="#4285F4" strokeWidth="2" />
                </svg>
              </button>
            </>
          ) : (
            <div style={styles.urgentBox}>⚡ ביקור דחוף — אין צורך בתיאום מראש</div>
          )}
        </div>

        <button type="button" style={styles.startBtn} onClick={handleStart}
          onMouseEnter={(e) => (e.currentTarget.style.background = TEAL_HOVER)}
          onMouseLeave={(e) => (e.currentTarget.style.background = TEAL)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{PHASE_CTA[ctx.phase]}</span>
        </button>
      </main>
    </div>
  );
}
