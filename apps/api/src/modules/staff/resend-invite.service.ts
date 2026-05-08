import { query } from '../../db/db';
import { generateToken } from '../magic-links/magic-links.service';
import { enqueueNotification } from '../notifications/notifications.producer';

interface ResendContext {
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  phone_number: string;
  department_id: string;
  department_name: string;
  track: 'elective' | 'er';
  current_phase: string;
}

interface ResendResult {
  appointment_id: string;
  token: string;
  expires_at: string;
}

/**
 * Resend a magic link invite for an expired appointment.
 * Regenerates the token on the existing appointment row (preserves history).
 * Validates departmentScope for staff with department-level access.
 */
export async function resendInviteForAppointment(
  appointmentId: string,
  staffDepartmentScope: string | null
): Promise<ResendResult> {
  // Fetch appointment context
  const { rows } = await query<ResendContext>(`
    SELECT a.id AS appointment_id, a.patient_id, p.name AS patient_name,
           p.phone_number, a.department_id, d.name AS department_name,
           a.track, a.current_phase
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN departments d ON d.id = a.department_id
    WHERE a.id = $1
  `, [appointmentId]);

  if (rows.length === 0) {
    const err = Object.assign(new Error('appointment_not_found'), { status: 404 });
    throw err;
  }

  const appt = rows[0];

  // Enforce department scope for non-admin staff
  if (staffDepartmentScope && appt.department_id !== staffDepartmentScope) {
    const err = Object.assign(new Error('forbidden'), { status: 403 });
    throw err;
  }

  // Only allow resend for expired appointments
  if (appt.current_phase !== 'expired') {
    const err = Object.assign(new Error('invalid_phase'), {
      status: 409,
      message: `Cannot resend invite: appointment is in phase '${appt.current_phase}', not 'expired'`,
    });
    throw err;
  }

  // Determine TTL based on track
  const ttlHours = appt.track === 'er'
    ? parseInt(process.env.ER_LINK_TTL_HOURS ?? '12', 10)
    : parseInt(process.env.ELECTIVE_LINK_TTL_HOURS ?? '72', 10);

  // Generate new token
  const token = await generateToken(appointmentId, appt.track, ttlHours);

  // Build SMS message
  const patientAppUrl = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173/visit';
  const linkUrl = `${patientAppUrl}/${token}`;
  const message = `שלום ${appt.patient_name}, קישור חדש לביקורך ב${appt.department_name}: ${linkUrl}`;

  // Enqueue notification with dedup bypass
  // (one-time resend, not a periodic reminder that should be capped)
  await enqueueNotification({
    patientId: appt.patient_id,
    appointmentId,
    phoneNumber: appt.phone_number,
    type: 'magic_link',
    message,
    triggeringEvent: `resend_invite:${appointmentId}:${Date.now()}`,
    bypassDedup: true,
  });

  // Reset appointment phase back to link_sent
  await query(
    `UPDATE appointments SET current_phase = 'link_sent', updated_at = NOW()
     WHERE id = $1 AND current_phase = 'expired'`,
    [appointmentId]
  );

  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  return {
    appointment_id: appointmentId,
    token,
    expires_at: expiresAt.toISOString(),
  };
}
