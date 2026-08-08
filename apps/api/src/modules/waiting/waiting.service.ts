import { query } from '../../db/db';

export interface WaitingStatus {
  status: 'waiting' | 'in_treatment' | 'done';
  arrival_confirmed: boolean;
  department: string;
  estimated_wait_minutes: number | null;
  broadcast_message: string | null;
  broadcast_sent_at: string | null;
  updated_at: string;
  queue_position: number | null;
  people_ahead: number | null;
}

const BROADCAST_STALE_MS = 60 * 60 * 1000; // 60 minutes

async function fetchQueuePosition(appointmentId: string): Promise<number | null> {
  const { rows } = await query<{ position: string | null }>(`
    WITH ranked AS (
      SELECT appointment_id,
             ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY arrival_time) AS position
      FROM waiting_queue
      WHERE status = 'waiting'
    )
    SELECT position::text AS position FROM ranked WHERE appointment_id = $1
  `, [appointmentId]);
  return rows[0]?.position ? parseInt(rows[0].position, 10) : null;
}

export async function getWaitingStatus(appointmentId: string): Promise<WaitingStatus> {
  const { rows } = await query<{
    status: 'waiting' | 'in_treatment' | 'done';
    arrival_time: Date;
    estimated_wait_minutes: number | null;
    broadcast_message: string | null;
    broadcast_sent_at: Date | null;
    updated_at: Date;
    department_name: string;
  }>(`
    SELECT wq.status, wq.arrival_time, wq.estimated_wait_minutes,
           wq.broadcast_message, wq.broadcast_sent_at, wq.updated_at,
           d.name AS department_name
    FROM waiting_queue wq
    JOIN departments d ON d.id = wq.department_id
    WHERE wq.appointment_id = $1
  `, [appointmentId]);

  if (rows.length === 0) {
    // Auto-create queue entry if not present (patient arrived via non-navigation path)
    const { rows: [created] } = await query<{
      status: 'waiting' | 'in_treatment' | 'done';
      arrival_time: Date;
      updated_at: Date;
      department_name: string;
    }>(`
      INSERT INTO waiting_queue (appointment_id, department_id, status)
      SELECT id, department_id, 'waiting' FROM appointments WHERE id = $1
      RETURNING status, arrival_time, updated_at,
        (SELECT name FROM departments WHERE id = (SELECT department_id FROM appointments WHERE id = $1)) AS department_name
    `, [appointmentId]);

    const position = await fetchQueuePosition(appointmentId);
    return buildWaitingStatus(created.status, created.department_name, null, null, null, created.updated_at, position);
  }

  const row = rows[0];

  // Treat stale broadcasts as null
  const broadcastMessage =
    row.broadcast_sent_at && Date.now() - new Date(row.broadcast_sent_at).getTime() < BROADCAST_STALE_MS
      ? row.broadcast_message
      : null;

  const position = await fetchQueuePosition(appointmentId);

  return buildWaitingStatus(
    row.status,
    row.department_name,
    row.estimated_wait_minutes,
    broadcastMessage,
    row.broadcast_sent_at ? row.broadcast_sent_at.toISOString() : null,
    row.updated_at,
    position
  );
}

function buildWaitingStatus(
  status: WaitingStatus['status'],
  department: string,
  estimatedWaitMinutes: number | null,
  broadcastMessage: string | null,
  broadcastSentAt: string | null,
  updatedAt: Date,
  queuePosition: number | null
): WaitingStatus {
  return {
    status,
    arrival_confirmed: true,
    department,
    estimated_wait_minutes: estimatedWaitMinutes,
    broadcast_message: broadcastMessage,
    broadcast_sent_at: broadcastSentAt,
    updated_at: new Date(updatedAt).toISOString(),
    queue_position: queuePosition,
    people_ahead: queuePosition !== null ? queuePosition - 1 : null,
  };
}

export async function recordContactMessage(
  appointmentId: string,
  messageType: 'need_help' | 'confirm_here' | 'question'
): Promise<void> {
  // Log the contact attempt in notifications as a broadcast type
  const { rows: [appt] } = await query<{ patient_id: string; department_id: string }>(
    'SELECT patient_id, department_id FROM appointments WHERE id = $1',
    [appointmentId]
  );

  await query(`
    INSERT INTO notifications (patient_id, appointment_id, type, status, triggering_event)
    VALUES ($1, $2, 'broadcast', 'sent', $3)
  `, [appt.patient_id, appointmentId, `patient_contact:${messageType}`]);
}
