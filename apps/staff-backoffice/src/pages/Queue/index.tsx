import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getQueue, updatePatientStatus, setWaitEstimate,
  sendBroadcast, logout, ApiError,
} from '../../services/api';
import { useAuth } from '../../main';
import type { QueueResponse, QueuePatient } from '@medassist/shared-types';

type Queue = QueueResponse;
type Patient = QueuePatient;

const STATUS_LABELS: Record<string, string> = {
  waiting: 'ממתין',
  in_treatment: 'בטיפול',
  done: 'סיים',
};

const STATUS_COLORS: Record<string, string> = {
  waiting: '#f59e0b',
  in_treatment: '#3b82f6',
  done: '#10b981',
};

export default function Queue() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);
  const [estimateInput, setEstimateInput] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const data = await getQueue();
      setQueue(data);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setLoadError('שגיאה בטעינת התור');
      }
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  async function handleStatusChange(appointmentId: string, status: Patient['status']) {
    setUpdatingId(appointmentId);
    try {
      await updatePatientStatus(appointmentId, status);
      await fetchQueue();
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSetEstimate(e: React.FormEvent) {
    e.preventDefault();
    const mins = parseInt(estimateInput, 10);
    if (!mins || mins < 1) return;
    await setWaitEstimate(mins);
    setEstimateInput('');
    await fetchQueue();
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    const result = await sendBroadcast(broadcastText.trim());
    setBroadcastResult(`נשלח ל-${result.recipient_count} מטופלים`);
    setBroadcastText('');
    setTimeout(() => setBroadcastResult(null), 4000);
  }

  async function handleLogout() {
    await logout().catch(() => {});
    setUser(null);
    navigate('/login', { replace: true });
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>MedAssist — לוח בקרה</h1>
          {queue && <span style={styles.deptBadge}>{queue.department}</span>}
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user?.name}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>יציאה</button>
        </div>
      </header>

      <div style={styles.body}>
        {/* Broadcast + Wait Estimate row */}
        <div style={styles.controlsRow}>
          <form onSubmit={handleBroadcast} style={styles.controlBox}>
            <h3 style={styles.controlTitle}>שידור הודעה לכל הממתינים</h3>
            <div style={styles.row}>
              <input
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                maxLength={280}
                placeholder="הזן הודעה לשידור..."
                style={styles.textInput}
              />
              <button type="submit" style={styles.primaryBtn}>שלח</button>
            </div>
            {broadcastResult && <p style={styles.successMsg}>{broadcastResult}</p>}
          </form>

          <form onSubmit={handleSetEstimate} style={styles.controlBox}>
            <h3 style={styles.controlTitle}>עדכון זמן המתנה משוער</h3>
            <div style={styles.row}>
              <input
                type="number"
                min={1}
                max={240}
                value={estimateInput}
                onChange={(e) => setEstimateInput(e.target.value)}
                placeholder="דקות"
                style={{ ...styles.textInput, maxWidth: 100 }}
              />
              <button type="submit" style={styles.primaryBtn}>עדכן</button>
            </div>
          </form>
        </div>

        {/* Queue list */}
        {loadError && <p style={styles.errorBanner}>{loadError}</p>}

        {!queue ? (
          <p style={styles.loading}>טוען תור...</p>
        ) : queue.patients.length === 0 ? (
          <p style={styles.emptyState}>אין מטופלים בתור כרגע</p>
        ) : (
          <div style={styles.patientList}>
            {queue.patients.map((patient) => (
              <PatientCard
                key={patient.appointment_id}
                patient={patient}
                updating={updatingId === patient.appointment_id}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PatientCard({
  patient,
  updating,
  onStatusChange,
}: {
  patient: Patient;
  updating: boolean;
  onStatusChange: (id: string, status: Patient['status']) => void;
}) {
  const navigate = useNavigate();
  const statusColor = STATUS_COLORS[patient.status] ?? '#9ca3af';

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <span style={styles.patientName}>{patient.patient_name}</span>
          <span style={{ ...styles.statusBadge, background: statusColor }}>
            {STATUS_LABELS[patient.status] ?? patient.status}
          </span>
        </div>
        <div style={styles.cardMeta}>
          <span style={styles.metaItem}>המתין: {patient.minutes_waiting} דק׳</span>
          {patient.estimated_wait_minutes && (
            <span style={styles.metaItem}>משוער: {patient.estimated_wait_minutes} דק׳</span>
          )}
          <span style={styles.metaItem}>
            טפסים: {patient.forms_submitted}/{patient.forms_total}
          </span>
        </div>
      </div>

      {/* Stations */}
      {patient.stations.length > 0 && (
        <div style={styles.stations}>
          {patient.stations.map((s) => (
            <span
              key={s.station_id}
              style={{
                ...styles.stationChip,
                background: s.status === 'complete' ? '#d1fae5' : '#e0e7ff',
                color: s.status === 'complete' ? '#065f46' : '#3730a3',
              }}
            >
              {s.order_index}. {s.department}
              {s.status === 'complete' && ' ✓'}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={styles.cardActions}>
        <select
          value={patient.status}
          disabled={updating}
          onChange={(e) =>
            onStatusChange(patient.appointment_id, e.target.value as Patient['status'])
          }
          style={styles.statusSelect}
        >
          <option value="waiting">ממתין</option>
          <option value="in_treatment">בטיפול</option>
          <option value="done">סיים</option>
        </select>
        <button
          onClick={() => navigate(`/patients/${patient.appointment_id}`)}
          style={styles.detailBtn}
        >
          פרטים →
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    fontFamily: 'system-ui, sans-serif',
    direction: 'rtl',
  },
  header: {
    background: '#1a56db',
    color: '#fff',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { margin: 0, fontSize: 20, fontWeight: 700 },
  deptBadge: {
    display: 'inline-block',
    marginTop: 4,
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: '2px 10px',
    fontSize: 13,
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userName: { fontSize: 14, opacity: 0.9 },
  logoutBtn: {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.4)',
    color: '#fff',
    borderRadius: 6,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
  },
  body: { padding: 24, maxWidth: 900, margin: '0 auto' },
  controlsRow: { display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  controlBox: {
    flex: 1,
    minWidth: 260,
    background: '#fff',
    borderRadius: 10,
    padding: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  controlTitle: { margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: '#374151' },
  row: { display: 'flex', gap: 8 },
  textInput: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 7,
    border: '1.5px solid #d1d5db',
    fontSize: 14,
    direction: 'rtl',
  },
  primaryBtn: {
    padding: '8px 16px',
    background: '#1a56db',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  successMsg: { margin: '8px 0 0', color: '#059669', fontSize: 13 },
  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#b91c1c',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 16,
  },
  loading: { textAlign: 'center', color: '#6b7280', padding: 40 },
  emptyState: { textAlign: 'center', color: '#9ca3af', padding: 60, fontSize: 16 },
  patientList: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: '#fff',
    borderRadius: 10,
    padding: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    border: '1px solid #e5e7eb',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  patientName: { fontWeight: 700, fontSize: 16, marginLeft: 10 },
  statusBadge: {
    display: 'inline-block',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    verticalAlign: 'middle',
  },
  cardMeta: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  metaItem: { fontSize: 13, color: '#6b7280' },
  stations: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  stationChip: {
    borderRadius: 20,
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 500,
  },
  cardActions: { display: 'flex', gap: 10, alignItems: 'center' },
  statusSelect: {
    padding: '7px 12px',
    borderRadius: 7,
    border: '1.5px solid #d1d5db',
    fontSize: 14,
    cursor: 'pointer',
  },
  detailBtn: {
    padding: '7px 14px',
    background: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 14,
    color: '#374151',
  },
};
