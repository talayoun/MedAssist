import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNavigation, confirmStep, ApiError } from '../../services/api';
import type { NavigationRoute } from '@medassist/shared-types';

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: '#fff',
  } as React.CSSProperties,
  photo: {
    width: '100%',
    aspectRatio: '4/3',
    objectFit: 'cover',
    display: 'block',
  } as React.CSSProperties,
  content: { padding: '20px 16px', flex: 1 } as React.CSSProperties,
  progress: { fontSize: '0.875rem', color: '#888', marginBottom: '12px' } as React.CSSProperties,
  instruction: { fontSize: '1.25rem', fontWeight: 600, marginBottom: '24px', lineHeight: 1.5 } as React.CSSProperties,
  confirmBtn: {
    display: 'block',
    width: '100%',
    padding: '16px',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1.125rem',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: '56px',
    marginBottom: '12px',
  } as React.CSSProperties,
  backBtn: {
    display: 'block',
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: '1px solid #ccc',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    minHeight: '44px',
    marginBottom: '12px',
  } as React.CSSProperties,
  mapBtn: {
    display: 'block',
    width: '100%',
    padding: '12px',
    background: '#f1f3f4',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    minHeight: '44px',
  } as React.CSSProperties,
};

export default function Navigation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<NavigationRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNavigation = useCallback(() => {
    if (!token) return;
    getNavigation(token)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.message || 'שגיאה בטעינת הניווט.');
        else setError('שגיאה בטעינת הניווט.');
      });
  }, [token]);

  useEffect(() => { loadNavigation(); }, [loadNavigation]);

  const handleConfirm = useCallback(async () => {
    if (!token || !data || loading) return;
    const currentStep = data.steps.find((s) => s.is_current);
    if (!currentStep) return;
    setLoading(true);
    try {
      const result = await confirmStep(token, currentStep.step_id);
      if (result.phase === 'waiting') {
        navigate(`/visit/${token}/waiting`, { replace: true });
        return;
      }
      // Reload navigation with updated step
      loadNavigation();
    } catch (err: unknown) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, data, loading, navigate, loadNavigation]);

  const handleBack = useCallback(async () => {
    if (!token || !data || loading) return;
    // Navigate back by decrementing current step — reload navigation
    loadNavigation();
  }, [token, data, loading, loadNavigation]);

  const handleMapLaunch = useCallback(() => {
    if (!data?.parking_coordinates) return;
    const { lat, lng } = data.parking_coordinates;
    window.open(`geo:${lat},${lng}?q=${lat},${lng}(Hospital+Parking)`, '_blank');
  }, [data]);

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#c00', fontSize: '1rem' }}>{error}</p>
      </div>
    );
  }

  if (data?.completed) {
    return (
      <section
        style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        aria-label="ניווט הושלם - תצוגה לעיון בלבד"
      >
        <div
          role="status"
          style={{
            background: '#d1fae5',
            color: '#065f46',
            borderRadius: 12,
            padding: '1rem 1.25rem',
            fontSize: '1.25rem',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          הגעת ליעד ✓
        </div>
        <p style={{ color: '#6b7280', fontSize: '1rem', margin: 0, textAlign: 'center' }}>
          {data.route_name}
        </p>
        <button
          onClick={() => navigate(`/visit/${token}/waiting`)}
          style={{
            width: '100%',
            minHeight: 44,
            fontSize: '1rem',
            fontWeight: 600,
            background: '#1a73e8',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          חזרה להמתנה
        </button>
      </section>
    );
  }

  if (!data || data.steps.length === 0) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: '#555' }}>טוען הוראות ניווט...</p>
      </div>
    );
  }

  const currentStep = data.steps.find((s) => s.is_current) ?? data.steps[0];

  return (
    <div style={styles.page}>
      <img
        src={currentStep.image_url}
        alt={`שלב ${currentStep.order} — ${currentStep.instruction}`}
        style={styles.photo}
      />
      <div style={styles.content}>
        <p style={styles.progress}>
          שלב {data.current_step} מתוך {data.total_steps}
        </p>
        <p style={styles.instruction}>{currentStep.instruction}</p>

        <button style={styles.confirmBtn} onClick={handleConfirm} disabled={loading}>
          {loading ? 'מעבד...' : '✓ אני כאן'}
        </button>

        {data.current_step > 1 && (
          <button style={styles.backBtn} onClick={handleBack} disabled={loading}>
            שלב קודם ←
          </button>
        )}

        {data.parking_coordinates && (
          <button style={styles.mapBtn} onClick={handleMapLaunch}>
            🗺 נווט לחניון
          </button>
        )}
      </div>
    </div>
  );
}
