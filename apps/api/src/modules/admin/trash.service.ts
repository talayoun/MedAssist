import { query, transaction } from '../../db/db';

export interface TrashEntry {
  appointment_id: string;
  patient_name: string;
  phone_number: string;
  department_name: string;
  procedure_type: string;
  track: 'elective' | 'er';
  deleted_at: string;
  days_until_purge: number;
}

export async function listTrash(): Promise<TrashEntry[]> {
  const { rows } = await query<{
    id: string;
    patient_name: string;
    phone_number: string;
    department_name: string;
    procedure_type: string;
    track: 'elective' | 'er';
    deleted_at: Date;
  }>(`
    SELECT a.id, p.name AS patient_name, p.phone_number,
           d.name AS department_name, a.procedure_type, a.track, a.deleted_at
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN departments d ON d.id = a.department_id
    WHERE a.deleted_at IS NOT NULL
    ORDER BY a.deleted_at DESC
  `, []);

  return rows.map((r) => ({
    appointment_id: r.id,
    patient_name: r.patient_name,
    phone_number: r.phone_number,
    department_name: r.department_name,
    procedure_type: r.procedure_type,
    track: r.track,
    deleted_at: new Date(r.deleted_at).toISOString(),
    days_until_purge: Math.max(
      0,
      7 - Math.floor((Date.now() - new Date(r.deleted_at).getTime()) / 86_400_000)
    ),
  }));
}

export async function softDeleteAppointment(id: string): Promise<{ deleted: boolean }> {
  const { rowCount } = await query(
    `UPDATE appointments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!rowCount) throw Object.assign(new Error('not_found'), { status: 404 });
  return { deleted: true };
}

export async function restoreAppointment(id: string): Promise<{ restored: boolean }> {
  const { rowCount } = await query(
    `UPDATE appointments SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`,
    [id]
  );
  if (!rowCount) throw Object.assign(new Error('not_found'), { status: 404 });
  return { restored: true };
}

export async function hardDeleteAppointment(id: string): Promise<{ deleted: boolean }> {
  return transaction(async (client) => {
    const check = await client.query(
      `SELECT id FROM appointments WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );
    if (!check.rowCount) throw Object.assign(new Error('not_found'), { status: 404 });
    await client.query(`DELETE FROM magic_links        WHERE appointment_id = $1`, [id]);
    await client.query(`DELETE FROM checklist_progress WHERE appointment_id = $1`, [id]);
    await client.query(`DELETE FROM companions         WHERE appointment_id = $1`, [id]);
    await client.query(`DELETE FROM notifications      WHERE appointment_id = $1`, [id]);
    await client.query(`DELETE FROM nav_progress       WHERE appointment_id = $1`, [id]);
    await client.query(`DELETE FROM waiting_queue      WHERE appointment_id = $1`, [id]);
    await client.query(`DELETE FROM patient_stations   WHERE appointment_id = $1`, [id]);
    await client.query(`DELETE FROM appointments       WHERE id = $1`, [id]);
    return { deleted: true };
  });
}

export async function bulkSoftDeleteByDepartment(
  departmentId: string,
): Promise<{ deleted_count: number }> {
  const { rowCount } = await query(
    `UPDATE appointments SET deleted_at = NOW()
     WHERE department_id = $1 AND deleted_at IS NULL`,
    [departmentId],
  );
  return { deleted_count: rowCount ?? 0 };
}

export async function purgeExpiredTrash(): Promise<void> {
  await transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM appointments WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days'`,
      []
    );
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    await client.query(`DELETE FROM magic_links        WHERE appointment_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM checklist_progress WHERE appointment_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM companions         WHERE appointment_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM notifications      WHERE appointment_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM nav_progress       WHERE appointment_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM waiting_queue      WHERE appointment_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM patient_stations   WHERE appointment_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM appointments       WHERE id = ANY($1)`, [ids]);
  });
}
