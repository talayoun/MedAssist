import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getQueue, getDepartments, updatePatientStatus, setWaitEstimate,
  sendBroadcast, resetArrivalToNow, resendInvite, logout, ApiError,
} from '../../services/api';
import { useAuth } from '../../main';
import NewAppointment from '../NewAppointment';
import type {
  QueueResponse, QueuePatient, AppointmentPhase, Department,
} from '@medassist/shared-types';

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

const PHASE_LABELS: Record<AppointmentPhase, string> = {
  link_sent: 'קישור נשלח',
  checklist: 'צ׳קליסט',
  navigation: 'בדרך למחלקה',
  waiting: 'ממתין במחלקה',
  done: 'סיים',
  expired: 'פג תוקף',
};

const PHASE_COLORS: Record<AppointmentPhase, string> = {
  link_sent: '#94a3b8',
  checklist: '#8b5cf6',
  navigation: '#0ea5e9',
  waiting: '#f59e0b',
  done: '#10b981',
  expired: '#6b7280',
};

const PHASE_OPTIONS: AppointmentPhase[] = [
  'link_sent', 'checklist', 'navigation', 'waiting', 'done', 'expired',
];

export default function Queue() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const [queue, setQueue] = useState<Queue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);
  const [estimateInput, setEstimateInput] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [filterDept, setFilterDept] = useState<string>('');
  const [filterPhase, setFilterPhase] = useState<AppointmentPhase | ''>('');
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [createResult, setCreateResult] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const data = await getQueue({
        departmentId: filterDept || null,
        phase: filterPhase || null,
      });
      setQueue(data);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setLoadError('שגיאה בטעינת התור');
      }
    }
  }, [filterDept, filterPhase]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  useEffect(() => {
    getDepartments()
      .then(({ departments: rows }) => setDepartments(rows))
      .catch(() => { /* non-fatal */ });
  }, []);

  async function handleStatusChange(appointmentId: string, status: Exclude<Patient['queue_status'], null>) {
    setUpdatingId(appointmentId);
    try {
      await updatePatientStatus(appointmentId, status);
      await fetchQueue();
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleResetArrival(appointmentId: string) {
    setUpdatingId(appointmentId);
    try {
      await resetArrivalToNow(appointmentId);
      await fetchQueue();
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleResendInvite(appointmentId: string) {
    setUpdatingId(appointmentId);
    try {
      await resendInvite(appointmentId);
      await fetchQueue();
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSetEstimate(e: React.FormEvent) {
    e.preventDefault();
    const mins = parseInt(estimateInput, 10);
    if (!mins || mins < 1) return;
    await setWaitEstimate(mins, isAdmin ? (filterDept || null) : null);
    setEstimateInput('');
    await fetchQueue();
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    const result = await sendBroadcast(broadcastText.trim(), isAdmin ? (filterDept || null) : null);
    setBroadcastResult(`נשלח ל-${result.recipient_count} מטופלים`);
    setBroadcastText('');
    setTimeout(() => setBroadcastResult(null), 4000);
  }

  async function handleLogout() {
    await logout().catch(() => {});
    setUser(null);
    navigate('/login', { replace: true });
  }

  const adminBroadcastDisabled = isAdmin && !filterDept;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>MedAssist, לוח בקרה</h1>
          {queue && <span style={styles.deptBadge}>{queue.department_label}</span>}
        </div>
        <div style={styles.headerRight}>
          <button
            onClick={() => setShowNewAppointment(true)}
            style={styles.newAppointmentBtn}
          >
            + מטופל חדש
          </button>
          <span style={styles.userName}>{user?.name}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>יציאה</button>
        </div>
      </header>

      <div style={styles.body}>
        {createResult && <p style={styles.successBanner}>{createResult}</p>}
        <div style={styles.filtersRow}>
          {isAdmin && (
            <label style={styles.filterLabel}>
              מחלקה:
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                style={styles.filterSelect}
              >
                <option value="">כל המחלקות</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          )}
          <label style={styles.filterLabel}>
            שלב:
            <select
              value={filterPhase}
              onChange={(e) => setFilterPhase(e.target.value as AppointmentPhase | '')}
              style={styles.filterSelect}
            >
              <option value="">כל השלבים</option>
              {PHASE_OPTIONS.map((p) => (
                <option key={p} value={p}>{PHASE_LABELS[p]}</option>
              ))}
            </select>
          </label>
        </div>

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
              <button type="submit" style={styles.primaryBtn} disabled={adminBroadcastDisabled}>שלח</button>
            </div>
            {adminBroadcastDisabled && (
              <p style={styles.hintMsg}>בחר מחלקה כדי לשדר</p>
            )}
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
              <button type="submit" style={styles.primaryBtn} disabled={adminBroadcastDisabled}>עדכן</button>
            </div>
            {adminBroadcastDisabled && (
              <p style={styles.hintMsg}>בחר מחלקה כדי לעדכן</p>
            )}
          </form>
        </div>

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
                onResetArrival={handleResetArrival}
                onResendInvite={handleResendInvite}
                showDepartment={isAdmin && !filterDept}
              />
            ))}
          </div>
        )}
      </div>

      {showNewAppointment && (
        <NewAppointment
          departments={departments}
          defaultDepartmentId={isAdmin ? (filterDept || null) : (user?.department_id ?? null)}
          isAdmin={isAdmin}
          onClose={() => setShowNewAppointment(false)}
          onCreated={(result) => {
            setShowNewAppointment(false);
            setCreateResult(
              result.sms_status === 'queued_now'
                ? 'המטופל נוצר ו-SMS נשלח'
                : 'המטופל נוצר, SMS מתוזמן לפי הזמנון'
            );
            setTimeout(() => setCreateResult(null), 6000);
            fetchQueue();
          }}
        />
      )}
    </div>
  );
}

function PatientCard({
  patient,
  updating,
  onStatusChange,
  onResetArrival,
  onResendInvite,
  showDepartment,
}: {
  patient: Patient;
  updating: boolean;
  onStatusChange: (id: string, status: Exclude<Patient['queue_status'], null>) => void;
  onResetArrival: (id: string) => void;
  onResendInvite: (id: string) => void;
  showDepartment: boolean;
}) {
  const navigate = useNavigate();
  const statusColor = patient.queue_status ? STATUS_COLORS[patient.queue_status] : '#9ca3af';
  const phaseColor = PHASE_COLORS[patient.current_phase] ?? '#9ca3af';

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <span style={styles.patientName}>{patient.patient_name}</span>
          <span style={{ ...styles.phaseBadge, background: phaseColor }}>
            {PHASE_LABELS[patient.current_phase]}
          </span>
          {patient.queue_status && (
            <span style={{ ...styles.statusBadge, background: statusColor }}>
              {STATUS_LABELS[patient.queue_status] ?? patient.queue_status}
            </span>
          )}
          {patient.track === 'er' && (
            <span style={styles.erBadge}>מיון</span>
          )}
        </div>
        <div style={styles.cardMeta}>
          {showDepartment && (
            <span style={styles.metaItem}>מחלקה: {patient.department}</span>
          )}
          {patient.minutes_waiting != null && (
            <span style={styles.metaItem}>המתין: {patient.minutes_waiting} דק׳</span>
          )}
          {patient.estimated_wait_minutes != null && (
            <span style={styles.metaItem}>משוער: {patient.estimated_wait_minutes} דק׳</span>
          )}
          <span style={styles.metaItem}>
            טפסים: {patient.forms_submitted}/{patient.forms_total}
          </span>
        </div>
      </div>

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

      <div style={styles.cardActions}>
        {patient.queue_status ? (
          <select
            value={patient.queue_status}
            disabled={updating}
            onChange={(e) =>
              onStatusChange(
                patient.appointment_id,
                e.target.value as Exclude<Patient['queue_status'], null>
              )
            }
            style={styles.statusSelect}
          >
            <option value="waiting">ממתין</option>
            <option value="in_treatment">בטיפול</option>
            <option value="done">סיים</option>
          </select>
        ) : (
          <span style={styles.mutedNote}>לא בתור המתנה עדיין</span>
        )}
        {patient.current_phase === 'waiting' && (
          <button
            onClick={() => onResetArrival(patient.appointment_id)}
            disabled={updating}
            style={styles.resetBtn}
          >
            עדכן ל-עכשיו
          </button>
        )}
        {patient.current_phase === 'expired' && (
          <button
            onClick={() => onResendInvite(patient.appointment_id)}
            disabled={updating}
            style={styles.resendBtn}
          >
            שלח מחדש קישור
          </button>
        )}
        <button
          onClick={() => navigate(`/patients/${patient.appointment_id}`)}
          style={styles.detailBtn}
        >
          פרטים ←
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
  newAppointmentBtn: {
    background: '#fff',
    color: '#1a56db',
    border: 'none',
    borderRadius: 7,
    padding: '7px 14px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
  successBanner: {
    background: '#d1fae5',
    border: '1px solid #6ee7b7',
    color: '#065f46',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 16,
  },
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
  filtersRow: {
    display: 'flex',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  filterLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    color: '#374151',
  },
  filterSelect: {
    padding: '7px 12px',
    borderRadius: 7,
    border: '1.5px solid #d1d5db',
    fontSize: 14,
    cursor: 'pointer',
    background: '#fff',
  },
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
  hintMsg: { margin: '8px 0 0', color: '#b45309', fontSize: 12 },
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
  phaseBadge: {
    display: 'inline-block',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    verticalAlign: 'middle',
    marginLeft: 6,
  },
  statusBadge: {
    display: 'inline-block',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    verticalAlign: 'middle',
    marginLeft: 6,
  },
  erBadge: {
    display: 'inline-block',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
    background: '#dc2626',
    verticalAlign: 'middle',
    marginLeft: 6,
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
  cardActions: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  statusSelect: {
    padding: '7px 12px',
    borderRadius: 7,
    border: '1.5px solid #d1d5db',
    fontSize: 14,
    cursor: 'pointer',
  },
  mutedNote: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
  resetBtn: {
    padding: '7px 14px',
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 14,
    color: '#92400e',
    fontWeight: 600,
  },
  resendBtn: {
    padding: '7px 14px',
    background: '#dcfce7',
    border: '1px solid #86efac',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 14,
    color: '#166534',
    fontWeight: 600,
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
