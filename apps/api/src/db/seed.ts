import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── Hospital ID (fixed for dev) ──────────────────────────────────────────
    const HOSPITAL_ID = '00000000-0000-0000-0000-000000000001';

    // ─── Department ───────────────────────────────────────────────────────────
    const { rows: [dept] } = await client.query<{ id: string }>(`
      INSERT INTO departments (id, hospital_id, name)
      VALUES (gen_random_uuid(), $1, 'קרדיולוגיה')
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [HOSPITAL_ID]);

    const deptId: string = dept?.id ?? (
      await client.query<{ id: string }>(`SELECT id FROM departments WHERE name = 'קרדיולוגיה' LIMIT 1`)
    ).rows[0].id;

    // ─── Admin user ───────────────────────────────────────────────────────────
    const adminHash = await bcrypt.hash('AdminPassword123', 12);
    await client.query(`
      INSERT INTO staff_users (name, email, password_hash, role)
      VALUES ('Admin', 'admin@medassist.test', $1, 'admin')
      ON CONFLICT (email) DO NOTHING
    `, [adminHash]);

    // ─── Staff user ───────────────────────────────────────────────────────────
    const staffHash = await bcrypt.hash('StaffPassword123', 12);
    await client.query(`
      INSERT INTO staff_users (name, email, password_hash, role, department_id)
      VALUES ('Staff User', 'staff@medassist.test', $1, 'staff', $2)
      ON CONFLICT (email) DO NOTHING
    `, [staffHash, deptId]);

    // ─── Patient ──────────────────────────────────────────────────────────────
    const { rows: [patient] } = await client.query<{ id: string }>(`
      INSERT INTO patients (name, phone_number)
      VALUES ('שרה כהן', '+972501234567')
      ON CONFLICT (phone_number) DO NOTHING
      RETURNING id
    `);

    const patientId: string = patient?.id ?? (
      await client.query<{ id: string }>(`SELECT id FROM patients WHERE phone_number = '+972501234567'`)
    ).rows[0].id;

    // ─── Appointment ─────────────────────────────────────────────────────────
    const visitDatetime = new Date();
    visitDatetime.setDate(visitDatetime.getDate() + 3); // 3 days from now

    const { rows: [appt] } = await client.query<{ id: string }>(`
      INSERT INTO appointments (patient_id, department_id, procedure_type, track, visit_datetime, status)
      VALUES ($1, $2, 'pre-op-cardiac', 'elective', $3, 'scheduled')
      RETURNING id
    `, [patientId, deptId, visitDatetime.toISOString()]);

    const appointmentId = appt.id;

    // ─── Magic Link ───────────────────────────────────────────────────────────
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h
    await client.query(`
      INSERT INTO magic_links (appointment_id, token, track, expires_at)
      VALUES ($1, $2, 'elective', $3)
    `, [appointmentId, token, expiresAt.toISOString()]);

    // ─── Navigation route ─────────────────────────────────────────────────────
    const { rows: [route] } = await client.query<{ id: string }>(`
      INSERT INTO navigation_routes (department_id, name, steps_count)
      VALUES ($1, 'חניון מרכזי → קרדיולוגיה', 5)
      RETURNING id
    `, [deptId]);

    const routeId = route.id;

    const steps = [
      { order: 1, instruction: 'צא מהחניון לכיוון הכניסה הראשית' },
      { order: 2, instruction: 'פנה שמאלה בכניסה הראשית' },
      { order: 3, instruction: 'עלה במעלית לקומה 4' },
      { order: 4, instruction: 'פנה ימינה מהמעלית' },
      { order: 5, instruction: 'מחלקת הקרדיולוגיה נמצאת בסוף המסדרון' },
    ];

    for (const step of steps) {
      await client.query(`
        INSERT INTO route_steps (route_id, step_order, image_url, instruction_text)
        VALUES ($1, $2, $3, $4)
      `, [routeId, step.order, `https://placeholder.example.com/step-${step.order}.jpg`, step.instruction]);
    }

    // ─── Update dept with route ───────────────────────────────────────────────
    await client.query(
      'UPDATE departments SET navigation_route_id = $1 WHERE id = $2',
      [routeId, deptId]
    );

    // ─── Checklist Template ───────────────────────────────────────────────────
    const items = [
      { id: randomUUID(), text: 'הגע בצום של 6 שעות לפחות', category: 'fast', time_sensitive: true },
      { id: randomUUID(), text: 'הבא תעודת זהות', category: 'bring', time_sensitive: false },
      { id: randomUUID(), text: 'הבא כרטיס ביטוח בריאות', category: 'bring', time_sensitive: false },
      { id: randomUUID(), text: 'הפסק נטילת מדללי דם 48 שעות לפני', category: 'medication', time_sensitive: true },
    ];
    await client.query(`
      INSERT INTO checklist_templates (procedure_type, hospital_id, items_json)
      VALUES ('pre-op-cardiac', $1, $2)
      ON CONFLICT (procedure_type, hospital_id) DO NOTHING
    `, [HOSPITAL_ID, JSON.stringify(items)]);

    await client.query('COMMIT');

    const patientAppUrl = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173/visit';
    console.log('\n✅ Seed data inserted successfully.\n');
    console.log('─────────────────────────────────────────');
    console.log('Test accounts:');
    console.log('  Admin:  admin@medassist.test / AdminPassword123');
    console.log('  Staff:  staff@medassist.test / StaffPassword123');
    console.log('\nTest Magic Link:');
    console.log(`  ${patientAppUrl}/${token}`);
    console.log('─────────────────────────────────────────\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
