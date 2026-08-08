import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import type { NotificationJobData } from '../modules/notifications/queue';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const redisConn = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const notificationQueue = new Queue<NotificationJobData>('notifications', {
  connection: redisConn,
});

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
      VALUES ('ישראל ישראלי', '+972501234567')
      ON CONFLICT (phone_number) DO NOTHING
      RETURNING id
    `);

    const patientId: string = patient?.id ?? (
      await client.query<{ id: string }>(`SELECT id FROM patients WHERE phone_number = '+972501234567'`)
    ).rows[0].id;

    // ─── Reset prior seed state for this patient ────────────────────────────
    // Re-running db:seed reuses the same patient row (ON CONFLICT DO NOTHING
    // above), but previous runs' appointments were never cleaned up — leftover
    // appointments already advanced to 'navigation'/'waiting' by earlier manual
    // testing would sit alongside the freshly seeded one and cause confusion
    // about which magic link is "the" demo link. Wipe this patient's dependent
    // rows (children before parent, no ON DELETE CASCADE in the schema) so each
    // seed run leaves exactly one appointment, deterministically at 'checklist'.
    await client.query(`DELETE FROM companions WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
    await client.query(`DELETE FROM notifications WHERE patient_id = $1`, [patientId]);
    await client.query(`DELETE FROM patient_stations WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
    await client.query(`DELETE FROM waiting_queue WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
    await client.query(`DELETE FROM nav_progress WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
    await client.query(`DELETE FROM checklist_progress WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
    await client.query(`DELETE FROM magic_links WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)`, [patientId]);
    await client.query(`DELETE FROM appointments WHERE patient_id = $1`, [patientId]);

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
      INSERT INTO navigation_routes
        (from_department_id, to_department_id, name, is_default, archived, steps_count)
      SELECT NULL, $1, 'חניון מרכזי → קרדיולוגיה', TRUE, FALSE, 5
      WHERE NOT EXISTS (
        SELECT 1 FROM navigation_routes
        WHERE from_department_id IS NULL AND to_department_id = $1 AND is_default = TRUE AND archived = FALSE
      )
      RETURNING id
    `, [deptId]);

    const routeId: string = route?.id ?? (
      await client.query<{ id: string }>(
        `SELECT id FROM navigation_routes WHERE from_department_id IS NULL AND to_department_id = $1 AND is_default = TRUE AND archived = FALSE LIMIT 1`,
        [deptId],
      )
    ).rows[0].id;

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
        ON CONFLICT (route_id, step_order) DO NOTHING
      `, [routeId, step.order, `https://placeholder.example.com/step-${step.order}.jpg`, step.instruction]);
    }

    // ─── Checklist Template ───────────────────────────────────────────────────
    const items = [
      {
        id: randomUUID(), text: 'הבא תעודת זהות', category: 'bring', time_sensitive: false,
        description: 'נדרשת תעודת זהות מקורית, לא צילום', link_target: null,
      },
      {
        id: randomUUID(), text: 'הבא כרטיס ביטוח בריאות', category: 'bring', time_sensitive: false,
        description: null, link_target: null,
      },
      {
        id: randomUUID(), text: 'הגע בצום החל משעה 22:00', category: 'fast', time_sensitive: true,
        description: 'אין לאכול או לשתות החל משעה זו', link_target: null,
      },
      {
        id: randomUUID(), text: 'הפסק נטילת מדללי דם', category: 'medication', time_sensitive: true,
        description: 'חשוב - בצע עד מחר בשעה 08:00', link_target: null,
      },
      {
        id: randomUUID(), text: 'מלא טופס הסכמה מדעת', category: 'other', time_sensitive: false,
        description: 'הטפסים נשלחו אליך וממתינים להעלאה', link_target: 'forms',
      },
      {
        id: randomUUID(), text: 'הגע 30 דקות מוקדם', category: 'other', time_sensitive: false,
        description: null, link_target: null,
      },
    ];
    await client.query(`
      INSERT INTO checklist_templates (procedure_type, hospital_id, items_json)
      VALUES ('pre-op-cardiac', $1, $2)
      ON CONFLICT (procedure_type, hospital_id) DO NOTHING
    `, [HOSPITAL_ID, JSON.stringify(items)]);

    // Baseline system entities: admins may edit them but never delete them.
    await client.query(
      `UPDATE checklist_templates SET is_protected = TRUE
       WHERE procedure_type = 'pre-op-cardiac' AND hospital_id = $1`,
      [HOSPITAL_ID]
    );
    await client.query(
      `UPDATE navigation_routes SET is_protected = TRUE WHERE is_default = TRUE`
    );

    // ─── Form template items ───────────────────────────────────────────────────
    // Full 5-section intake form matching the Figma design (personal / medical /
    // financial / documents / consent). Patient-supplied fields (allergies,
    // medications, national ID) are permitted per constitution v1.1.
    const formTemplates = [
      { procedure_type: null, label: 'שם מלא', item_type: 'text_field', required: true, order_index: 0, section: 'personal', sub_label: null, placeholder: 'הזן שם מלא', list_item_placeholder: null },
      { procedure_type: null, label: 'תעודת זהות', item_type: 'text_field', required: true, order_index: 1, section: 'personal', sub_label: null, placeholder: '000000000', list_item_placeholder: null },
      { procedure_type: null, label: 'האם יש לך אלרגיות?', item_type: 'yes_no_list', required: false, order_index: 2, section: 'medical', sub_label: null, placeholder: null, list_item_placeholder: 'פרט את האלרגיה' },
      { procedure_type: null, label: 'האם אתה נוטל תרופות באופן קבוע?', item_type: 'yes_no_list', required: false, order_index: 3, section: 'medical', sub_label: null, placeholder: null, list_item_placeholder: 'שם התרופה' },
      { procedure_type: null, label: 'התחייבות כספית מקופת החולים — טופס 17', item_type: 'patient_upload', required: true, order_index: 4, section: 'financial', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: null, label: 'צילום תעודת זהות (כולל הספח)', item_type: 'patient_upload', required: true, order_index: 5, section: 'financial', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: 'pre-op-cardiac', label: 'סיכום רפואי מהרופא המפנה', item_type: 'patient_upload', required: true, order_index: 6, section: 'documents', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: 'pre-op-cardiac', label: 'תוצאות בדיקות דם עדכניות (תפקודי קרישה)', item_type: 'patient_upload', required: true, order_index: 7, section: 'documents', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: 'pre-op-cardiac', label: 'בדיקות דימות — פענוח CT / רנטגן / אולטרסאונד', item_type: 'patient_upload', required: false, order_index: 8, section: 'documents', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: 'pre-op-cardiac', label: 'הסכמה לניתוח', item_type: 'staff_upload_sign', required: true, order_index: 9, section: 'consent', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: null, label: 'טופס ויתור סודיות רפואית', item_type: 'consent', required: true, order_index: 10, section: 'consent', sub_label: 'אני מסכים/ה לשיתוף מידע רפואי עם הצוות המטפל', placeholder: null, list_item_placeholder: null },
      { procedure_type: null, label: 'הצהרת בריאות בסיסית', item_type: 'consent', required: true, order_index: 11, section: 'consent', sub_label: 'אני מצהיר/ה שהפרטים הרפואיים שמסרתי נכונים ומדויקים', placeholder: null, list_item_placeholder: null },
      { procedure_type: null, label: 'צלם כרטיס קופת חולים', item_type: 'patient_upload', required: false, order_index: 12, section: 'consent', sub_label: null, placeholder: null, list_item_placeholder: null },
    ] as const;

    for (const tmpl of formTemplates) {
      const { rows: [fti] } = await client.query<{ id: string }>(`
        INSERT INTO form_template_items
          (procedure_type, label, item_type, required, order_index, section, sub_label, placeholder, list_item_placeholder)
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
        WHERE NOT EXISTS (
          SELECT 1 FROM form_template_items
          WHERE (procedure_type IS NOT DISTINCT FROM $1) AND label = $2
        )
        RETURNING id
      `, [
        tmpl.procedure_type, tmpl.label, tmpl.item_type, tmpl.required, tmpl.order_index,
        tmpl.section, tmpl.sub_label, tmpl.placeholder, tmpl.list_item_placeholder,
      ]);

      if (!fti) continue;

      // Snapshot to the seeded appointment
      await client.query(`
        INSERT INTO patient_form_items
          (appointment_id, form_template_item_id, label, item_type, required, order_index,
           section, sub_label, placeholder, list_item_placeholder)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (appointment_id, form_template_item_id) WHERE form_template_item_id IS NOT NULL DO NOTHING
      `, [
        appointmentId, fti.id, tmpl.label, tmpl.item_type, tmpl.required, tmpl.order_index,
        tmpl.section, tmpl.sub_label, tmpl.placeholder, tmpl.list_item_placeholder,
      ]);
    }

    await client.query('COMMIT');

    const patientAppUrl = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173/visit';
    const magicLinkUrl = `${patientAppUrl}/${token}`;

    // ─── Enqueue magic link SMS ───────────────────────────────────────────────
    const PHONE_NUMBER = '+972501234567';
    const smsMessage = `שלום ישראל! הקישור שלך לביקור במחלקת קרדיולוגיה: ${magicLinkUrl}`;

    const { rows: [notif] } = await pool.query<{ id: string }>(`
      INSERT INTO notifications (patient_id, appointment_id, type, status, triggering_event)
      VALUES ($1, $2, 'magic_link', 'retrying', 'seed')
      RETURNING id
    `, [patientId, appointmentId]);

    await notificationQueue.add(`sms:magic_link:${appointmentId}`, {
      notificationId: notif.id,
      patientId,
      appointmentId,
      phoneNumber: PHONE_NUMBER,
      message: smsMessage,
      type: 'magic_link',
      retryCount: 0,
    });

    console.log('\n✅ Seed data inserted successfully.\n');
    console.log('─────────────────────────────────────────');
    console.log('Test accounts:');
    console.log('  Admin:  admin@medassist.test / AdminPassword123');
    console.log('  Staff:  staff@medassist.test / StaffPassword123');
    console.log('\nTest Magic Link:');
    console.log(`  ${magicLinkUrl}`);
    console.log('\n📱 SMS queued → worker will send to', PHONE_NUMBER);
    console.log('─────────────────────────────────────────\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    await notificationQueue.close();
    await redisConn.quit();
  }
}

seed();
