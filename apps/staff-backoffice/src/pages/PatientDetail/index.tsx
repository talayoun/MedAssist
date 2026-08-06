import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getQueue, getDepartments, addStation, markStationComplete,
  exportPatientPDF, issueCompanionLink, ApiError,
} from '../../services/api';
import type { QueuePatient, Department, AppointmentPhase } from '@medassist/shared-types';

const TEAL = '#0D9488';

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

export default function PatientDetail() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<QueuePatient | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [newStationDept, setNewStationDept] = useState('');
  const [addingStation, setAddingStation] = useState(false);
  const [stationBusyId, setStationBusyId] = useState<string | null>(null);

  const [pdfState, setPdfState] = useState<{ loading: boolean; url: string | null; error: string | null }>({
    loading: false, url: null, error: null,
  });

  const [companionPhone, setCompanionPhone] = useState('+972');
  const [companionState, setCompanionState] = useState<{ loading: boolean; message: string | null; error: string | null }>({
    loading: false, message: null, error: null,
  });

  const loadPatient = useCallback(async () => {
    if (!appointmentId) return;
    try {
      const queue = await getQueue();
      const found = queue.patients.find((p) => p.appointment_id === appointmentId);
      if (!found) {
        setNotFound(true);
        return;
      }
      setNotFound(false);
      setPatient(found);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setNotFound(true);
    }
  }, [appointmentId]);

  useEffect(() => { loadPatient(); }, [loadPatient]);
  useEffect(() => {
    getDepartments().then(({ departments: rows }) => setDepartments(rows)).catch(() => {});
  }, []);

  async function handleAddStation(e: React.FormEvent) {
    e.preventDefault();
    if (!appointmentId || !newStationDept || !patient) return;
    setAddingStation(true);
    try {
      await addStation(appointmentId, newStationDept, patient.stations.length + 1);
      setNewStationDept('');
      await loadPatient();
    } finally {
      setAddingStation(false);
    }
  }

  async function handleCompleteStation(stationId: string) {
    if (!appointmentId) return;
    setStationBusyId(stationId);
    try {
      await markStationComplete(appointmentId, stationId);
      await loadPatient();
    } finally {
      setStationBusyId(null);
    }
  }

  async function handleExportPdf() {
    if (!appointmentId) return;
    setPdfState({ loading: true, url: null, error: null });
    try {
      const result = await exportPatientPDF(appointmentId);
      if (result.pdf_url) {
        setPdfState({ loading: false, url: result.pdf_url, error: null });
        window.open(result.pdf_url, '_blank');
      } else {
        setPdfState({ loading: false, url: null, error: null });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message || 'שגיאה בייצוא PDF' : 'שגיאה בייצוא PDF';
      setPdfState({ loading: false, url: null, error: message });
    }
  }

  async function handleCompanionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appointmentId || !companionPhone) return;
    setCompanionState({ loading: true, message: null, error: null });
    try {
      const result = await issueCompanionLink(appointmentId, companionPhone);
      setCompanionState({
        loading: false,
        message: `הקישור נשלח (סטטוס SMS: ${result.sms_status})`,
        error: null,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message || 'שגיאה בשליחת קישור' : 'שגיאה בשליחת קישור';
      setCompanionState({ loading: false, message: null, error: message });
    }
  }

  if (notFound) {
    return (
      <div style={styles.body}>
        <button type="button" style={styles.backLink} onClick={() => navigate('/queue')}>← חזרה לתור</button>
        <div style={styles.emptyCard}>
          <p>לא נמצא מטופל פעיל בתור עבור מזהה זה.</p>
          <p style={styles.hint}>ייתכן שהמטופל כבר סיים את הביקור ואינו מופיע ברשימת ההמתנה הפעילה.</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return <div style={styles.body}><p style={styles.hint}>טוען פרטי מטופל...</p></div>;
  }

  const pendingStations = patient.stations.filter((s) => s.status === 'pending');
  const completedStations = patient.stations.filter((s) => s.status === 'complete');

  return (
    <div style={styles.body}>
      <button type="button" style={styles.backLink} onClick={() => navigate('/queue')}>← חזרה לתור</button>

      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>{patient.patient_name}</h1>
          <div style={styles.badgeRow}>
            <span style={{ ...styles.badge, background: PHASE_COLORS[patient.current_phase] }}>
              {PHASE_LABELS[patient.current_phase]}
            </span>
            {patient.track === 'er' && <span style={{ ...styles.badge, background: '#dc2626' }}>מיון</span>}
          </div>
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>פרטי ביקור</h2>
          <dl style={styles.dl}>
            <dt style={styles.dt}>מחלקה</dt><dd style={styles.dd}>{patient.department}</dd>
            <dt style={styles.dt}>מסלול</dt><dd style={styles.dd}>{patient.track === 'er' ? 'מיון' : 'אלקטיבי'}</dd>
            {patient.arrival_time && (
              <>
                <dt style={styles.dt}>שעת הגעה</dt>
                <dd style={styles.dd}>{new Date(patient.arrival_time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</dd>
              </>
            )}
            {patient.minutes_waiting != null && (
              <><dt style={styles.dt}>ממתין</dt><dd style={styles.dd}>{patient.minutes_waiting} דקות</dd></>
            )}
            {patient.estimated_wait_minutes != null && (
              <><dt style={styles.dt}>זמן משוער</dt><dd style={styles.dd}>{patient.estimated_wait_minutes} דקות</dd></>
            )}
          </dl>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>תחנות קליניות</h2>

          {patient.stations.length === 0 && <p style={styles.hint}>לא נוספו תחנות עדיין.</p>}

          {pendingStations.length > 0 && (
            <ul style={styles.stationList}>
              {pendingStations.map((s) => (
                <li key={s.station_id} style={styles.stationRow}>
                  <span>{s.order_index}. {s.department}</span>
                  <button
                    type="button"
                    style={styles.completeBtn}
                    disabled={stationBusyId === s.station_id}
                    onClick={() => handleCompleteStation(s.station_id)}
                  >
                    {stationBusyId === s.station_id ? '...' : 'סמן כהושלם'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {completedStations.length > 0 && (
            <ul style={styles.stationList}>
              {completedStations.map((s) => (
                <li key={s.station_id} style={{ ...styles.stationRow, opacity: 0.6 }}>
                  <span>{s.order_index}. {s.department} ✓</span>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddStation} style={styles.inlineForm}>
            <select
              value={newStationDept}
              onChange={(e) => setNewStationDept(e.target.value)}
              style={styles.select}
              required
            >
              <option value="">הוסף תחנה במחלקה...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button type="submit" style={styles.primaryBtn} disabled={addingStation || !newStationDept}>
              {addingStation ? 'מוסיף...' : '+ הוסף'}
            </button>
          </form>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>טפסים</h2>
          <p style={styles.formsCount}>{patient.forms_submitted} / {patient.forms_total} טפסים הוגשו</p>
          <button type="button" style={styles.primaryBtn} onClick={handleExportPdf} disabled={pdfState.loading}>
            {pdfState.loading ? 'מייצא...' : 'ייצוא PDF'}
          </button>
          {pdfState.error && <p style={styles.errorMsg}>{pdfState.error}</p>}
          {pdfState.url && <p style={styles.successMsg}>נפתח בכרטיסייה חדשה.</p>}
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>קישור למלווה</h2>
          <p style={styles.hint}>המלווה יקבל SMS עם קישור צפייה בלבד במסך ההמתנה.</p>
          <form onSubmit={handleCompanionSubmit} style={styles.inlineForm}>
            <input
              type="tel"
              value={companionPhone}
              onChange={(e) => setCompanionPhone(e.target.value)}
              style={{ ...styles.select, direction: 'ltr', textAlign: 'left' }}
              placeholder="+972501234567"
              required
            />
            <button type="submit" style={styles.primaryBtn} disabled={companionState.loading}>
              {companionState.loading ? 'שולח...' : 'שלח קישור למלווה'}
            </button>
          </form>
          {companionState.error && <p style={styles.errorMsg}>{companionState.error}</p>}
          {companionState.message && <p style={styles.successMsg}>{companionState.message}</p>}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: { padding: '28px 32px', maxWidth: 1080, margin: '0 auto', direction: 'rtl', fontFamily: 'system-ui, sans-serif' },
  backLink: { background: 'none', border: 'none', color: TEAL, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { margin: 0, fontSize: 26, fontWeight: 700, color: '#0f172a' },
  badgeRow: { display: 'flex', gap: 8, marginTop: 8 },
  badge: { display: 'inline-block', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700, color: '#fff' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 },
  card: { background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  cardTitle: { margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#0f172a' },
  dl: { margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px' },
  dt: { fontSize: 13, color: '#718096', fontWeight: 600 },
  dd: { margin: 0, fontSize: 14, color: '#1a202c', fontWeight: 600 },
  hint: { fontSize: 13, color: '#94a3b8', margin: '0 0 12px' },
  stationList: { listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  stationRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#f7fafc', borderRadius: 8, padding: '8px 12px', fontSize: 14,
  },
  completeBtn: {
    minHeight: 36, padding: '6px 12px', background: '#fff', border: `1px solid ${TEAL}`,
    color: TEAL, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  inlineForm: { display: 'flex', gap: 8, marginTop: 4 },
  select: {
    flex: 1, minHeight: 44, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d1d5db',
    fontSize: 14, direction: 'rtl', boxSizing: 'border-box',
  },
  primaryBtn: {
    minHeight: 44, padding: '8px 18px', background: TEAL, color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  formsCount: { fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' },
  errorMsg: { color: '#b91c1c', fontSize: 13, marginTop: 10 },
  successMsg: { color: '#059669', fontSize: 13, marginTop: 10 },
  emptyCard: {
    background: '#fff', borderRadius: 12, padding: 32, border: '1px solid #e2e8f0',
    textAlign: 'center', color: '#475569',
  },
};
