import React, { useEffect, useState } from 'react';
import { getTrash, restoreAppointment, hardDeleteAppointment, ApiError } from '../../../services/api';
import type { TrashEntry } from '../../../services/api';
import { useRowSelection } from '../../../hooks/useRowSelection';
import { runBulkDelete, summaryMessage } from '../../../lib/bulkDelete';
import { BulkActionBar } from '../../../components/BulkActionBar';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function Trash() {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selection = useRowSelection(entries, (e) => e.appointment_id);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  async function load() {
    try {
      const { trash } = await getTrash();
      setEntries(trash);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError('שגיאה בטעינת פח האשפה');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRestore(id: string) {
    setActingId(id);
    try {
      await restoreAppointment(id);
      await load();
    } finally {
      setActingId(null);
    }
  }

  async function handleHardDelete(id: string) {
    setActingId(id);
    try {
      await hardDeleteAppointment(id);
      setConfirmDeleteId(null);
      selection.remove(id);
      await load();
    } finally {
      setActingId(null);
    }
  }

  async function handleBulkDelete() {
    const targets = entries
      .filter((e) => selection.isSelected(e.appointment_id))
      .map((e) => ({ id: e.appointment_id, label: e.patient_name }));

    setBulkBusy(true);
    const summary = await runBulkDelete(targets, hardDeleteAppointment);
    setBulkBusy(false);
    setBulkConfirmOpen(false);
    selection.clear();

    const failed = summary.results.filter((r) => r.outcome === 'failed');
    setError(
      failed.length
        ? `${summaryMessage(summary)}. נכשלו: ${failed.map((r) => r.label).join(', ')}`
        : null
    );
    await load();
  }

  return (
    <div style={s.page}>
      <div style={s.titleRow}>
        <h1 style={s.title}>פח אשפה</h1>
        <p style={s.subtitle}>
          מטופלים שנמחקו יוסרו אוטומטית לאחר 7 ימים
        </p>
      </div>

      {loading && <p style={s.muted}>טוען...</p>}
      {error && <p style={s.errorBanner}>{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p style={s.emptyState}>פח האשפה ריק</p>
      )}

      {entries.length > 0 && (
        <>
          <BulkActionBar
            count={selection.selectedCount}
            onDelete={() => setBulkConfirmOpen(true)}
            onClear={selection.clear}
          />
          <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>
                  <input
                    type="checkbox"
                    aria-label="בחר הכל"
                    checked={selection.headerState === 'all'}
                    ref={(el) => { if (el) el.indeterminate = selection.headerState === 'some'; }}
                    onChange={selection.toggleAllVisible}
                  />
                </th>
                <th style={s.th}>שם מטופל</th>
                <th style={s.th}>מחלקה</th>
                <th style={s.th}>סוג הליך</th>
                <th style={s.th}>תאריך מחיקה</th>
                <th style={{ ...s.th, textAlign: 'center' }}>ימים לפני מחיקה</th>
                <th style={{ ...s.th, textAlign: 'center' }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const days = e.days_until_purge;
                const urgency = days <= 1 ? '#fef2f2' : days <= 3 ? '#fffbeb' : '#fff';
                return (
                  <tr key={e.appointment_id} style={{ background: urgency }}>
                    <td style={s.td}>
                      <input
                        type="checkbox"
                        aria-label={`בחר ${e.patient_name}`}
                        checked={selection.isSelected(e.appointment_id)}
                        onChange={() => selection.toggle(e.appointment_id)}
                      />
                    </td>
                    <td style={s.td}>{e.patient_name}</td>
                    <td style={s.td}>{e.department_name}</td>
                    <td style={s.td}>{e.procedure_type}</td>
                    <td style={s.td}>{formatDate(e.deleted_at)}</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <span style={{
                        ...s.daysBadge,
                        background: days <= 1 ? '#fee2e2' : days <= 3 ? '#fef3c7' : '#f3f4f6',
                        color: days <= 1 ? '#b91c1c' : days <= 3 ? '#92400e' : '#374151',
                      }}>
                        {days} ימים
                      </span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <div style={s.actions}>
                        <button
                          onClick={() => handleRestore(e.appointment_id)}
                          disabled={actingId === e.appointment_id}
                          style={s.restoreBtn}
                        >
                          שחזר
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(e.appointment_id)}
                          disabled={actingId === e.appointment_id}
                          style={s.hardDeleteBtn}
                        >
                          מחק לצמיתות
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          title="מחיקה לצמיתות"
          body={`למחוק לצמיתות את ${entries.find((e) => e.appointment_id === confirmDeleteId)?.patient_name ?? ''}? לא ניתן לשחזר.`}
          confirmLabel="מחק לצמיתות"
          busy={actingId === confirmDeleteId}
          onConfirm={() => handleHardDelete(confirmDeleteId!)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {bulkConfirmOpen && (
        <ConfirmDialog
          title="מחיקה לצמיתות"
          body={`למחוק לצמיתות ${selection.selectedCount} מטופלים? לא ניתן לשחזר.`}
          confirmLabel="מחק לצמיתות"
          busy={bulkBusy}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkConfirmOpen(false)}
        />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 28px', maxWidth: 1000, margin: '0 auto' },
  titleRow: { marginBottom: 24 },
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' },
  subtitle: { margin: '6px 0 0', fontSize: 13, color: '#6b7280' },
  muted: { color: '#9ca3af', fontSize: 15, textAlign: 'center', padding: 60 },
  emptyState: { color: '#9ca3af', fontSize: 16, textAlign: 'center', padding: 60 },
  errorBanner: {
    background: '#fef2f2', border: '1px solid #fca5a5',
    color: '#b91c1c', borderRadius: 8, padding: '10px 14px',
  },
  tableWrap: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 6px rgba(27,58,107,0.08)',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    padding: '12px 16px',
    textAlign: 'right',
    fontWeight: 600,
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '14px 16px',
    borderBottom: '1px solid #f3f4f6',
    color: '#111827',
  },
  daysBadge: {
    display: 'inline-block',
    borderRadius: 20,
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 600,
  },
  actions: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  restoreBtn: {
    padding: '6px 14px',
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 13,
    color: '#166534',
    fontWeight: 600,
  },
  hardDeleteBtn: {
    padding: '6px 14px',
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 13,
    color: '#b91c1c',
    fontWeight: 600,
  },
};
