import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getChecklist, saveChecklistProgress, getForms, uploadFormImage, ApiError } from '../../services/api';
import type { ChecklistResponse, ChecklistItem, FormItemDTO } from '@medassist/shared-types';

const styles = {
  page: {
    minHeight: '100vh',
    padding: '24px 16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '480px',
    margin: '0 auto',
  } as React.CSSProperties,
  header: { fontSize: '1.375rem', fontWeight: 700, marginBottom: '8px' } as React.CSSProperties,
  subheader: { fontSize: '1rem', color: '#555', marginBottom: '24px' } as React.CSSProperties,
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '8px',
    marginBottom: '8px',
    background: '#f9f9f9',
    cursor: 'pointer',
    minHeight: '44px',
  } as React.CSSProperties,
  itemHighlight: {
    background: '#fff3cd',
    border: '1px solid #ffc107',
  } as React.CSSProperties,
  checkbox: { width: '24px', height: '24px', cursor: 'pointer', accentColor: '#1a73e8' },
  itemText: { fontSize: '1.0625rem', flex: 1 } as React.CSSProperties,
  itemTextCompleted: { textDecoration: 'line-through', color: '#999' } as React.CSSProperties,
  urgentBadge: {
    fontSize: '0.75rem',
    background: '#ffc107',
    padding: '2px 8px',
    borderRadius: '12px',
    color: '#333',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  continueButton: {
    display: 'block',
    width: '100%',
    minHeight: '52px',
    marginBottom: '24px',
    padding: '14px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#1a73e8',
    color: '#fff',
    fontSize: '1.125rem',
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  completionBanner: {
    background: '#d4edda',
    border: '1px solid #28a745',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center',
    fontSize: '1.125rem',
    color: '#155724',
    marginBottom: '16px',
  } as React.CSSProperties,
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: isComplete ? '#f0fdf4' : '#fff',
        border: `1px solid ${isComplete ? '#86efac' : '#e5e7eb'}`,
        borderRadius: '12px',
        minHeight: '44px',
        gap: '8px',
      }}
    >
      <span style={{ fontWeight: 600, flex: 1 }}>{item.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {uploadError && <span style={{ fontSize: '12px', color: '#c00' }}>{uploadError}</span>}
        <span style={{ fontSize: '13px', color: isComplete ? '#16a34a' : '#6b7280', whiteSpace: 'nowrap' }}>
          {statusLabel}
        </span>
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
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              style={{
                minWidth: '44px',
                minHeight: '44px',
                padding: '0 12px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? '...' : 'העלה'}
            </button>
          </>
        )}
        {item.item_type === 'staff_upload_sign' && item.status === 'staff_uploaded' && (
          <a
            href={`/visit/${token}/forms/${item.id}`}
            style={{
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              background: '#7c3aed',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '14px',
              textDecoration: 'none',
            }}
          >
            חתום
          </a>
        )}
      </div>
    </div>
  );
}

export default function Checklist() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [formItems, setFormItems] = useState<FormItemDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getForms(token)
      .then(({ items }) => setFormItems(items))
      .catch(() => {/* non-fatal */});
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
        // revert on failure
        setCompletedIds(completedIds);
      });
    },
    [token, data, completedIds]
  );

  if (error) {
    return (
      <div style={styles.page}>
        <p style={{ color: '#c00', fontSize: '1rem' }}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>טוען רשימת הכנות...</p>
      </div>
    );
  }

  const allComplete = data.items.every((i) => completedIds.has(i.id));

  return (
    <div style={styles.page}>
      <h1 style={styles.header}>הכנות לפני הביקור</h1>
      <p style={styles.subheader}>
        {data.hours_until_visit !== null && data.hours_until_visit < 24
          ? `⚠️ הביקור שלך בעוד פחות מ-24 שעות — בדוק פריטים דחופים`
          : `נא להשלים את כל הפריטים לפני הביקור`}
      </p>

      {allComplete && (
        <>
          <div style={styles.completionBanner}>✅ כל הפריטים הושלמו, אתה מוכן לביקור!</div>
          <button
            type="button"
            style={styles.continueButton}
            onClick={() => token && navigate(`/visit/${token}/navigation`)}
          >
            המשך לניווט
          </button>
        </>
      )}

      {data.items.map((item) => {
        const isCompleted = completedIds.has(item.id);
        const isUrgent = item.time_sensitive && !isCompleted;
        return (
          <div
            key={item.id}
            style={{ ...styles.item, ...(isUrgent ? styles.itemHighlight : {}) }}
            onClick={() => toggleItem(item)}
            role="checkbox"
            aria-checked={isCompleted}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && toggleItem(item)}
          >
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={isCompleted}
              onChange={() => toggleItem(item)}
              aria-label={item.text}
            />
            <span style={{ ...styles.itemText, ...(isCompleted ? styles.itemTextCompleted : {}) }}>
              {item.text}
            </span>
            {isUrgent && <span style={styles.urgentBadge}>דחוף</span>}
          </div>
        );
      })}

      {formItems.length > 0 && (
        <section style={{ marginTop: '24px' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '12px' }}>מסמכים</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {formItems.map((item) => (
              <li key={item.id} style={{ marginBottom: '12px' }}>
                <FormDocumentItem
                  item={item}
                  token={token!}
                  onUpdate={(updated) =>
                    setFormItems((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
