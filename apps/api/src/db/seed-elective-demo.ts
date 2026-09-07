/**
 * Seed one elective-track appointment for walking/demoing the elective flow,
 * mirroring seed-er-demo.ts. Uses מחלקת עיניים — the only department with a
 * working navigation route — and snapshots pending forms so the patient
 * form-filling flow is exercised too. Reuses the real generateToken and
 * enqueueNotification services rather than hand-rolling the token/SMS logic.
 *
 * Standalone and idempotent (upsert by phone), like seed-er-demo.ts — run
 * this *after* db:seed/db:reset-demo, since it depends on the עיניים
 * department and cataract-surgery checklist/form templates already existing.
 *
 * Optional CLI args override the default demo patient: `tsx
 * seed-elective-demo.ts "<name>" "<phone>"`. Each distinct phone number
 * seeds (and idempotently re-seeds) its own patient.
 */
import pool, { query } from './db';
import { generateToken } from '../modules/magic-links/magic-links.service';
import { enqueueNotification } from '../modules/notifications/notifications.producer';
import { notificationQueue } from '../modules/notifications/queue';

const PATIENT_NAME = process.argv[2] ?? 'טל עיון';
const PATIENT_PHONE = process.argv[3] ?? '+972529876544';
const DEPT_NAME = 'עיניים';
const PROCEDURE = 'cataract-surgery';
const TTL_HOURS = 72;

async function seedElectiveDemo() {
  const { rows: [dept] } = await query<{ id: string }>(
    `SELECT id FROM departments WHERE name = $1`,
    [DEPT_NAME]
  );
  if (!dept) {
    throw new Error(`Department '${DEPT_NAME}' not found — run db:seed / db:reset-demo first.`);
  }

  const formItems = (
    await query<{ id: string; label: string; item_type: string; required: boolean; order_index: number; section: string; sub_label: string | null; placeholder: string | null; list_item_placeholder: string | null }>(
      `SELECT id, label, item_type, required, order_index, section, sub_label, placeholder, list_item_placeholder
       FROM form_template_items
       WHERE procedure_type IS NULL OR procedure_type = $1`,
      [PROCEDURE]
    )
  ).rows;
  if (formItems.length === 0) {
    throw new Error(`No form_template_items for procedure '${PROCEDURE}' — run db:seed / db:reset-demo first.`);
  }

  const { rows: [inserted] } = await query<{ id: string }>(
    `INSERT INTO patients (name, phone_number)
     VALUES ($1, $2)
     ON CONFLICT (phone_number) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [PATIENT_NAME, PATIENT_PHONE]
  );
  const patientId: string = inserted.id;

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

  const visitDatetime = new Date(Date.now() + 3 * 24 * 3600 * 1000);

  const { rows: [appt] } = await query<{ id: string }>(
    `INSERT INTO appointments (patient_id, department_id, procedure_type, track, visit_datetime, status)
     VALUES ($1, $2, $3, 'elective', $4, 'scheduled')
     RETURNING id`,
    [patientId, dept.id, PROCEDURE, visitDatetime.toISOString()]
  );
  const appointmentId = appt.id;

  // Snapshot form items as 'pending' — she has forms to fill, none submitted yet.
  for (const fi of formItems) {
    await query(
      `INSERT INTO patient_form_items
         (appointment_id, form_template_item_id, label, item_type, required, order_index,
          section, sub_label, placeholder, list_item_placeholder, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
      [
        appointmentId, fi.id, fi.label, fi.item_type, fi.required, fi.order_index,
        fi.section, fi.sub_label, fi.placeholder, fi.list_item_placeholder,
      ]
    );
  }

  const token = await generateToken(appointmentId, 'elective', TTL_HOURS);

  const patientAppUrl = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173/visit';
  const linkUrl = `${patientAppUrl}/${token}`;
  const message = `שלום ${PATIENT_NAME}, קישור לביקורך במחלקת ${DEPT_NAME}:\n${linkUrl}`;

  await enqueueNotification({
    patientId,
    appointmentId,
    phoneNumber: PATIENT_PHONE,
    type: 'magic_link',
    message,
    triggeringEvent: `elective_onboarding_now:${appointmentId}`,
  });

  console.log('\n─────────────────────────────────────────');
  console.log(`Elective patient: ${PATIENT_NAME} (${DEPT_NAME}, ${PROCEDURE}, ${TTL_HOURS}h TTL)`);
  console.log(`Forms pending: ${formItems.length}`);
  console.log(`Magic Link:\n  ${linkUrl}`);
  console.log(`📱 Notification queued → worker will send to ${PATIENT_PHONE}`);
  console.log('─────────────────────────────────────────\n');
}

seedElectiveDemo()
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
