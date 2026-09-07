/**
 * Seed one ER-track appointment for walking/demoing the ER flow.
 *
 * There is currently no product path (UI or API) that creates an `er`-track
 * appointment — `createElectiveAppointment` hardcodes `track = 'elective'`.
 * This is the standalone way to get one into the system for a manual
 * walkthrough or a demo recording, without touching the elective demo patient
 * `db:seed` already produces. Reuses the real `generateToken` and
 * `enqueueNotification` services rather than hand-rolling the token/SMS logic,
 * so the actual ER TTL and notification-cap/dedup rules get exercised too.
 *
 * Standalone and idempotent (upsert by phone), like `seed-demo-patients.ts` —
 * run this *after* `db:seed`/`db:reset-demo`, since it depends on the עיניים
 * department and cataract-surgery checklist template already existing.
 */
import pool, { query } from './db';
import { generateToken } from '../modules/magic-links/magic-links.service';
import { enqueueNotification } from '../modules/notifications/notifications.producer';
import { notificationQueue } from '../modules/notifications/queue';

const ER_PATIENT_NAME = 'מירי אביטן';
const ER_PATIENT_PHONE = '+972529876543';
const ER_DEPT_NAME = 'עיניים';
const ER_PROCEDURE = 'cataract-surgery';

async function seedErDemo() {
  const { rows: [dept] } = await query<{ id: string }>(
    `SELECT id FROM departments WHERE name = $1`,
    [ER_DEPT_NAME]
  );
  if (!dept) {
    throw new Error(`Department '${ER_DEPT_NAME}' not found — run db:seed / db:reset-demo first.`);
  }

  const { rows: [inserted] } = await query<{ id: string }>(
    `INSERT INTO patients (name, phone_number)
     VALUES ($1, $2)
     ON CONFLICT (phone_number) DO NOTHING
     RETURNING id`,
    [ER_PATIENT_NAME, ER_PATIENT_PHONE]
  );
  const patientId: string = inserted?.id ?? (
    await query<{ id: string }>(`SELECT id FROM patients WHERE phone_number = $1`, [ER_PATIENT_PHONE])
  ).rows[0].id;

  // Idempotency: wipe this patient's dependent rows before reseeding, same
  // cleanup order db:seed uses (children before parent, no ON DELETE CASCADE).
  await query(`DELETE FROM companions WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
  await query(`DELETE FROM notifications WHERE patient_id = $1`, [patientId]);
  await query(`DELETE FROM patient_stations WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
  await query(`DELETE FROM waiting_queue WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
  await query(`DELETE FROM nav_progress WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
  await query(`DELETE FROM checklist_progress WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
  await query(`DELETE FROM patient_form_items WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
  await query(`DELETE FROM magic_links WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
  await query(`DELETE FROM appointments WHERE patient_id = $1`, [patientId]);

  // visit_datetime = NULL is what the patient app reads as "urgent visit, no
  // scheduling needed" — an ER patient by definition wasn't scheduled.
  const { rows: [appt] } = await query<{ id: string }>(
    `INSERT INTO appointments (patient_id, department_id, procedure_type, track, visit_datetime, status)
     VALUES ($1, $2, $3, 'er', NULL, 'scheduled')
     RETURNING id`,
    [patientId, dept.id, ER_PROCEDURE]
  );
  const appointmentId = appt.id;

  const ttlHours = parseInt(process.env.ER_LINK_TTL_HOURS ?? '12', 10);
  const token = await generateToken(appointmentId, 'er', ttlHours);

  const patientAppUrl = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173/visit';
  const linkUrl = `${patientAppUrl}/${token}`;
  const message = `שלום ${ER_PATIENT_NAME}, קישור לביקורך במחלקת ${ER_DEPT_NAME}:\n${linkUrl}`;

  await enqueueNotification({
    patientId,
    appointmentId,
    phoneNumber: ER_PATIENT_PHONE,
    type: 'magic_link',
    message,
    triggeringEvent: `er_onboarding_now:${appointmentId}`,
  });

  console.log('\n─────────────────────────────────────────');
  console.log(`ER patient: ${ER_PATIENT_NAME} (${ER_DEPT_NAME}, ${ER_PROCEDURE}, ${ttlHours}h TTL)`);
  console.log(`ER Magic Link:\n  ${linkUrl}`);
  console.log(`📱 SMS queued → worker will send to ${ER_PATIENT_PHONE}`);
  console.log('─────────────────────────────────────────\n');
}

seedErDemo()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await notificationQueue.close();
    await pool.end();
    // BullMQ/ioredis leave background timers on the event loop even after
    // close() resolves — force-exit rather than hang, same as reset-demo.ts.
    process.exit(process.exitCode ?? 0);
  });
