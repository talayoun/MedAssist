import { query } from '../../db/db';
import { generateToken } from './magic-links.service';
import { enqueueNotification } from '../notifications/notifications.producer';

const SYSTEM_DEFAULT_OFFSET_HOURS = -24;

interface AppointmentForScheduling {
  id: string;
  patient_id: string;
  department_id: string;
  procedure_type: string | null;
  visit_datetime: Date;
  phone_number: string;
  patient_name: string;
  department_name: string;
}

/** Resolve the send offset hours for an appointment using the timing rules hierarchy */
export async function resolveTimingOffset(
  departmentId: string,
  procedureType: string | null
): Promise<number> {
  // Most specific: dept + procedure_type
  if (procedureType) {
    const { rows } = await query<{ send_offset_hours: number }>(
      `SELECT send_offset_hours FROM magic_link_timing_rules
       WHERE department_id = $1 AND procedure_type = $2`,
      [departmentId, procedureType]
    );
    if (rows.length > 0) return rows[0].send_offset_hours;
  }

  // Dept-wide fallback
  const { rows: deptRows } = await query<{ send_offset_hours: number }>(
    `SELECT send_offset_hours FROM magic_link_timing_rules
     WHERE department_id = $1 AND procedure_type IS NULL`,
    [departmentId]
  );
  if (deptRows.length > 0) return deptRows[0].send_offset_hours;

  // System default
  const envDefault = parseInt(process.env.DEFAULT_MAGIC_LINK_OFFSET_HOURS ?? '-24', 10);
  return isNaN(envDefault) ? SYSTEM_DEFAULT_OFFSET_HOURS : envDefault;
}

/** Schedule a magic link send for an elective appointment */
export async function scheduleMagicLinkForAppointment(
  appt: AppointmentForScheduling
): Promise<void> {
  const offsetHours = await resolveTimingOffset(appt.department_id, appt.procedure_type);
  const sendAt = new Date(new Date(appt.visit_datetime).getTime() + offsetHours * 60 * 60 * 1000);
  const delayMs = Math.max(0, sendAt.getTime() - Date.now());

  const ttlHours = parseInt(process.env.ELECTIVE_LINK_TTL_HOURS ?? '72', 10);
  const token = await generateToken(appt.id, 'elective', ttlHours);

  const patientAppUrl = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173/visit';
  const linkUrl = `${patientAppUrl}/${token}`;
  const message = `שלום ${appt.patient_name}, קישור לביקורך ב${appt.department_name}: ${linkUrl}`;

  await enqueueNotification({
    patientId: appt.patient_id,
    appointmentId: appt.id,
    phoneNumber: appt.phone_number,
    type: 'magic_link',
    message,
    triggeringEvent: `elective_appointment_scheduled:${appt.id}`,
    delayMs,
  });

  // Record the scheduled send time on the appointment
  await query(
    'UPDATE appointments SET magic_link_send_time = $1, updated_at = NOW() WHERE id = $2',
    [sendAt.toISOString(), appt.id]
  );
}
