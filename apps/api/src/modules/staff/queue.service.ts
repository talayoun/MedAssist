import { query } from '../../db/db';
import { advanceAppointmentPhase, AppointmentPhase } from '../appointments/phase.service';

export type QueuePhase = AppointmentPhase;

export interface QueuePatient {
  appointment_id: string;
  patient_name: string;
  department_id: string;
  department: string;
  track: 'elective' | 'er';
  current_phase: QueuePhase;
  link_sent_at: string;
  arrival_time: string | null;
  minutes_waiting: number | null;
  queue_status: 'waiting' | 'in_treatment' | 'done' | null;
  estimated_wait_minutes: number | null;
  stations: { station_id: string; department: string; order_index: number; status: string }[];
  forms_submitted: number;
  forms_total: number;
}

export interface QueueResponse {
  department_label: string;
  patients: QueuePatient[];
  broadcast_message: string | null;
  broadcast_sent_at: string | null;
}

export interface QueueFilter {
  departmentId: string | null;
  phase: QueuePhase | null;
}

export async function getQueue(filter: QueueFilter): Promise<QueueResponse> {
  const params: (string | null)[] = [];
  const where: string[] = ["a.current_phase != 'done'"];

  if (filter.departmentId) {
    params.push(filter.departmentId);
    where.push(`a.department_id = $${params.length}`);
  }
  if (filter.phase) {
    params.push(filter.phase);
    where.push(`a.current_phase = $${params.length}::appointment_phase`);
  }

  const { rows } = await query<{
    appointment_id: string;
    patient_name: string;
    department_id: string;
    department_name: string;
    track: 'elective' | 'er';
    current_phase: QueuePhase;
    link_sent_at: Date;
    arrival_time: Date | null;
    queue_status: 'waiting' | 'in_treatment' | 'done' | null;
    estimated_wait_minutes: number | null;
    broadcast_message: string | null;
    broadcast_sent_at: Date | null;
  }>(`
    SELECT a.id AS appointment_id, p.name AS patient_name,
           a.department_id, d.name AS department_name,
           a.track, a.current_phase,
           a.created_at AS link_sent_at,
           wq.arrival_time, wq.status AS queue_status,
           wq.estimated_wait_minutes,
           wq.broadcast_message, wq.broadcast_sent_at
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN departments d ON d.id = a.department_id
    LEFT JOIN waiting_queue wq ON wq.appointment_id = a.id
    WHERE ${where.join(' AND ')}
    ORDER BY a.created_at ASC
  `, params);

  const now = Date.now();

  const patients: QueuePatient[] = await Promise.all(
    rows.map(async (row) => {
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

      const arrivalIso = row.arrival_time ? new Date(row.arrival_time).toISOString() : null;
      const minutesWaiting = row.arrival_time
        ? Math.floor((now - new Date(row.arrival_time).getTime()) / 60000)
        : null;

      return {
        appointment_id: row.appointment_id,
        patient_name: row.patient_name,
        department_id: row.department_id,
        department: row.department_name,
        track: row.track,
        current_phase: row.current_phase,
        link_sent_at: new Date(row.link_sent_at).toISOString(),
        arrival_time: arrivalIso,
        minutes_waiting: minutesWaiting,
        queue_status: row.queue_status,
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

  const latestBroadcast = rows.find((r) => r.broadcast_message);
  const departmentLabel = filter.departmentId
    ? (rows[0]?.department_name ?? (await lookupDepartmentName(filter.departmentId)))
    : 'כל המחלקות';

  return {
    department_label: departmentLabel,
    patients,
    broadcast_message: latestBroadcast?.broadcast_message ?? null,
    broadcast_sent_at: latestBroadcast?.broadcast_sent_at
      ? new Date(latestBroadcast.broadcast_sent_at).toISOString()
      : null,
  };
}

async function lookupDepartmentName(departmentId: string): Promise<string> {
  const { rows } = await query<{ name: string }>(
    'SELECT name FROM departments WHERE id = $1',
    [departmentId]
  );
  return rows[0]?.name ?? '';
}

export async function updatePatientStatus(
  appointmentId: string,
  status: 'waiting' | 'in_treatment' | 'done',
  departmentScope: string | null
): Promise<{ appointment_id: string; status: string; updated_at: string }> {
  const scopeParams: (string | null)[] = [status, appointmentId];
  let scopeClause = '';
  if (departmentScope) {
    scopeParams.push(departmentScope);
    scopeClause = ' AND department_id = $3';
  }
  const { rows } = await query<{ appointment_id: string; updated_at: Date }>(`
    UPDATE waiting_queue
    SET status = $1, updated_at = NOW()
    WHERE appointment_id = $2${scopeClause}
    RETURNING appointment_id, updated_at
  `, scopeParams);

  if (rows.length === 0) throw Object.assign(new Error('not_found'), { status: 404 });

  if (status === 'done') {
    await advanceAppointmentPhase(appointmentId, 'done');
  }

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

export async function resetArrivalToNow(
  appointmentId: string,
  departmentScope: string | null
): Promise<{ appointment_id: string; arrival_time: string }> {
  const scopeParams: string[] = [appointmentId];
  let scopeClause = '';
  if (departmentScope) {
    scopeParams.push(departmentScope);
    scopeClause = ' AND department_id = $2';
  }
  const { rows } = await query<{ appointment_id: string; arrival_time: Date }>(`
    UPDATE waiting_queue
    SET arrival_time = NOW(), updated_at = NOW()
    WHERE appointment_id = $1${scopeClause}
    RETURNING appointment_id, arrival_time
  `, scopeParams);

  if (rows.length === 0) throw Object.assign(new Error('not_found'), { status: 404 });

  return {
    appointment_id: rows[0].appointment_id,
    arrival_time: new Date(rows[0].arrival_time).toISOString(),
  };
}
