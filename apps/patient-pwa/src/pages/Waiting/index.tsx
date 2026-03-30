import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getWaitingStatus, sendContactMessage, ApiError } from '../../services/api';
import type { WaitingResponse } from '@medassist/shared-types';

const POLL_INTERVAL_MS = parseInt(
  (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_POLLING_INTERVAL_MS) ?? '60000',
  10
);

const styles = {
  page: {
    minHeight: '100vh',
    padding: '24px 16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '480px',
    margin: '0 auto',
  } as React.CSSProperties,
  confirmationBanner: {
    background: '#d4edda',
    border: '1px solid #28a745',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
    fontSize: '1.125rem',
    color: '#155724',
    textAlign: 'center',
  } as React.CSSProperties,
  waitEstimate: {
    fontSize: '1.375rem',
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: '20px',
    color: '#1a1a1a',
  } as React.CSSProperties,
  broadcast: {
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '8px',
    padding: '14px',
    marginBottom: '20px',
    fontSize: '1rem',
  } as React.CSSProperties,
  contactSection: { marginTop: '24px' } as React.CSSProperties,
  contactBtn: {
    display: 'block',
    width: '100%',
    padding: '14px',
    background: '#f1f3f4',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    minHeight: '44px',
    marginBottom: '8px',
    textAlign: 'center',
  } as React.CSSProperties,
};

const CONTACT_MESSAGES = {
  need_help: 'אני זקוק לעזרה',
  confirm_here: 'אני כאן ומחכה',
  question: 'יש לי שאלה',
};

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
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>טוען מצב תור...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.confirmationBanner}>
        ✅ הגעת! הצוות ב{data.department} יודע שאתה כאן.
      </div>

      {data.estimated_wait_minutes !== null && (
        <p style={styles.waitEstimate}>
          זמן המתנה משוער: כ-{data.estimated_wait_minutes} דקות
        </p>
      )}

      {data.status === 'in_treatment' && (
        <p style={{ ...styles.waitEstimate, color: '#1a73e8' }}>אתה נמצא כעת בטיפול</p>
      )}

      {data.status === 'done' && (
        <p style={{ ...styles.waitEstimate, color: '#28a745' }}>הביקור הסתיים — נתראה!</p>
      )}

      {data.broadcast_message && (
        <div style={styles.broadcast}>
          <strong>עדכון מהצוות: </strong>
          {data.broadcast_message}
        </div>
      )}

      <div style={styles.contactSection}>
        {!contactSent ? (
          <>
            {!showContactOptions ? (
              <button
                style={styles.contactBtn}
                onClick={() => setShowContactOptions(true)}
              >
                📞 צור קשר עם הצוות
              </button>
            ) : (
              <>
                {(Object.entries(CONTACT_MESSAGES) as [keyof typeof CONTACT_MESSAGES, string][]).map(
                  ([type, label]) => (
                    <button
                      key={type}
                      style={styles.contactBtn}
                      onClick={() => handleContact(type)}
                    >
                      {label}
                    </button>
                  )
                )}
                <button
                  style={{ ...styles.contactBtn, color: '#888' }}
                  onClick={() => setShowContactOptions(false)}
                >
                  ביטול
                </button>
              </>
            )}
          </>
        ) : (
          <p style={{ textAlign: 'center', color: '#28a745', fontSize: '1rem' }}>
            ✓ ההודעה נשלחה לצוות
          </p>
        )}
      </div>
    </div>
  );
}
