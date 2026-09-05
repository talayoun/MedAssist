import { query } from '../../db/db';
import type { StaffAuthContext } from '@medassist/shared-types';
import { enqueueNotification } from '../notifications/notifications.producer';

/**
 * Station writes had no department scoping at all, so any staff user could add
 * or complete stations for a patient in someone else's department. Mirrors the
 * rule queue.service already applies: 'staff' is confined to their own
 * department, admins are unrestricted, and out-of-scope reads as 404 rather
 * than 403 so it does not confirm the appointment exists.
 *
 * Scoped on the appointment's department, not the station's — routing a patient
 * onward to a different department is the normal case and must stay allowed.
 */
async function assertAppointmentInScope(
  appointmentId: string,
  caller: StaffAuthContext
): Promise<void> {
  if (caller.role !== 'staff') return;
  const { rows } = await query(
    'SELECT 1 FROM appointments WHERE id = $1 AND department_id = $2',
    [appointmentId, caller.departmentId]
  );
  if (rows.length === 0) throw Object.assign(new Error('not_found'), { status: 404 });
}

export async function addStation(
  appointmentId: string,
  departmentId: string,
  orderIndex: number,
  caller: StaffAuthContext
): Promise<{ station_id: string; department: string; order_index: number; status: string }> {
  await assertAppointmentInScope(appointmentId, caller);

  const { rows: [station] } = await query<{ id: string }>(`
    INSERT INTO patient_stations (appointment_id, department_id, order_index, status)
    VALUES ($1, $2, $3, 'pending')
    RETURNING id
  `, [appointmentId, departmentId, orderIndex]);

  const { rows: [dept] } = await query<{ name: string }>(
    'SELECT name FROM departments WHERE id = $1', [departmentId]
  );

  const { rows: [appt] } = await query<{ patient_id: string; phone_number: string; patient_name: string }>(
    `SELECT a.patient_id, p.phone_number, p.name AS patient_name
     FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = $1`,
    [appointmentId]
  );

  const patientAppUrl = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173/visit';
  await enqueueNotification({
    patientId: appt.patient_id,
    appointmentId,
    phoneNumber: appt.phone_number,
    type: 'station_update',
    message: `שלום ${appt.patient_name}, תחנתך הבאה היא: ${dept.name}. עקוב אחר ההוראות.`,
    triggeringEvent: `station_added:${station.id}`,
  }).catch(() => {}); // fire-and-forget — don't fail the request on cap/dedup

  return { station_id: station.id, department: dept.name, order_index: orderIndex, status: 'pending' };
}

export async function reorderStations(
  appointmentId: string,
  stationIds: string[],
  caller: StaffAuthContext
): Promise<void> {
  await assertAppointmentInScope(appointmentId, caller);
  for (let i = 0; i < stationIds.length; i++) {
    await query(
      'UPDATE patient_stations SET order_index = $1 WHERE id = $2 AND appointment_id = $3',
      [i + 1, stationIds[i], appointmentId]
    );
  }
}

export async function markStationComplete(
  appointmentId: string,
  stationId: string,
  staffId: string,
  caller: StaffAuthContext
): Promise<{ station_id: string; status: string; completed_at: string }> {
  await assertAppointmentInScope(appointmentId, caller);
  const { rows: [row] } = await query<{ id: string; completed_at: Date }>(`
    UPDATE patient_stations
    SET status = 'complete', completed_at = NOW(), completed_by_staff_id = $1
    WHERE id = $2 AND appointment_id = $3
    RETURNING id, completed_at
  `, [staffId, stationId, appointmentId]);

  if (!row) throw Object.assign(new Error('not_found'), { status: 404 });

  return { station_id: row.id, status: 'complete', completed_at: new Date(row.completed_at).toISOString() };
}
