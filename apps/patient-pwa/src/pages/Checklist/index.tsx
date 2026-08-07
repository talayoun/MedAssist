import { useEffect, useState, useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getChecklist, saveChecklistProgress, getForms, uploadFormImage, ApiError } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import { Card } from '../../components/ui/Card';
import { CheckboxRow } from '../../components/ui/CheckboxRow';
import { StatusPill } from '../../components/ui/StatusPill';
import { Button } from '../../components/ui/Button';
import type { ChecklistResponse, ChecklistItem, FormItemDTO } from '@medassist/shared-types';

const CATEGORY_LABELS: Record<ChecklistItem['category'], string> = {
  bring: 'מה להביא',
  fast: 'צום',
  medication: 'תרופות',
  other: 'הוראות נוספות',
};

function FormDocumentItem({
  item,
  token,
  onUpdate,
}: {
  item: FormItemDTO;
  token: string;
  onUpdate: (updated: FormItemDTO) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const updated = await uploadFormImage(token, item.id, file);
      onUpdate(updated as unknown as FormItemDTO);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'שגיאה בהעלאה');
    } finally {
      setUploading(false);
    }
  };

  const statusLabel = {
    pending: 'ממתין',
    staff_uploaded: 'ממתין לחתימה',
    patient_submitted: 'הועלה',
  }[item.status];

  const isComplete = item.status === 'patient_submitted';

  return (
    <Card variant={isComplete ? 'success' : 'default'} className="flex items-center justify-between gap-3 !p-4">
      <span className="flex-1 text-[17px] font-semibold text-text text-right">{item.label}</span>
      <div className="flex items-center gap-2.5">
        {uploadError && <span className="text-xs text-error">{uploadError}</span>}
        <span className={`text-[13px] whitespace-nowrap ${isComplete ? 'text-success' : 'text-[#718096]'}`}>{statusLabel}</span>
        {item.item_type === 'patient_upload' && !isComplete && (
          <>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              data-testid="form-action-btn"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className={`min-w-11 min-h-11 px-4 bg-teal text-white rounded-[10px] text-[15px] font-bold flex items-center justify-center ${
                uploading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {uploading ? '...' : 'העלה'}
            </button>
          </>
        )}
        {item.item_type === 'staff_upload_sign' && item.status === 'staff_uploaded' && (
          <a
            href={`/visit/${token}/forms/${item.id}`}
            data-testid="form-action-btn"
            className="min-w-11 min-h-11 px-4 bg-[#7c3aed] text-white rounded-[10px] text-[15px] font-bold flex items-center justify-center no-underline"
          >
            חתום
          </a>
        )}
      </div>
    </Card>
  );
}

export default function Checklist() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [formItems, setFormItems] = useState<FormItemDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formsLoadErr, setFormsLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getForms(token)
      .then(({ items }) => setFormItems(items))
      .catch(() => setFormsLoadErr('שגיאה בטעינת מסמכים'));
  }, [token]);

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
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg">
        <p className="text-[#555]">טוען רשימת הכנות...</p>
      </div>
    );
  }

  const totalCount = data.items.length;
  const completedCount = data.items.filter((i) => completedIds.has(i.id)).length;
  const allComplete = totalCount > 0 && completedCount === totalCount;
  const isUrgentWindow = data.hours_until_visit !== null && data.hours_until_visit < 24;

  const groupedItems = data.items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <AppHeader />
      <div className="max-w-[480px] w-full mx-auto px-4 pt-4 pb-8">
        <Card className="mb-6">
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

        {Object.entries(groupedItems).map(([category, items]) => (
          <div key={category} className="mb-6">
            <h2 className="text-[22px] font-semibold text-text mb-4 text-right">
              {CATEGORY_LABELS[category as ChecklistItem['category']]}
            </h2>
            <div className="space-y-4">
              {items.map((item) => {
                const isCompleted = completedIds.has(item.id);
                const isUrgent = item.time_sensitive && !isCompleted;
                return (
                  <Card key={item.id} variant={isUrgent ? 'warning' : 'default'}>
                    <CheckboxRow
                      label={isUrgent ? `דחוף: ${item.text}` : item.text}
                      checked={isCompleted}
                      onChange={() => toggleItem(item)}
                    />
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {(formItems.length > 0 || formsLoadErr) && (
          <div className="mt-2">
            <h2 className="text-[22px] font-semibold text-text mb-4 text-right">מסמכים</h2>
            {formsLoadErr && <p className="text-error text-[15px] mb-3">{formsLoadErr}</p>}
            <div className="space-y-3">
              {formItems.map((item) => (
                <FormDocumentItem
                  key={item.id}
                  item={item}
                  token={token!}
                  onUpdate={(updated) => setFormItems((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))}
                />
              ))}
            </div>
          </div>
        )}

        {allComplete && (
          <Button
            onClick={() => token && navigate(`/visit/${token}/navigation`)}
            className="w-full flex items-center justify-center gap-3 mt-6 !rounded-2xl shadow-[0_2px_6px_rgba(13,148,136,0.35)]"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>המשך לניווט</span>
          </Button>
        )}
      </div>
    </div>
  );
}
