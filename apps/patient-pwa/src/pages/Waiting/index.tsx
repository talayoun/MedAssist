import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getWaitingStatus, sendContactMessage, ApiError } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import type { WaitingResponse, WaitingStatus } from '@medassist/shared-types';

const TEAL = '#0D9488';

const POLL_INTERVAL_MS = parseInt(import.meta.env.VITE_POLLING_INTERVAL_MS ?? '60000', 10);
const RING_RADIUS = 88;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const STATUS_STAGE: Record<WaitingStatus, { progress: number; label: string; color: string }> = {
  waiting: { progress: 1 / 3, label: 'ממתין', color: TEAL },
  in_treatment: { progress: 2 / 3, label: 'בטיפול', color: '#0f766e' },
  done: { progress: 1, label: 'הושלם', color: '#16a34a' },
};

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f7fafc',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,
  content: { maxWidth: '480px', margin: '0 auto', width: '100%', padding: '24px 16px 32px', flex: 1 } as React.CSSProperties,
  header: { textAlign: 'right', marginBottom: '24px' } as React.CSSProperties,
  h1: { fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' } as React.CSSProperties,
  subheader: { fontSize: '1rem', color: '#475569' } as React.CSSProperties,
  ringWrap: { display: 'flex', justifyContent: 'center', marginBottom: '24px' } as React.CSSProperties,
  ringCenterLabel: { fontSize: '0.875rem', color: '#475569', marginBottom: '4px' } as React.CSSProperties,
  ringCenterValue: { fontSize: '1.375rem', fontWeight: 700 } as React.CSSProperties,
  card: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '12px',
  } as React.CSSProperties,
  cardRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } as React.CSSProperties,
  cardLabel: { fontSize: '0.875rem', color: '#475569', marginBottom: '4px' } as React.CSSProperties,
  cardValue: { fontSize: '1.375rem', fontWeight: 700, color: '#0f172a' } as React.CSSProperties,
  iconCircle: {
    flexShrink: 0,
    background: '#f0fdfa',
    borderRadius: '14px',
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  divider: { borderTop: '1px solid #e2e8f0', marginTop: '16px', paddingTop: '16px' } as React.CSSProperties,
  warningCard: {
    background: '#fffbeb',
    border: '1px solid #d97706',
    borderRadius: '16px',
    padding: '18px 20px',
    marginBottom: '12px',
    fontSize: '0.9375rem',
    color: '#92400e',
    textAlign: 'right',
  } as React.CSSProperties,
  broadcastCard: {
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '16px',
    padding: '18px 20px',
    marginBottom: '12px',
    fontSize: '1rem',
    textAlign: 'right',
  } as React.CSSProperties,
  contactSection: { marginTop: '24px' } as React.CSSProperties,
  contactBtn: {
    display: 'block',
    width: '100%',
    minHeight: '56px',
    padding: '14px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    fontSize: '1.0625rem',
    fontWeight: 600,
    color: '#1a202c',
    cursor: 'pointer',
    marginBottom: '8px',
    textAlign: 'center',
  } as React.CSSProperties,
};

const CONTACT_MESSAGES = {
  need_help: 'אני זקוק לעזרה',
  confirm_here: 'אני כאן ומחכה',
  question: 'יש לי שאלה',
};

function ClockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export default function Waiting() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<WaitingResponse | null>(null);
  const [contactSent, setContactSent] = useState(false);
  const [showContactOptions, setShowContactOptions] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(() => {
    if (!token) return;
    getWaitingStatus(token)
      .then(setData)
      .catch((err: unknown) => {
        console.error('Failed to refresh waiting status:', err);
      });
  }, [token]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const handleContact = useCallback(
    async (type: 'need_help' | 'confirm_here' | 'question') => {
      if (!token) return;
      try {
        await sendContactMessage(token, type);
        setContactSent(true);
        setShowContactOptions(false);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 403) {
          // companion — silently ignore
        }
      }
    },
    [token]
  );

  if (!data) {
    return (
      <div style={{ ...styles.page, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>טוען מצב תור...</p>
      </div>
    );
  }

  const stage = STATUS_STAGE[data.status];
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - stage.progress);
  const estimatedCallTime =
    data.estimated_wait_minutes !== null
      ? formatTime(new Date(Date.now() + data.estimated_wait_minutes * 60000))
      : null;

  return (
    <div style={styles.page}>
      <AppHeader />
      <div style={styles.content}>
        <div style={styles.header}>
          <h1 style={styles.h1}>סטטוס המתנה</h1>
          <p style={styles.subheader}>הצוות ב{data.department} יודע שהגעת — נעדכן אותך כאן</p>
        </div>

        <div style={styles.ringWrap}>
          <div style={{ position: 'relative', width: '192px', height: '192px' }}>
            <svg width="192" height="192" viewBox="0 0 192 192" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="96" cy="96" r={RING_RADIUS} stroke="#e2e8f0" strokeWidth="8" fill="none" />
              <circle
                cx="96"
                cy="96"
                r={RING_RADIUS}
                stroke={stage.color}
                strokeWidth="8"
                fill="none"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.5s' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={styles.ringCenterLabel}>סטטוס</span>
              <span style={{ ...styles.ringCenterValue, color: stage.color }}>{stage.label}</span>
            </div>
          </div>
        </div>

        {data.estimated_wait_minutes !== null && (
          <div style={styles.card}>
            <div style={styles.cardRow}>
              <div style={{ textAlign: 'right' }}>
                <div style={styles.cardLabel}>זמן המתנה משוער</div>
                <div style={styles.cardValue}>כ-{data.estimated_wait_minutes} דקות</div>
              </div>
              <div style={styles.iconCircle}>
                <ClockIcon />
              </div>
            </div>
            {estimatedCallTime && (
              <div style={styles.divider}>
                <div style={{ ...styles.cardLabel, textAlign: 'right' }}>שעת קריאה משוערת</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>
                  {estimatedCallTime}
                </div>
              </div>
            )}
          </div>
        )}

        {data.status === 'done' && (
          <div style={{ ...styles.card, textAlign: 'center' }}>
            <p style={{ fontSize: '1.125rem', fontWeight: 600, color: '#16a34a' }}>הביקור הסתיים — נתראה!</p>
          </div>
        )}

        {data.broadcast_message && (
          <div style={styles.broadcastCard}>
            <strong>עדכון מהצוות: </strong>
            {data.broadcast_message}
          </div>
        )}

        {data.status !== 'done' && (
          <div style={styles.warningCard}>
            שים לב: זמן ההמתנה הוא הערכה בלבד ועשוי להשתנות בהתאם לעומס
          </div>
        )}

        <div style={styles.contactSection}>
          {!contactSent ? (
            <>
              {!showContactOptions ? (
                <button type="button" style={styles.contactBtn} onClick={() => setShowContactOptions(true)}>
                  צור קשר עם הצוות
                </button>
              ) : (
                <>
                  {(Object.entries(CONTACT_MESSAGES) as [keyof typeof CONTACT_MESSAGES, string][]).map(
                    ([type, label]) => (
                      <button key={type} type="button" style={styles.contactBtn} onClick={() => handleContact(type)}>
                        {label}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    style={{ ...styles.contactBtn, color: '#888' }}
                    onClick={() => setShowContactOptions(false)}
                  >
                    ביטול
                  </button>
                </>
              )}
            </>
          ) : (
            <p style={{ textAlign: 'center', color: '#16a34a', fontSize: '1rem' }}>✓ ההודעה נשלחה לצוות</p>
          )}
        </div>
      </div>
    </div>
  );
}
