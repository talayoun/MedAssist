import { query } from '../../db/db';
import { enqueueNotification } from './notifications.producer';
import { notificationQueue } from './queue';

const DEFAULT_REMINDER_WINDOW_HOURS = 24;

/**
 * Schedule a checklist reminder for an appointment.
 * Fires a BullMQ delayed job that checks if the patient has opened their link;
 * if not, sends exactly one reminder SMS (dedup enforced by producer).
 */
export async function scheduleChecklistReminder(appointmentId: string): Promise<void> {
  const windowHours = parseInt(
    process.env.CHECKLIST_REMINDER_WINDOW_HOURS ?? String(DEFAULT_REMINDER_WINDOW_HOURS),
    10
  );

  // Delay = time from now until (visit_datetime - windowHours)
  const { rows: [appt] } = await query<{
    visit_datetime: Date | null;
    patient_id: string;
    phone_number: string;
    patient_name: string;
  }>(
    `SELECT a.visit_datetime, a.patient_id, p.phone_number, p.name AS patient_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.id = $1`,
    [appointmentId]
  );

  if (!appt.visit_datetime) return; // ER appointments have no visit time

  const fireAt = new Date(
    new Date(appt.visit_datetime).getTime() - windowHours * 60 * 60 * 1000
  );
  const delayMs = Math.max(0, fireAt.getTime() - Date.now());

  // Enqueue a "check-and-remind" job
  await notificationQueue.add(
    `reminder:check:${appointmentId}`,
    {
      notificationId: '',
      patientId: appt.patient_id,
      appointmentId,
      phoneNumber: appt.phone_number,
      message: `שלום ${appt.patient_name}, תזכורת לביקורך הקרוב — אנא עיין ברשימת ההכנות שלך.`,
      type: 'checklist_reminder',
      retryCount: 0,
    },
    { delay: delayMs, jobId: `reminder:${appointmentId}` }
  );
}
