import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getChecklist, saveChecklistProgress, getForms, uploadFormImage, ApiError } from '../../services/api';
import AppHeader from '../../components/AppHeader';
import type { ChecklistResponse, ChecklistItem, FormItemDTO } from '@medassist/shared-types';

const TEAL = '#0D9488';
const TEAL_HOVER = '#0F766E';

const CATEGORY_LABELS: Record<ChecklistItem['category'], string> = {
  bring: 'מה להביא',
  fast: 'צום',
  medication: 'תרופות',
  other: 'הוראות נוספות',
};

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f7fafc',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,
  content: { maxWidth: '480px', margin: '0 auto', width: '100%', padding: '16px 16px 32px' } as React.CSSProperties,
  progressCard: {
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
    padding: '16px 20px',
    marginBottom: '24px',
  } as React.CSSProperties,
  progressHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } as React.CSSProperties,
  progressTitle: { fontSize: '1.125rem', fontWeight: 600, color: '#0f172a' } as React.CSSProperties,
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 12px',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: 500,
  } as React.CSSProperties,
  progressTrack: { width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' } as React.CSSProperties,
  progressFill: { height: '100%', background: TEAL, borderRadius: '999px', transition: 'width 0.3s' } as React.CSSProperties,
  header: { textAlign: 'right', marginBottom: '24px' } as React.CSSProperties,
  h1: { fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' } as React.CSSProperties,
  subheader: { fontSize: '1rem', color: '#475569' } as React.CSSProperties,
  categoryTitle: { fontSize: '1.375rem', fontWeight: 600, color: '#0f172a', marginBottom: '16px', textAlign: 'right' } as React.CSSProperties,
  categoryGroup: { marginBottom: '24px' } as React.CSSProperties,
  itemCard: {
    background: '#fff',
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
  } as React.CSSProperties,
  itemCardWarning: {
    background: '#fffbeb',
    borderInlineStart: '4px solid #d97706',
    boxShadow: 'none',
  } as React.CSSProperties,
  itemRow: { display: 'flex', alignItems: 'center', gap: '16px' } as React.CSSProperties,
  itemText: { flex: 1, fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', textAlign: 'right' } as React.CSSProperties,
  itemTextCompleted: { textDecoration: 'line-through', color: '#94a3b8' } as React.CSSProperties,
  checkbox: {
    flexShrink: 0,
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: '2px solid #e2e8f0',
    background: '#fff',
  } as React.CSSProperties,
  checkboxChecked: { background: TEAL, borderColor: TEAL } as React.CSSProperties,
  urgentBadge: {
    fontSize: '0.75rem',
    fontWeight: 700,
    background: '#fef2f2',
    color: '#dc2626',
    padding: '3px 10px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
    marginInlineEnd: '8px',
  } as React.CSSProperties,
  completionBanner: {
    background: '#f0fdf4',
    borderInlineStart: '4px solid #16a34a',
    borderRadius: '16px',
    padding: '24px',
    textAlign: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  completionTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#16a34a', marginBottom: '8px' } as React.CSSProperties,
  completionBody: { fontSize: '1.0625rem', color: '#475569' } as React.CSSProperties,
  continueButton: {
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
    boxShadow: '0 2px 6px rgba(13,148,136,0.35)',
  } as React.CSSProperties,
  docsSection: { marginTop: '8px' } as React.CSSProperties,
  docsTitle: { fontSize: '1.375rem', fontWeight: 600, color: '#0f172a', marginBottom: '16px', textAlign: 'right' } as React.CSSProperties,
  docItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    background: '#fff',
    borderRadius: '16px',
    padding: '16px 20px',
    marginBottom: '12px',
    boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
  } as React.CSSProperties,
  docItemDone: {
    background: '#f0fdf4',
    borderInlineStart: '4px solid #16a34a',
    boxShadow: 'none',
  } as React.CSSProperties,
  docLabel: { fontSize: '1.0625rem', fontWeight: 600, color: '#0f172a', flex: 1, textAlign: 'right' } as React.CSSProperties,
  docStatus: { fontSize: '0.8125rem', whiteSpace: 'nowrap' } as React.CSSProperties,
  docActionBtn: {
    minWidth: '44px',
    minHeight: '44px',
    padding: '0 16px',
    background: TEAL,
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  docErrorText: { fontSize: '0.75rem', color: '#dc2626' } as React.CSSProperties,
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    <div style={{ ...styles.docItem, ...(isComplete ? styles.docItemDone : {}) }}>
      <span style={styles.docLabel}>{item.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {uploadError && <span style={styles.docErrorText}>{uploadError}</span>}
        <span style={{ ...styles.docStatus, color: isComplete ? '#16a34a' : '#718096' }}>{statusLabel}</span>
        {item.item_type === 'patient_upload' && !isComplete && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              data-testid="form-action-btn"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              style={{ ...styles.docActionBtn, opacity: uploading ? 0.6 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}
            >
              {uploading ? '...' : 'העלה'}
            </button>
          </>
        )}
        {item.item_type === 'staff_upload_sign' && item.status === 'staff_uploaded' && (
          <a href={`/visit/${token}/forms/${item.id}`} data-testid="form-action-btn" style={{ ...styles.docActionBtn, background: '#7c3aed' }}>
            חתום
          </a>
        )}
      </div>
    </div>
  );
}

function CheckIcon({ color = '#fff' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
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
      <div style={styles.page}>
        <AppHeader />
        <p style={{ color: '#c00', fontSize: '1rem', padding: '24px' }}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ ...styles.page, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>טוען רשימת הכנות...</p>
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
    <div style={styles.page}>
      <AppHeader />
      <div style={styles.content}>
        <div style={styles.progressCard}>
          <div style={styles.progressHeaderRow}>
            <span style={styles.progressTitle}>התקדמות</span>
            <span
              style={{
                ...styles.pill,
                background: allComplete ? '#f0fdf4' : '#f0fdfa',
                color: allComplete ? '#16a34a' : TEAL,
              }}
            >
              {completedCount} מתוך {totalCount} הושלמו
            </span>
          </div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }} />
          </div>
        </div>

        <div style={styles.header}>
          <h1 style={styles.h1}>מה להביא ולהכין</h1>
          <p style={styles.subheader}>
            {isUrgentWindow ? `⚠️ הביקור שלך בעוד פחות מ-24 שעות — בדוק פריטים דחופים` : `לקראת: ${data.procedure_type}`}
          </p>
        </div>

        {allComplete && (
          <div style={styles.completionBanner}>
            <div style={styles.completionTitle}>הושלם!</div>
            <div style={styles.completionBody}>סיימת את כל ההכנות. נתראה ביום הביקור</div>
          </div>
        )}

        {Object.entries(groupedItems).map(([category, items]) => (
          <div key={category} style={styles.categoryGroup}>
            <h2 style={styles.categoryTitle}>{CATEGORY_LABELS[category as ChecklistItem['category']]}</h2>
            {items.map((item) => {
              const isCompleted = completedIds.has(item.id);
              const isUrgent = item.time_sensitive && !isCompleted;
              return (
                <div
                  key={item.id}
                  style={{ ...styles.itemCard, ...(isUrgent ? styles.itemCardWarning : {}) }}
                  onClick={() => toggleItem(item)}
                  role="checkbox"
                  aria-checked={isCompleted}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && toggleItem(item)}
                >
                  <div style={styles.itemRow}>
                    <div style={{ ...styles.checkbox, ...(isCompleted ? styles.checkboxChecked : {}) }}>
                      {isCompleted && <CheckIcon />}
                    </div>
                    <span style={{ ...styles.itemText, ...(isCompleted ? styles.itemTextCompleted : {}) }}>
                      {isUrgent && <span style={styles.urgentBadge}>דחוף</span>}
                      {item.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {(formItems.length > 0 || formsLoadErr) && (
          <div style={styles.docsSection}>
            <h2 style={styles.docsTitle}>מסמכים</h2>
            {formsLoadErr && <p style={{ color: '#dc2626', fontSize: '0.9375rem', marginBottom: '12px' }}>{formsLoadErr}</p>}
            {formItems.map((item) => (
              <FormDocumentItem
                key={item.id}
                item={item}
                token={token!}
                onUpdate={(updated) =>
                  setFormItems((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
                }
              />
            ))}
          </div>
        )}

        {allComplete && (
          <button
            type="button"
            style={styles.continueButton}
            onClick={() => token && navigate(`/visit/${token}/navigation`)}
            onMouseEnter={(e) => (e.currentTarget.style.background = TEAL_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.background = TEAL)}
          >
            <CheckIcon />
            <span>המשך לניווט</span>
          </button>
        )}
      </div>
    </div>
  );
}
