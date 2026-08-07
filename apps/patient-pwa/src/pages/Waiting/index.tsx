import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getWaitingStatus, sendContactMessage, ApiError } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import type { WaitingResponse, WaitingStatus } from '@medassist/shared-types';

const POLL_INTERVAL_MS = parseInt(import.meta.env.VITE_POLLING_INTERVAL_MS ?? '60000', 10);
const RING_RADIUS = 80;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const STATUS_STAGE: Record<WaitingStatus, { progress: number; label: string }> = {
  waiting: { progress: 1 / 3, label: 'ממתין' },
  in_treatment: { progress: 2 / 3, label: 'בטיפול' },
  done: { progress: 1, label: 'הושלם' },
};

const CONTACT_MESSAGES = {
  need_help: 'אני זקוק לעזרה',
  confirm_here: 'אני כאן ומחכה',
  question: 'יש לי שאלה',
};

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
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-[#555]">טוען מצב תור...</p>
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
    <div className="min-h-screen flex flex-col bg-bg">
      <AppHeader />
      <div className="max-w-[480px] w-full mx-auto px-4 py-5 flex flex-col gap-4">
        <div className="bg-gradient-to-br from-teal to-teal-hover rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-end gap-2 mb-4">
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">עדכון חי</span>
            <span className="relative w-3 h-3">
              <span className="absolute inset-0 rounded-full bg-[#4ADE80] animate-ping opacity-75" />
              <span className="relative block rounded-full w-3 h-3 bg-[#22C55E]" />
            </span>
          </div>
          <h2 className="text-[22px] font-bold text-white text-right mb-3">
            הצוות ב{data.department} יודע שהגעת
          </h2>
          <p className="text-[15px] leading-6 text-white/85 text-right">
            נעדכן אותך כאן בנייד ברגע שהצוות יהיה מוכן לקבל אותך.
          </p>
        </div>

        <div className="bg-white border border-border rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 176 176">
                <circle cx="88" cy="88" r={RING_RADIUS} stroke="#E2E8F0" strokeWidth="8" fill="none" />
                <circle
                  cx="88"
                  cy="88"
                  r={RING_RADIUS}
                  stroke="#0D9488"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-[stroke-dashoffset] duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[13px] text-text-muted mb-0.5">סטטוס</p>
                <p className="font-bold text-lg text-teal-hover">{stage.label}</p>
              </div>
            </div>

            <div className="flex-1 text-right space-y-3">
              {data.estimated_wait_minutes !== null && (
                <div>
                  <p className="text-xs text-[#64748B]">זמן המתנה משוער</p>
                  <p className="font-bold text-2xl leading-tight text-text">כ-{data.estimated_wait_minutes} דקות</p>
                </div>
              )}
              {estimatedCallTime && (
                <div className="border-t border-[#F1F5F9] pt-3">
                  <p className="text-xs text-[#64748B]">שעת קריאה משוערת</p>
                  <p className="font-semibold text-xl leading-tight text-text">{estimatedCallTime}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {data.status === 'done' && (
          <div className="bg-white border border-border rounded-2xl p-5 text-center">
            <p className="text-lg font-semibold text-success">הביקור הסתיים — נתראה!</p>
          </div>
        )}

        {data.broadcast_message && (
          <div className="bg-[#fff3cd] border border-[#ffc107] rounded-2xl px-5 py-4 text-base text-right">
            <strong>עדכון מהצוות: </strong>
            {data.broadcast_message}
          </div>
        )}

        {data.status !== 'done' && (
          <div className="bg-warning-bg border border-warning rounded-2xl px-5 py-4 text-[15px] text-[#92400e] text-right">
            שים לב: זמן ההמתנה הוא הערכה בלבד ועשוי להשתנות בהתאם לעומס
          </div>
        )}

        <div className="mt-2">
          {!contactSent ? (
            <>
              {!showContactOptions ? (
                <button
                  type="button"
                  onClick={() => setShowContactOptions(true)}
                  className="block w-full min-h-14 px-3.5 bg-white border border-border rounded-2xl text-[17px] font-semibold text-[#1a202c] mb-2"
                >
                  צור קשר עם הצוות
                </button>
              ) : (
                <>
                  {(Object.entries(CONTACT_MESSAGES) as [keyof typeof CONTACT_MESSAGES, string][]).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleContact(type)}
                      className="block w-full min-h-14 px-3.5 bg-white border border-border rounded-2xl text-[17px] font-semibold text-[#1a202c] mb-2"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowContactOptions(false)}
                    className="block w-full min-h-14 px-3.5 bg-white border border-border rounded-2xl text-[17px] font-semibold text-[#888] mb-2"
                  >
                    ביטול
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="text-center text-success text-base">✓ ההודעה נשלחה לצוות</p>
          )}
        </div>
      </div>
    </div>
  );
}
