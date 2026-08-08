import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveVisit, ApiError } from '../../services/api';
import type { VisitContext } from '@medassist/shared-types';
import AppHeader from '../../components/AppHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

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
  const isOnline = useOnlineStatus();
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
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-[#555]">טוען...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader patientName={ctx.patient.name} isOnline={isOnline} />

      <main className="max-w-[480px] mx-auto px-4 py-8 flex flex-col gap-8">
        <Card className="!p-6 !rounded-3xl flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-text text-center mb-2">הביקור הקרוב שלך</h1>

          <div className="bg-bg rounded-2xl px-5 py-4 flex flex-col gap-2">
            <span className="text-base text-[#718096]">מחלקה</span>
            <span className="text-xl font-bold text-text">{ctx.patient.department}</span>
          </div>

          {ctx.patient.visit_date ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg rounded-2xl px-5 py-4 flex flex-col gap-2">
                  <span className="text-base text-[#718096]">תאריך</span>
                  <span className="text-xl font-bold text-text">{formatDate(ctx.patient.visit_date)}</span>
                </div>
                <div className="bg-bg rounded-2xl px-5 py-4 flex flex-col gap-2">
                  <span className="text-base text-[#718096]">שעה</span>
                  <span className="text-xl font-bold text-text">{formatTime(ctx.patient.visit_date)}</span>
                </div>
              </div>

              {isOnline && (
                <button
                  type="button"
                  onClick={handleCalendarExport}
                  className="flex items-center justify-center gap-3 w-full min-h-14 bg-white border border-border rounded-2xl text-base font-bold text-[#2d3748] hover:bg-bg transition-colors"
                >
                  <span>הוסף ליומן Google</span>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="#4285F4" strokeWidth="2" />
                    <path d="M16 2V6M8 2V6M3 10H21" stroke="#4285F4" strokeWidth="2" />
                  </svg>
                </button>
              )}
            </>
          ) : (
            <div className="bg-[#fff3cd] border border-[#ffc107] rounded-2xl px-5 py-4 text-[17px] text-[#7a5c00] text-center">
              ⚡ ביקור דחוף — אין צורך בתיאום מראש
            </div>
          )}
        </Card>

        <Button
          onClick={handleStart}
          disabled={!isOnline}
          className="!rounded-2xl shadow-[0_2px_6px_rgba(13,148,136,0.35)] w-full flex items-center justify-center gap-3"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{PHASE_CTA[ctx.phase]}</span>
        </Button>

        {!isOnline && (
          <p className="text-sm text-text-muted text-center -mt-4">תוכל להמשיך כשהחיבור יחזור</p>
        )}
      </main>
    </div>
  );
}
