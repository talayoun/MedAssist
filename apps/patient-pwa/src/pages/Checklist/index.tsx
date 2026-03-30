import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getChecklist, saveChecklistProgress, ApiError } from '../../services/api';
import type { ChecklistResponse, ChecklistItem } from '@medassist/shared-types';

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

export default function Checklist() {
  const { token } = useParams<{ token: string }>();
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
        <div style={styles.completionBanner}>✅ כל הפריטים הושלמו — אתה מוכן לביקור!</div>
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
    </div>
  );
}
