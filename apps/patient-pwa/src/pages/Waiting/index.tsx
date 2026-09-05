import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getWaitingStatus } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import { useScrollTop } from '../../hooks/useScrollTop';
import { useVisitInfo } from '../../context/VisitPhaseContext';
import type { WaitingResponse } from '@medassist/shared-types';

const POLL_INTERVAL_MS = parseInt(import.meta.env.VITE_POLLING_INTERVAL_MS ?? '60000', 10);
const RING_RADIUS = 80;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type PhaseStep = { label: string; done: boolean; active: boolean };

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

function buildPhaseSteps(status: WaitingResponse['status']): PhaseStep[] {
  return [
    { label: 'רישום', done: true, active: false },
    { label: 'ניווט', done: true, active: false },
    { label: 'המתנה', done: status !== 'waiting', active: status === 'waiting' },
    { label: 'בדיקה', done: status === 'done', active: status === 'in_treatment' },
  ];
}

export default function Waiting() {
  const { token } = useParams<{ token: string }>();
  const { patientName, isOnline } = useVisitInfo();
  const [data, setData] = useState<WaitingResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The screen swaps on a poll, not on a route change: waiting, in treatment, done.
  useScrollTop(data?.status);

  const fetchStatus = useCallback(() => {
    if (!token) return;
    getWaitingStatus(token)
      .then((res) => {
        setData(res);
        setLoadError(null);
      })
      .catch(() => {
        // Only the first load has nothing to fall back on. Once data has arrived a
        // failed poll keeps the last known queue state on screen; the next poll
        // refreshes it. Either way the patient is no longer stuck on a spinner
        // with no idea anything went wrong.
        setLoadError('לא הצלחנו לטעון את מצב התור. בודקים שוב עוד רגע.');
      });
  }, [token]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        {loadError ? (
          <p role="alert" className="text-[#c00] text-base p-6 text-center">
            {loadError}
          </p>
        ) : (
          <p className="text-[#555]">טוען מצב תור...</p>
        )}
      </div>
    );
  }

  const firstName = patientName?.trim()?.split(' ')[0] ?? null;
  const steps = buildPhaseSteps(data.status);
  const hasPosition = data.queue_position !== null;
  const ringProgress = hasPosition ? Math.max(0.08, 1 - Math.min(data.queue_position! - 1, 9) / 10) : 1;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - ringProgress);
  const estimatedCallTime =
    data.estimated_wait_minutes !== null
      ? formatTime(new Date(Date.now() + data.estimated_wait_minutes * 60000))
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <AppHeader offlineMessage="אין חיבור לאינטרנט, זמן ההמתנה לא מעודכן" />
      <div className="max-w-[480px] w-full mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Reassurance card */}
        <div className="bg-gradient-to-br from-teal to-teal-hover rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-end gap-2 mb-4">
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">עדכון חי</span>
            <span className="relative w-3 h-3">
              <span className="absolute inset-0 rounded-full bg-[#4ADE80] animate-ping opacity-75" />
              <span className="relative block rounded-full w-3 h-3 bg-[#22C55E]" />
            </span>
          </div>
          <h2 className="text-[22px] font-bold text-white text-right mb-3">
            {firstName ? `${firstName}, ` : ''}המקום שלך בתור שמור ומעודכן
          </h2>
          <p className="text-[15px] leading-6 text-white/85 text-right">
            הצוות ב{data.department} יודע שהגעת ורואה אותך במערכת. נעדכן אותך כאן בנייד ברגע שיהיו מוכנים לקבל אותך.
          </p>
        </div>

        {/* Real-time / triage explanation card */}
        <div className="bg-[#EFF6FF] border-2 border-[#BFDBFE] rounded-2xl p-4">
          <div className="flex items-center justify-end gap-2 mb-2">
            <span className="text-sm font-bold text-[#1D4ED8]">חיבור בזמן אמת</span>
            <span className="relative w-2.5 h-2.5 shrink-0">
              <span className="absolute inset-0 rounded-full bg-[#3B82F6] animate-ping opacity-60" />
              <span className="relative block rounded-full w-2.5 h-2.5 bg-[#2563EB]" />
            </span>
          </div>
          <p className="text-[13px] leading-5 text-[#1E40AF] text-right">
            שים לב: סדר הכניסה נקבע לפי דחיפות רפואית. אם מטופל אחר נכנס לפניך, זה קורה רק בגלל צורך רפואי דחוף. המערכת עוקבת אחרי המיקום שלך כל הזמן כך שלא נשכח אותך.
          </p>
        </div>

        {/* Current-phase tracker */}
        <div className="bg-white border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider text-right mb-3">שלב נוכחי</p>
          <div className="flex items-center gap-0 flex-row-reverse">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center flex-row-reverse flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                      step.done
                        ? 'bg-teal text-white'
                        : step.active
                          ? 'bg-teal text-white ring-4 ring-[#CCFBF1]'
                          : 'bg-border text-[#94A3B8]'
                    }`}
                  >
                    {step.done ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`text-[10px] font-medium whitespace-nowrap ${step.active ? 'text-teal' : step.done ? 'text-text-muted' : 'text-[#94A3B8]'}`}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-4 mx-1 ${step.done ? 'bg-teal' : 'bg-border'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Queue position / wait time card */}
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
                {hasPosition ? (
                  <>
                    <p className="text-[10px] text-text-muted leading-none mb-0.5">מיקום</p>
                    <p className="font-bold text-[32px] leading-none text-teal-hover">{data.queue_position}</p>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-text-muted mb-0.5">סטטוס</p>
                    <p className="font-bold text-lg text-teal-hover">{data.status === 'in_treatment' ? 'בטיפול' : 'הושלם'}</p>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 text-right space-y-3">
              {hasPosition && data.people_ahead !== null && (
                <div>
                  <p className="text-xs text-[#64748B]">לפניך בתור</p>
                  <p className="font-bold text-2xl leading-tight text-text">{data.people_ahead}</p>
                </div>
              )}
              {data.estimated_wait_minutes !== null && (
                <div className="border-t border-[#F1F5F9] pt-3">
                  <p className="text-xs text-[#64748B]">זמן המתנה משוער</p>
                  <p className="font-semibold text-xl leading-tight text-text">כ-{data.estimated_wait_minutes} דקות</p>
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
            <p className="text-lg font-semibold text-success">הביקור הסתיים, נתראה!</p>
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

        {!isOnline && (
          <p className="text-sm text-text-muted text-center">המידע המוצג נשמר מהעדכון האחרון</p>
        )}
      </div>
    </div>
  );
}
