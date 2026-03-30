import { query } from '../../db/db';
import { randomUUID } from 'crypto';

type AppointmentTrack = 'elective' | 'er';
type VisitPhase = 'checklist' | 'navigation' | 'waiting';

export interface VisitContext {
  track: AppointmentTrack;
  phase: VisitPhase;
  patient: { name: string; department: string; visit_date: string | null };
  appointment_id: string;
}

interface MagicLinkRow {
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  department_name: string;
  visit_datetime: Date | null;
  track: AppointmentTrack;
  appt_status: string;
  expires_at: Date;
  used_at: Date | null;
  link_type: 'patient' | 'companion';
}

/** Resolve token → visit context, marking used_at on first valid open */
export async function resolveToken(token: string): Promise<VisitContext> {
  const { rows } = await query<MagicLinkRow>(`
    SELECT ml.appointment_id, a.patient_id, p.name AS patient_name,
           d.name AS department_name, a.visit_datetime,
           ml.track, a.status AS appt_status,
           ml.expires_at, ml.used_at, ml.link_type
    FROM magic_links ml
    JOIN appointments a  ON a.id  = ml.appointment_id
    JOIN patients     p  ON p.id  = a.patient_id
    JOIN departments  d  ON d.id  = a.department_id
    WHERE ml.token = $1
  `, [token]);

  if (rows.length === 0) {
    const err = Object.assign(new Error('link_not_found'), { status: 404 });
    throw err;
  }

  const row = rows[0];

  if (row.used_at !== null) {
    const err = Object.assign(new Error('link_used'), {
      status: 409,
      message: 'הקישור כבר נפתח. פנה לצוות לקישור חדש.',
    });
    throw err;
  }

  if (new Date(row.expires_at) <= new Date()) {
    const err = Object.assign(new Error('link_expired'), {
      status: 410,
      message: 'הקישור פג תוקף. פנה לצוות לקבלת קישור חדש.',
    });
    throw err;
  }

  // Mark token as used
  await query(
    'UPDATE magic_links SET used_at = NOW() WHERE token = $1',
    [token]
  );

  // Activate appointment if still scheduled
  if (row.appt_status === 'scheduled') {
    await query(
      "UPDATE appointments SET status = 'active', updated_at = NOW() WHERE id = $1",
      [row.appointment_id]
    );
  }

  const phase = determinePhase(row.track, row.appt_status);

  return {
    track: row.track,
    phase,
    patient: {
      name: row.patient_name,
      department: row.department_name,
      visit_date: row.visit_datetime
        ? new Date(row.visit_datetime).toISOString().split('T')[0]
        : null,
    },
    appointment_id: row.appointment_id,
  };
}

function determinePhase(track: AppointmentTrack, apptStatus: string): VisitPhase {
  if (track === 'er') return 'waiting';
  if (apptStatus === 'active') return 'navigation';
  return 'checklist';
}

/** Generate a new magic link token for an appointment */
export async function generateToken(
  appointmentId: string,
  track: AppointmentTrack,
  ttlHours: number
): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await query(
    `INSERT INTO magic_links (appointment_id, token, track, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [appointmentId, token, track, expiresAt.toISOString()]
  );
  return token;
}
