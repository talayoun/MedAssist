import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNavigation, confirmStep, ApiError } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import type { NavigationRoute, NavigationStep } from '@medassist/shared-types';

const TEAL = '#0D9488';
const TEAL_HOVER = '#0F766E';

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f7fafc',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,
  content: { maxWidth: '480px', margin: '0 auto', width: '100%', padding: '24px 16px 32px', flex: 1 } as React.CSSProperties,
  header: { textAlign: 'right', marginBottom: '20px' } as React.CSSProperties,
  h1: { fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' } as React.CSSProperties,
  subheader: { fontSize: '1rem', color: '#475569' } as React.CSSProperties,
  peekBanner: {
    background: '#f0fdfa',
    border: `1px solid ${TEAL}`,
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '0.875rem',
    color: TEAL_HOVER,
    textAlign: 'center',
    marginBottom: '12px',
  } as React.CSSProperties,
  stepCard: {
    background: '#fff',
    border: `2px solid ${TEAL}`,
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '20px',
  } as React.CSSProperties,
  instruction: { fontSize: '1.25rem', fontWeight: 600, color: '#1a202c', textAlign: 'right', marginBottom: '16px', lineHeight: 1.5 } as React.CSSProperties,
  photo: {
    width: '100%',
    aspectRatio: '4/3',
    objectFit: 'cover',
    borderRadius: '14px',
    display: 'block',
  } as React.CSSProperties,
  photoPlaceholder: {
    width: '100%',
    aspectRatio: '4/3',
    borderRadius: '14px',
    background: '#f0fdfa',
    border: `1px dashed ${TEAL}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '16px',
    textAlign: 'center',
  } as React.CSSProperties,
  photoPlaceholderText: { fontSize: '0.9375rem', fontWeight: 600, color: TEAL_HOVER, lineHeight: 1.5 } as React.CSSProperties,
  dotsRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' } as React.CSSProperties,
  confirmBtn: {
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
    marginBottom: '12px',
    boxShadow: '0 2px 6px rgba(13,148,136,0.35)',
  } as React.CSSProperties,
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    minHeight: '56px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    fontSize: '1.0625rem',
    fontWeight: 700,
    color: '#1a202c',
    cursor: 'pointer',
    marginBottom: '20px',
  } as React.CSSProperties,
  mapRow: { display: 'flex', flexDirection: 'column', gap: '12px' } as React.CSSProperties,
  wazeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    minHeight: '56px',
    background: TEAL,
    color: '#fff',
    border: 'none',
    borderRadius: '14px',
    fontSize: '1.0625rem',
    fontWeight: 700,
    cursor: 'pointer',
  } as React.CSSProperties,
  gmapsBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    minHeight: '56px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    fontSize: '1.0625rem',
    fontWeight: 700,
    color: '#1a202c',
    cursor: 'pointer',
  } as React.CSSProperties,
};

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PinIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 15l-5-5-9 9" />
    </svg>
  );
}

export default function Navigation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<NavigationRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewOrder, setViewOrder] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const stepCache = useRef<Map<number, NavigationStep>>(new Map());

  const loadNavigation = useCallback(() => {
    if (!token) return;
    getNavigation(token)
      .then((res) => {
        res.steps.forEach((s) => stepCache.current.set(s.order, s));
        setData(res);
        setViewOrder(res.current_step);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.message || 'שגיאה בטעינת הניווט.');
        else setError('שגיאה בטעינת הניווט.');
      });
  }, [token]);

  useEffect(() => { loadNavigation(); }, [loadNavigation]);
  useEffect(() => { setImageFailed(false); }, [viewOrder]);

  const handleConfirm = useCallback(async () => {
    if (!token || !data || loading) return;
    const currentStep = stepCache.current.get(data.current_step) ?? data.steps.find((s) => s.is_current);
    if (!currentStep) return;
    setLoading(true);
    try {
      const result = await confirmStep(token, currentStep.step_id);
      if (result.phase === 'waiting') {
        navigate(`/visit/${token}/waiting`, { replace: true });
        return;
      }
      if (result.next_step) stepCache.current.set(result.next_step.order, result.next_step);
      loadNavigation();
    } catch (err: unknown) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, data, loading, navigate, loadNavigation]);

  const handleWaze = useCallback(() => {
    if (!data?.parking_coordinates) return;
    const { lat, lng } = data.parking_coordinates;
    window.open(`https://www.waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`, '_blank');
  }, [data]);

  const handleGoogleMaps = useCallback(() => {
    if (!data?.parking_coordinates) return;
    const { lat, lng } = data.parking_coordinates;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  }, [data]);

  if (error) {
    return (
      <div style={{ ...styles.page, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#c00', fontSize: '1rem', padding: '24px' }}>{error}</p>
      </div>
    );
  }

  if (!data || data.steps.length === 0 || viewOrder === null) {
    return (
      <div style={{ ...styles.page, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>טוען הוראות ניווט...</p>
      </div>
    );
  }

  const displayedStep = stepCache.current.get(viewOrder) ?? data.steps.find((s) => s.is_current) ?? data.steps[0];
  const isPeekingPast = viewOrder < data.current_step;
  const canGoOlder = stepCache.current.has(viewOrder - 1);

  return (
    <div style={styles.page}>
      <AppHeader />
      <div style={styles.content}>
        <div style={styles.header}>
          <h1 style={styles.h1}>ניווט בבית החולים</h1>
          <p style={styles.subheader}>
            שלב {viewOrder} מתוך {data.total_steps}
          </p>
        </div>

        {isPeekingPast && (
          <div style={styles.peekBanner}>צופה בשלב קודם — ההתקדמות שלך נשמרה בשלב {data.current_step}</div>
        )}

        <div style={styles.stepCard}>
          <p style={styles.instruction}>{displayedStep.instruction}</p>
          {imageFailed ? (
            <div style={styles.photoPlaceholder}>
              <PhotoIcon />
              <span style={styles.photoPlaceholderText}>{displayedStep.instruction}</span>
            </div>
          ) : (
            <img
              key={displayedStep.step_id}
              src={displayedStep.image_url}
              alt={`שלב ${displayedStep.order} — ${displayedStep.instruction}`}
              style={styles.photo}
              onError={() => setImageFailed(true)}
            />
          )}
        </div>

        <div style={styles.dotsRow}>
          {Array.from({ length: data.total_steps }, (_, i) => i + 1).map((order) => (
            <div
              key={order}
              style={{
                borderRadius: '999px',
                height: '8px',
                width: order === viewOrder ? '32px' : '8px',
                background: order <= data.current_step ? TEAL : '#e2e8f0',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {isPeekingPast ? (
          <button
            type="button"
            style={styles.confirmBtn}
            onClick={() => setViewOrder(data.current_step)}
          >
            <span>חזרה לשלב הנוכחי</span>
          </button>
        ) : (
          <button
            type="button"
            style={{ ...styles.confirmBtn, opacity: loading ? 0.7 : 1 }}
            onClick={handleConfirm}
            disabled={loading}
          >
            <CheckIcon />
            <span>{loading ? 'מעבד...' : 'אני כאן'}</span>
          </button>
        )}

        {canGoOlder && (
          <button
            type="button"
            style={styles.backBtn}
            onClick={() => setViewOrder((v) => (v ?? 1) - 1)}
            disabled={loading}
          >
            <span>שלב קודם</span>
          </button>
        )}

        {data.parking_coordinates && (
          <div style={styles.mapRow}>
            <button type="button" style={styles.wazeBtn} onClick={handleWaze}>
              <PinIcon color="#fff" />
              <span>פתיחה ב-Waze</span>
            </button>
            <button type="button" style={styles.gmapsBtn} onClick={handleGoogleMaps}>
              <PinIcon color="#1a202c" />
              <span>פתיחה ב-Google Maps</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
