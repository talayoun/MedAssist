import { Pool } from 'pg';
import { randomUUID } from 'crypto';

// One-off demo seeder for BO poster screenshots. Assumes `pnpm --filter api
// db:seed` already ran (departments, checklist_templates, navigation_routes,
// form_template_items must exist). Does not touch Redis/notifications —
// just DB rows so the Queue and PatientDetail screens look populated.

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const HOSPITAL_ID = '00000000-0000-0000-0000-000000000001';

type Demo = {
  name: string;
  phone: string;
  track: 'elective' | 'er';
  phase: 'link_sent' | 'checklist' | 'navigation' | 'waiting' | 'done';
  formsProgress: 'none' | 'partial' | 'all';
  stationsDone: number; // of 3
};

const demos: Demo[] = [
  { name: 'דוד כהן', phone: '+972501112221', track: 'elective', phase: 'link_sent', formsProgress: 'none', stationsDone: 0 },
  { name: 'מיכל לוי', phone: '+972501112222', track: 'elective', phase: 'checklist', formsProgress: 'partial', stationsDone: 0 },
  { name: 'יוסי מזרחי', phone: '+972501112223', track: 'elective', phase: 'checklist', formsProgress: 'all', stationsDone: 0 },
  { name: 'רותי אברהם', phone: '+972501112224', track: 'elective', phase: 'navigation', formsProgress: 'all', stationsDone: 1 },
  { name: 'אבי פרץ', phone: '+972501112225', track: 'er', phase: 'navigation', formsProgress: 'partial', stationsDone: 0 },
  { name: 'שרה ביטון', phone: '+972501112226', track: 'elective', phase: 'waiting', formsProgress: 'all', stationsDone: 2 },
  { name: 'משה גבאי', phone: '+972501112227', track: 'er', phase: 'waiting', formsProgress: 'partial', stationsDone: 1 },
  { name: 'נועה שלום', phone: '+972501112228', track: 'elective', phase: 'waiting', formsProgress: 'all', stationsDone: 3 },
  { name: 'איתן דהן', phone: '+972501112229', track: 'elective', phase: 'done', formsProgress: 'all', stationsDone: 3 },
  { name: 'טל אשכנזי', phone: '+972501112230', track: 'elective', phase: 'link_sent', formsProgress: 'none', stationsDone: 0 },
  { name: 'הדס נחום', phone: '+972501112231', track: 'elective', phase: 'checklist', formsProgress: 'none', stationsDone: 0 },
  { name: 'עומר סבג', phone: '+972501112232', track: 'er', phase: 'checklist', formsProgress: 'partial', stationsDone: 0 },
  { name: 'ליאור פלד', phone: '+972501112233', track: 'elective', phase: 'checklist', formsProgress: 'all', stationsDone: 0 },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [dept] } = await client.query<{ id: string }>(
      `SELECT id FROM departments WHERE name = 'קרדיולוגיה' LIMIT 1`
    );
    if (!dept) {
      throw new Error('Base seed missing: run `pnpm --filter api db:seed` first.');
    }
    const deptId = dept.id;

    const { rows: [tmpl] } = await client.query<{ id: string }>(
      `SELECT id FROM checklist_templates WHERE procedure_type = 'pre-op-cardiac' AND hospital_id = $1 LIMIT 1`,
      [HOSPITAL_ID]
    );
    if (!tmpl) {
      throw new Error('Base seed missing checklist_templates: run `pnpm --filter api db:seed` first.');
    }

    const { rows: [route] } = await client.query<{ id: string }>(
      `SELECT id FROM navigation_routes WHERE to_department_id = $1 AND is_default = TRUE AND archived = FALSE LIMIT 1`,
      [deptId]
    );
    if (!route) {
      throw new Error('Base seed missing navigation_routes: run `pnpm --filter api db:seed` first.');
    }

    const formItems = (
      await client.query<{ id: string; label: string; item_type: string; required: boolean; order_index: number; section: string; sub_label: string | null; placeholder: string | null; list_item_placeholder: string | null }>(
        `SELECT id, label, item_type, required, order_index, section, sub_label, placeholder, list_item_placeholder
         FROM form_template_items
         WHERE procedure_type IS NULL OR procedure_type = 'pre-op-cardiac'`
      )
    ).rows;

    const visitBase = new Date();

    for (const [i, d] of demos.entries()) {
      const { rows: [patient] } = await client.query<{ id: string }>(
        `INSERT INTO patients (name, phone_number)
         VALUES ($1, $2)
         ON CONFLICT (phone_number) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [d.name, d.phone]
      );
      const patientId = patient.id;

      // Clean any prior run's rows for this patient (mirrors seed.ts pattern).
      await client.query(`DELETE FROM patient_form_items WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
      await client.query(`DELETE FROM patient_stations WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
      await client.query(`DELETE FROM waiting_queue WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
      await client.query(`DELETE FROM nav_progress WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
      await client.query(`DELETE FROM checklist_progress WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
      await client.query(`DELETE FROM magic_links WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
      await client.query(`DELETE FROM appointments WHERE patient_id = $1`, [patientId]);

      const visitDatetime = new Date(visitBase);
      visitDatetime.setDate(visitDatetime.getDate() + (i % 5) - 1); // spread past/future

      const { rows: [appt] } = await client.query<{ id: string }>(
        `INSERT INTO appointments
           (patient_id, department_id, procedure_type, track, visit_datetime, status, current_phase, navigation_route_id)
         VALUES ($1, $2, 'pre-op-cardiac', $3::appointment_track, $4, 'scheduled', $5::appointment_phase, $6)
         RETURNING id`,
        [patientId, deptId, d.track, visitDatetime.toISOString(), d.phase, route.id]
      );
      const appointmentId = appt.id;

      await client.query(
        `INSERT INTO magic_links (appointment_id, token, track, expires_at, used_at)
         VALUES ($1, $2, $3::appointment_track, $4, $5)`,
        [appointmentId, randomUUID(), d.track, new Date(Date.now() + 72 * 3600 * 1000).toISOString(), d.phase === 'link_sent' ? null : new Date().toISOString()]
      );

      // Checklist progress once past the checklist phase.
      if (d.phase !== 'link_sent') {
        await client.query(
          `INSERT INTO checklist_progress (patient_id, appointment_id, template_id, completed_items_json)
           VALUES ($1, $2, $3, '[]'::jsonb)`,
          [patientId, appointmentId, tmpl.id]
        );
      }

      // Nav progress once past the navigation phase.
      if (d.phase === 'navigation' || d.phase === 'waiting' || d.phase === 'done') {
        await client.query(
          `INSERT INTO nav_progress (appointment_id, current_step) VALUES ($1, $2)`,
          [appointmentId, d.phase === 'navigation' ? 3 : 5]
        );
      }

      // Waiting queue + patient_stations once in waiting/done.
      if (d.phase === 'waiting' || d.phase === 'done') {
        await client.query(
          `INSERT INTO waiting_queue (appointment_id, department_id, arrival_time, estimated_wait_minutes, status)
           VALUES ($1, $2, NOW() - INTERVAL '20 minutes', $3, $4::waiting_status)`,
          [appointmentId, deptId, 15 + i * 3, d.phase === 'done' ? 'done' : (i % 2 === 0 ? 'waiting' : 'in_treatment')]
        );

        for (let s = 0; s < 3; s++) {
          const complete = s < d.stationsDone;
          await client.query(
            `INSERT INTO patient_stations (appointment_id, department_id, order_index, status, completed_at)
             VALUES ($1, $2, $3, $4::station_status, $5)`,
            [appointmentId, deptId, s, complete ? 'complete' : 'pending', complete ? new Date().toISOString() : null]
          );
        }
      }

      // Snapshot form items with varied submission status.
      for (const fi of formItems) {
        let status: 'pending' | 'staff_uploaded' | 'patient_submitted' = 'pending';
        if (d.formsProgress === 'all') status = 'patient_submitted';
        else if (d.formsProgress === 'partial' && fi.order_index % 2 === 0) status = 'patient_submitted';

        await client.query(
          `INSERT INTO patient_form_items
             (appointment_id, form_template_item_id, label, item_type, required, order_index,
              section, sub_label, placeholder, list_item_placeholder, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            appointmentId, fi.id, fi.label, fi.item_type, fi.required, fi.order_index,
            fi.section, fi.sub_label, fi.placeholder, fi.list_item_placeholder, status,
          ]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`\n✅ Seeded ${demos.length} demo patients across all phases for poster screenshots.\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Demo seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
