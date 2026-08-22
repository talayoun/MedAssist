import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNavigation, confirmStep, ApiError } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import type { NavigationRoute, NavigationStep } from '@medassist/shared-types';

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
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 15l-5-5-9 9" />
    </svg>
  );
}

function StepPhoto({ step }: { step: NavigationStep }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [step.step_id]);

  if (failed) {
    return (
      <div className="w-full aspect-[4/3] rounded-[14px] bg-[#f0fdfa] border border-dashed border-teal flex flex-col items-center justify-center gap-2.5 p-4 text-center">
        <PhotoIcon />
        <span className="text-[15px] font-semibold text-teal-hover leading-6">{step.instruction}</span>
      </div>
    );
  }
  return (
    <img
      src={step.image_url}
      alt={`שלב ${step.order} — ${step.instruction}`}
      className="w-full aspect-[4/3] object-cover rounded-[14px] block"
      onError={() => setFailed(true)}
    />
  );
}

function Dots({ total, current, filledUpTo }: { total: number; current: number; filledUpTo: number }) {
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
      {Array.from({ length: total }, (_, i) => i + 1).map((order) => (
        <div
          key={order}
          className="rounded-full h-2 bg-teal transition-all duration-300"
          style={{ width: order === current ? '32px' : '8px', opacity: order <= filledUpTo ? 1 : 0.3 }}
        />
      ))}
    </div>
  );
}

export default function Navigation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<NavigationRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Distinct from `error`, which replaces the whole page: a failed "I'm here" tap
  // must leave the step on screen so the patient can just tap again.
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [viewOrder, setViewOrder] = useState<number | null>(null);
  const [reviewStep, setReviewStep] = useState<number | null>(null);
  const [arrivedAtClinic, setArrivedAtClinic] = useState(false);
  const stepCache = useRef<Map<number, NavigationStep>>(new Map());

  const loadNavigation = useCallback(() => {
    if (!token) return;
    getNavigation(token)
      .then((res) => {
        setData(res);
        if (res.completed) {
          setReviewStep(res.total_steps);
        } else {
          res.steps.forEach((s) => stepCache.current.set(s.order, s));
          setViewOrder(res.current_step);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.message || 'שגיאה בטעינת הניווט.');
        else setError('שגיאה בטעינת הניווט.');
      });
  }, [token]);

  useEffect(() => { loadNavigation(); }, [loadNavigation]);

  const handleConfirm = useCallback(async () => {
    if (!token || !data || loading || data.completed) return;
    const currentStep = stepCache.current.get(data.current_step) ?? data.steps.find((s) => s.is_current);
    if (!currentStep) return;
    setLoading(true);
    setConfirmError(null);
    try {
      const result = await confirmStep(token, currentStep.step_id);
      if (result.phase === 'waiting') {
        navigate(`/visit/${token}/waiting`, { replace: true });
        return;
      }
      if (result.next_step) stepCache.current.set(result.next_step.order, result.next_step);
      loadNavigation();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        // Unchanged: a rejected request (expired link, no longer this patient's
        // step) is not something retrying the tap fixes, so it still takes over
        // the page rather than sitting quietly under the button.
        setError(err.message);
      } else {
        // A dropped connection is not an ApiError, so it used to land here and do
        // nothing at all: the spinner stopped and the patient got no sign the tap
        // failed. Shown inline so the step stays on screen to retry from.
        setConfirmError('לא הצלחנו לעדכן שהגעת. בדוק את החיבור ונסה שוב.');
      }
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
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <p className="text-[#c00] text-base p-6">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-[#555]">טוען הוראות ניווט...</p>
      </div>
    );
  }

  // ─── Clinic-arrival phase: how to get to the hospital, before indoor steps ────
  if (data.arrival && !arrivedAtClinic && !data.completed) {
    const { address, parking_info, transit_info, map_lat, map_lng } = data.arrival;
    const hasCoords = map_lat != null && map_lng != null;
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <div className="max-w-[480px] w-full mx-auto px-4 py-6 flex-1">
          <div className="text-right mb-5">
            <h1 className="text-[28px] font-bold text-text mb-2">בדרך לבית החולים</h1>
            <p className="text-base text-text-muted">כל מה שצריך לדעת לפני שמגיעים</p>
          </div>

          <div className="bg-white border-2 border-teal rounded-2xl p-5 mb-4 space-y-4 text-right">
            {address && (
              <div>
                <p className="text-sm font-semibold text-teal mb-1">כתובת</p>
                <p className="text-base text-text">{address}</p>
              </div>
            )}
            {parking_info && (
              <div>
                <p className="text-sm font-semibold text-teal mb-1">חניה</p>
                <p className="text-base text-text">{parking_info}</p>
              </div>
            )}
            {transit_info && (
              <div>
                <p className="text-sm font-semibold text-teal mb-1">תחבורה ציבורית</p>
                <p className="text-base text-text">{transit_info}</p>
              </div>
            )}
          </div>

          {hasCoords && (
            <div className="flex flex-col gap-3 mb-5">
              <button
                type="button"
                onClick={() => window.open(`https://www.waze.com/ul?ll=${map_lat}%2C${map_lng}&navigate=yes`, '_blank')}
                className="w-full min-h-14 flex items-center justify-center gap-2.5 bg-teal text-white rounded-[14px] text-[17px] font-bold"
              >
                <PinIcon color="#fff" />
                <span>פתיחה ב-Waze</span>
              </button>
              <button
                type="button"
                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${map_lat},${map_lng}`, '_blank')}
                className="w-full min-h-14 flex items-center justify-center gap-2.5 bg-white border border-border rounded-[14px] text-[17px] font-bold text-[#1a202c]"
              >
                <PinIcon color="#1a202c" />
                <span>פתיחה ב-Google Maps</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setArrivedAtClinic(true)}
            className="w-full min-h-16 flex items-center justify-center gap-3 bg-teal text-white rounded-2xl text-xl font-bold shadow-[0_2px_6px_rgba(13,148,136,0.35)]"
          >
            <CheckIcon />
            <span>הגעתי למרפאה</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── Already arrived: read-only review of the full route ─────────────────────
  if (data.completed) {
    const step = reviewStep ?? data.total_steps;
    const displayStep = data.steps.find((s) => s.order === step) ?? data.steps[data.steps.length - 1];

    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <div className="max-w-[480px] w-full mx-auto px-4 py-6 flex-1">
          <div className="bg-[#d1fae5] text-[#065f46] rounded-[10px] px-4 py-2.5 text-base font-bold text-center mb-4">
            ✓ הגעת ליעד
          </div>

          <div className="text-right mb-5">
            <h1 className="text-[28px] font-bold text-text mb-2">ניווט בבית החולים</h1>
            <p className="text-base text-text-muted">שלב {step} מתוך {data.total_steps}</p>
          </div>

          <div className="bg-white border-2 border-teal rounded-2xl p-5 mb-5">
            <p className="text-xl font-semibold text-[#1a202c] text-right mb-4 leading-normal">{displayStep.instruction}</p>
            <StepPhoto step={displayStep} />
          </div>

          <Dots total={data.total_steps} current={step} filledUpTo={step} />

          {step < data.total_steps && (
            <button
              type="button"
              onClick={() => setReviewStep((s) => (s ?? data.total_steps) + 1)}
              className="w-full min-h-16 flex items-center justify-center gap-3 bg-teal text-white rounded-2xl text-xl font-bold mb-3 shadow-[0_2px_6px_rgba(13,148,136,0.35)]"
            >
              <span>שלב הבא</span>
            </button>
          )}
          {step > 1 && (
            <button
              type="button"
              onClick={() => setReviewStep((s) => (s ?? 1) - 1)}
              className="w-full min-h-14 flex items-center justify-center gap-2 bg-white border border-border rounded-2xl text-[17px] font-bold text-[#1a202c] mb-5"
            >
              <span>שלב קודם</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(`/visit/${token}/waiting`)}
            className="w-full min-h-14 flex items-center justify-center gap-2 bg-white border-[1.5px] border-teal rounded-2xl text-[17px] font-bold text-teal mb-3"
          >
            <span>חזרה להמתנה</span>
          </button>
        </div>
      </div>
    );
  }

  if (data.steps.length === 0 || viewOrder === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-[#555]">טוען הוראות ניווט...</p>
      </div>
    );
  }

  const displayedStep = stepCache.current.get(viewOrder) ?? data.steps.find((s) => s.is_current) ?? data.steps[0];
  const isPeekingPast = viewOrder < data.current_step;
  const canGoOlder = stepCache.current.has(viewOrder - 1);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <AppHeader />
      <div className="max-w-[480px] w-full mx-auto px-4 py-6 flex-1">
        <div className="text-right mb-5">
          <h1 className="text-[28px] font-bold text-text mb-2">ניווט בבית החולים</h1>
          <p className="text-base text-text-muted">שלב {viewOrder} מתוך {data.total_steps}</p>
        </div>

        {isPeekingPast && (
          <div className="bg-[#f0fdfa] border border-teal rounded-[10px] px-3 py-2 text-sm text-teal-hover text-center mb-3">
            צופה בשלב קודם — ההתקדמות שלך נשמרה בשלב {data.current_step}
          </div>
        )}

        <div className="bg-white border-2 border-teal rounded-2xl p-5 mb-5">
          <p className="text-xl font-semibold text-[#1a202c] text-right mb-4 leading-normal">{displayedStep.instruction}</p>
          <StepPhoto step={displayedStep} />
        </div>

        <Dots total={data.total_steps} current={viewOrder} filledUpTo={data.current_step} />

        {isPeekingPast ? (
          <button
            type="button"
            onClick={() => setViewOrder(data.current_step)}
            className="w-full min-h-16 flex items-center justify-center gap-3 bg-teal text-white rounded-2xl text-xl font-bold mb-3 shadow-[0_2px_6px_rgba(13,148,136,0.35)]"
          >
            <span>חזרה לשלב הנוכחי</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="w-full min-h-16 flex items-center justify-center gap-3 bg-teal text-white rounded-2xl text-xl font-bold mb-3 shadow-[0_2px_6px_rgba(13,148,136,0.35)]"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            <CheckIcon />
            <span>{loading ? 'מעבד...' : 'אני כאן'}</span>
          </button>
        )}

        {confirmError && (
          <p role="alert" className="text-error text-base mb-3 text-right">
            {confirmError}
          </p>
        )}

        {canGoOlder && (
          <button
            type="button"
            onClick={() => setViewOrder((v) => (v ?? 1) - 1)}
            disabled={loading}
            className="w-full min-h-14 flex items-center justify-center gap-2 bg-white border border-border rounded-2xl text-[17px] font-bold text-[#1a202c] mb-5"
          >
            <span>שלב קודם</span>
          </button>
        )}

        {!data.arrival && data.parking_coordinates && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleWaze}
              className="w-full min-h-14 flex items-center justify-center gap-2.5 bg-teal text-white rounded-[14px] text-[17px] font-bold"
            >
              <PinIcon color="#fff" />
              <span>פתיחה ב-Waze</span>
            </button>
            <button
              type="button"
              onClick={handleGoogleMaps}
              className="w-full min-h-14 flex items-center justify-center gap-2.5 bg-white border border-border rounded-[14px] text-[17px] font-bold text-[#1a202c]"
            >
              <PinIcon color="#1a202c" />
              <span>פתיחה ב-Google Maps</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
