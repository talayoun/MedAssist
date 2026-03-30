import { query } from '../../db/db';
import { notificationQueue, NotificationJobData } from './queue';

type NotificationType = 'magic_link' | 'checklist_reminder' | 'station_update' | 'broadcast';

const MAX_NOTIFICATIONS_PER_VISIT = 4;

interface EnqueueOptions {
  patientId: string;
  appointmentId: string;
  phoneNumber: string;
  type: NotificationType;
  message: string;
  triggeringEvent: string;
  delayMs?: number;
}

/**
 * Enqueue an SMS notification after checking the per-visit cap and dedup rules.
 * Returns the notification DB row id if enqueued, or null if suppressed.
 */
export async function enqueueNotification(opts: EnqueueOptions): Promise<string | null> {
  const { patientId, appointmentId, phoneNumber, type, message, triggeringEvent, delayMs } = opts;

  // 1. Check per-visit notification cap (max 4)
  const { rows: capRows } = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM notifications WHERE appointment_id = $1`,
    [appointmentId]
  );
  if (parseInt(capRows[0].count, 10) >= MAX_NOTIFICATIONS_PER_VISIT) {
    console.log(`[notifications] Cap reached for appointment ${appointmentId} — suppressing ${type}`);
    return null;
  }

  // 2. Dedup: no prior notification of same type for this appointment
  const { rows: dedupRows } = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM notifications WHERE appointment_id = $1 AND type = $2`,
    [appointmentId, type]
  );
  if (parseInt(dedupRows[0].count, 10) > 0) {
    console.log(`[notifications] Duplicate ${type} for appointment ${appointmentId} — suppressing`);
    return null;
  }

  // 3. Insert notification row
  const { rows: [notif] } = await query<{ id: string }>(`
    INSERT INTO notifications (patient_id, appointment_id, type, status, triggering_event)
    VALUES ($1, $2, $3, 'retrying', $4)
    RETURNING id
  `, [patientId, appointmentId, type, triggeringEvent]);

  const notificationId = notif.id;

  // 4. Enqueue BullMQ job
  const jobData: NotificationJobData = {
    notificationId,
    patientId,
    appointmentId,
    phoneNumber,
    message,
    type,
    retryCount: 0,
  };

  await notificationQueue.add(`sms:${type}:${appointmentId}`, jobData, {
    delay: delayMs ?? 0,
  });

  return notificationId;
}
