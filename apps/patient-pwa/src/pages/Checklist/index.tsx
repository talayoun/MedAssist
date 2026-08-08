import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getChecklist, saveChecklistProgress, ApiError } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import { Card } from '../../components/ui/Card';
import { CheckboxRow } from '../../components/ui/CheckboxRow';
import { StatusPill } from '../../components/ui/StatusPill';
import type { ChecklistResponse, ChecklistItem } from '@medassist/shared-types';

// Figma groups checklist items into 3 headings, in this fixed order — 'fast' and
// 'medication' share a heading even though they're separate categories server-side.
const GROUP_ORDER: { key: string; label: string; categories: ChecklistItem['category'][] }[] = [
  { key: 'bring', label: 'מה להביא', categories: ['bring'] },
  { key: 'fast_medication', label: 'צום ותרופות', categories: ['fast', 'medication'] },
  { key: 'other', label: 'הוראות מיוחדות', categories: ['other'] },
];

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function Checklist() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getChecklist(token)
      .then((res) => {
        setData(res);
        setCompletedIds(new Set(res.items.filter((i) => i.completed).map((i) => i.id)));
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError(err.message);
        else setError('שגיאה בטעינת הרשימה.');
      });
  }, [token]);

  const toggleItem = useCallback(
    (item: ChecklistItem) => {
      if (!token || !data) return;
      const next = new Set(completedIds);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      setCompletedIds(next);
      saveChecklistProgress(token, Array.from(next)).catch(() => {
        setCompletedIds(completedIds);
      });
    },
    [token, data, completedIds]
  );

  const goToForms = useCallback(() => {
    if (token) navigate(`/visit/${token}/forms`);
  }, [token, navigate]);

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
        <p className="text-[#555]">טוען רשימת הכנות...</p>
      </div>
    );
  }

  const totalCount = data.items.length;
  const completedCount = data.items.filter((i) => completedIds.has(i.id)).length;
  const allComplete = totalCount > 0 && completedCount === totalCount;
  const isUrgentWindow = data.hours_until_visit !== null && data.hours_until_visit < 24;

  // No checklist items — typically the ER track, which has no pre-visit preparation.
  if (totalCount === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <div className="w-24 h-24 bg-[#F0FDFA] rounded-full flex items-center justify-center mb-6">
            <CheckIcon />
          </div>
          <Card className="text-center">
            <h2 className="text-[28px] font-bold text-text mb-3">אין הכנות מוקדמות</h2>
            <p className="text-[18px] text-text-muted">נחזור אליך כשהמיון יזמין אותך לחדר הטיפול</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <AppHeader />
      <div className="sticky top-0 z-10 bg-bg px-4 pt-4 pb-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-semibold text-text">התקדמות</span>
            <StatusPill status={allComplete ? 'completed' : 'info'}>
              {completedCount} מתוך {totalCount} הושלמו
            </StatusPill>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-teal rounded-full transition-[width] duration-300"
              style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </Card>
      </div>

      <div className="max-w-[480px] w-full mx-auto px-4 pb-8">
        <div className="text-right mb-6">
          <h1 className="text-[28px] font-bold text-text mb-2">מה להביא ולהכין</h1>
          <p className="text-base text-text-muted">
            {isUrgentWindow ? '⚠️ הביקור שלך בעוד פחות מ-24 שעות — בדוק פריטים דחופים' : `לקראת: ${data.procedure_type}`}
          </p>
        </div>

        {allComplete && (
          <Card variant="success" className="text-center mb-6">
            <div className="text-2xl font-bold text-success mb-2">הושלם!</div>
            <div className="text-[17px] text-text-muted">סיימת את כל ההכנות. נתראה ביום הביקור</div>
          </Card>
        )}

        {GROUP_ORDER.map(({ key, label, categories }) => {
          const items = data.items.filter((i) => categories.includes(i.category));
          if (items.length === 0) return null;
          return (
            <div key={key} className="mb-6">
              <h2 className="text-[22px] font-semibold text-text mb-4 text-right">{label}</h2>
              <div className="space-y-4">
                {items.map((item) => {
                  const isCompleted = completedIds.has(item.id);
                  const isUrgent = item.time_sensitive && !isCompleted;
                  return (
                    <Card key={item.id} variant={isUrgent ? 'warning' : 'default'}>
                      {item.link_target === 'forms' ? (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <CheckboxRow
                              label={isUrgent ? `דחוף: ${item.text}` : item.text}
                              description={item.description}
                              checked={isCompleted}
                              onChange={() => toggleItem(item)}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={goToForms}
                            className="flex-shrink-0 flex flex-col items-center justify-center gap-1 w-10 h-14 rounded-xl hover:bg-[#F0FDFA] active:bg-[#CCFBF1] text-teal transition-colors duration-150"
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="15 18 9 12 15 6" />
                            </svg>
                            <span className="text-[10px] font-semibold leading-none">פתח</span>
                          </button>
                        </div>
                      ) : (
                        <CheckboxRow
                          label={isUrgent ? `דחוף: ${item.text}` : item.text}
                          description={item.description}
                          checked={isCompleted}
                          onChange={() => toggleItem(item)}
                        />
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={goToForms}
          className="w-full h-[64px] rounded-2xl font-bold text-[20px] transition-colors duration-150 flex items-center justify-center gap-3 shadow-md bg-teal hover:bg-teal-hover text-white"
        >
          <CheckIcon />
          <span>המשך להעלאת טפסים</span>
        </button>
      </div>
    </div>
  );
}
