import { query } from '../../db/db';

export interface QueuePatient {
  appointment_id: string;
  patient_name: string;
  arrival_time: string;
  minutes_waiting: number;
  status: 'waiting' | 'in_treatment' | 'done';
  estimated_wait_minutes: number | null;
  stations: { station_id: string; department: string; order_index: number; status: string }[];
  forms_submitted: number;
  forms_total: number;
}

export interface QueueResponse {
  department: string;
  patients: QueuePatient[];
  broadcast_message: string | null;
  broadcast_sent_at: string | null;
}

export async function getQueue(departmentId: string): Promise<QueueResponse> {
  const { rows: deptRows } = await query<{ name: string }>(
    'SELECT name FROM departments WHERE id = $1',
    [departmentId]
  );
  const departmentName = deptRows[0]?.name ?? '';

  const { rows } = await query<{
    appointment_id: string;
    patient_name: string;
    arrival_time: Date;
    status: 'waiting' | 'in_treatment' | 'done';
    estimated_wait_minutes: number | null;
    broadcast_message: string | null;
    broadcast_sent_at: Date | null;
  }>(`
    SELECT wq.appointment_id, p.name AS patient_name, wq.arrival_time,
           wq.status, wq.estimated_wait_minutes,
           wq.broadcast_message, wq.broadcast_sent_at
    FROM waiting_queue wq
    JOIN appointments a ON a.id = wq.appointment_id
    JOIN patients p ON p.id = a.patient_id
    WHERE wq.department_id = $1 AND wq.status != 'done'
    ORDER BY wq.arrival_time ASC
  `, [departmentId]);

  const now = Date.now();

  const patients: QueuePatient[] = await Promise.all(
    rows.map(async (row) => {
      const minutesWaiting = Math.floor((now - new Date(row.arrival_time).getTime()) / 60000);

      const { rows: stationRows } = await query<{
        id: string; department_name: string; order_index: number; status: string;
      }>(`
        SELECT ps.id, d.name AS department_name, ps.order_index, ps.status
        FROM patient_stations ps
        JOIN departments d ON d.id = ps.department_id
        WHERE ps.appointment_id = $1
        ORDER BY ps.order_index ASC
      `, [row.appointment_id]);

      const { rows: formRows } = await query<{ total: string; submitted: string }>(`
        SELECT COUNT(*) AS total,
               COUNT(submitted_at) AS submitted
        FROM digital_forms WHERE appointment_id = $1
      `, [row.appointment_id]);

      return {
        appointment_id: row.appointment_id,
        patient_name: row.patient_name,
        arrival_time: new Date(row.arrival_time).toISOString(),
        minutes_waiting: minutesWaiting,
        status: row.status,
        estimated_wait_minutes: row.estimated_wait_minutes,
        stations: stationRows.map((s) => ({
          station_id: s.id,
          department: s.department_name,
          order_index: s.order_index,
          status: s.status,
        })),
        forms_submitted: parseInt(formRows[0]?.submitted ?? '0', 10),
        forms_total: parseInt(formRows[0]?.total ?? '0', 10),
      };
    })
  );

  const latestBroadcast = rows[0];
  return {
    department: departmentName,
    patients,
    broadcast_message: latestBroadcast?.broadcast_message ?? null,
    broadcast_sent_at: latestBroadcast?.broadcast_sent_at
      ? new Date(latestBroadcast.broadcast_sent_at).toISOString()
      : null,
  };
}

export async function updatePatientStatus(
  appointmentId: string,
  departmentId: string,
  status: 'waiting' | 'in_treatment' | 'done'
): Promise<{ appointment_id: string; status: string; updated_at: string }> {
  const { rows } = await query<{ appointment_id: string; updated_at: Date }>(`
    UPDATE waiting_queue
    SET status = $1, updated_at = NOW()
    WHERE appointment_id = $2 AND department_id = $3
    RETURNING appointment_id, updated_at
  `, [status, appointmentId, departmentId]);

  if (rows.length === 0) throw Object.assign(new Error('not_found'), { status: 404 });

  return {
    appointment_id: rows[0].appointment_id,
    status,
    updated_at: new Date(rows[0].updated_at).toISOString(),
  };
}

export async function setWaitEstimate(
  departmentId: string,
  estimatedWaitMinutes: number
): Promise<void> {
  await query(`
    UPDATE waiting_queue
    SET estimated_wait_minutes = $1, updated_at = NOW()
    WHERE department_id = $2 AND status = 'waiting'
  `, [estimatedWaitMinutes, departmentId]);
}

export async function broadcastMessage(
  departmentId: string,
  message: string
): Promise<{ sent: boolean; recipient_count: number; sent_at: string }> {
  const { rowCount } = await query(`
    UPDATE waiting_queue
    SET broadcast_message = $1, broadcast_sent_at = NOW(), updated_at = NOW()
    WHERE department_id = $2 AND status IN ('waiting', 'in_treatment')
  `, [message, departmentId]);

  return {
    sent: true,
    recipient_count: rowCount ?? 0,
    sent_at: new Date().toISOString(),
  };
}
