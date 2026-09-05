import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import type { NotificationJobData } from '../modules/notifications/queue';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { uploadStepImage } from '../services/s3';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Demo route: the one path we make perfect for demo day ──────────────────
// Photographed at Wolfson: main entrance → ophthalmology reception. The images
// live in the repo (not OneDrive) so the seed behaves the same on every machine.
const DEMO_DEPT = 'עיניים';
const DEMO_PROCEDURE = 'cataract-surgery';
const DEMO_ASSETS_DIR = process.env.DEMO_ASSETS_DIR
  ?? join(__dirname, 'demo-assets');

const DEMO_STEPS = [
  'היכנס לבניין הראשי, לוח המחלקות בקומת הקרקע ממולך',
  'עבור את דלתות הזכוכית לכיוון החצר הפנימית',
  'פנה למסדרון הארוך, לצד מכונות השתייה',
  'המשך ישר עד לשילוט "עזר מציון"',
  'בסוף המסדרון פנה לכיוון המעליות',
  'עבור בדלת למסדרון ההמתנה של מחלקת עיניים',
  'הגעת! דלפק הקבלה נמצא מולך',
] as const;

/**
 * Upload the seven demo photos and return their public URLs.
 *
 * Runs before the seed transaction opens: each upload is an S3 round-trip, and
 * holding a pooled Postgres connection open across network calls is how you
 * starve the pool under load.
 *
 * Returns null when the assets are missing so the seed degrades to placeholder
 * URLs rather than failing outright on a machine without the photos.
 */
async function uploadDemoStepImages(): Promise<string[] | null> {
  try {
    const urls: string[] = [];
    for (let i = 1; i <= DEMO_STEPS.length; i++) {
      const buffer = await readFile(join(DEMO_ASSETS_DIR, `${i}.jpeg`));
      urls.push(await uploadStepImage(buffer, 'image/jpeg'));
    }
    return urls;
  } catch (err) {
    console.warn(`
⚠️  Demo step images unavailable (${DEMO_ASSETS_DIR}) — seeding placeholder URLs instead.`);
    console.warn(`   ${err instanceof Error ? err.message : String(err)}
`);
    return null;
  }
}

const redisConn = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const notificationQueue = new Queue<NotificationJobData>('notifications', {
  connection: redisConn,
});

async function seed() {
  const demoStepUrls = await uploadDemoStepImages();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── Hospital ID (fixed for dev) ──────────────────────────────────────────
    const HOSPITAL_ID = '00000000-0000-0000-0000-000000000001';

    // ─── Departments ──────────────────────────────────────────────────────────
    // קרדיולוגיה stays: twelve test files look it up by name. עיניים is the demo
    // department — it is where the photographed route actually ends.
    async function upsertDepartment(
      name: string,
      address: string,
      parking: string,
      transit: string,
      lat: number,
      lng: number,
    ): Promise<string> {
      const { rows: [row] } = await client.query<{ id: string }>(`
        INSERT INTO departments (id, hospital_id, name, address, parking_info, transit_info, map_lat, map_lng)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (name) DO UPDATE SET
          address = EXCLUDED.address,
          parking_info = EXCLUDED.parking_info,
          transit_info = EXCLUDED.transit_info,
          map_lat = EXCLUDED.map_lat,
          map_lng = EXCLUDED.map_lng
        RETURNING id
      `, [HOSPITAL_ID, name, address, parking, transit, lat, lng]);
      return row.id;
    }

    const cardioDeptId = await upsertDepartment(
      'קרדיולוגיה',
      'המרכז הרפואי וולפסון, רחוב הלוחמים 62, חולון',
      'חניון מרכזי בכניסה הראשית, שעתיים ראשונות ללא תשלום',
      'קווי אוטובוס 3, 89 ו-131 לתחנת בית החולים וולפסון',
      32.0192, 34.7614,
    );

    const demoDeptId = await upsertDepartment(
      DEMO_DEPT,
      'המרכז הרפואי וולפסון, רחוב הלוחמים 62, חולון, בניין ראשי, מחלקת עיניים',
      'חניון מרכזי בכניסה הראשית, שעתיים ראשונות ללא תשלום',
      'קווי אוטובוס 3, 89 ו-131 לתחנת בית החולים וולפסון',
      32.0192, 34.7614,
    );

    // The seeded demo patient belongs to עיניים.
    const deptId = demoDeptId;

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
    `, [staffHash, cardioDeptId]);

    // Ophthalmology staff member — the account used to drive the demo.
    await client.query(`
      INSERT INTO staff_users (name, email, password_hash, role, department_id)
      VALUES ('רחל כהן', 'eyes@medassist.test', $1, 'staff', $2)
      ON CONFLICT (email) DO NOTHING
    `, [staffHash, demoDeptId]);

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
      VALUES ($1, $2, $4, 'elective', $3, 'scheduled')
      RETURNING id
    `, [patientId, deptId, visitDatetime.toISOString(), DEMO_PROCEDURE]);

    const appointmentId = appt.id;

    // ─── Magic Link ───────────────────────────────────────────────────────────
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h
    await client.query(`
      INSERT INTO magic_links (appointment_id, token, track, expires_at)
      VALUES ($1, $2, 'elective', $3)
    `, [appointmentId, token, expiresAt.toISOString()]);

    // ─── Navigation routes ────────────────────────────────────────────────────
    // Two routes. The demo one (עיניים) carries the real photographed steps; the
    // cardiology one keeps its placeholders because the API tests assert against
    // a default route existing for that department, not against its contents.
    async function upsertDefaultRoute(
      toDeptId: string,
      name: string,
      stepsCount: number,
    ): Promise<string> {
      const { rows: [row] } = await client.query<{ id: string }>(`
        INSERT INTO navigation_routes
          (from_department_id, to_department_id, name, is_default, archived, steps_count)
        SELECT NULL, $1, $2, TRUE, FALSE, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM navigation_routes
          WHERE from_department_id IS NULL AND to_department_id = $1 AND is_default = TRUE AND archived = FALSE
        )
        RETURNING id
      `, [toDeptId, name, stepsCount]);

      if (row) return row.id;

      const { rows: [existing] } = await client.query<{ id: string }>(
        `SELECT id FROM navigation_routes
         WHERE from_department_id IS NULL AND to_department_id = $1 AND is_default = TRUE AND archived = FALSE
         LIMIT 1`,
        [toDeptId],
      );
      return existing.id;
    }

    const demoRouteId = await upsertDefaultRoute(demoDeptId, 'כניסה ראשית → מחלקת עיניים', DEMO_STEPS.length);
    const cardioRouteId = await upsertDefaultRoute(cardioDeptId, 'חניון מרכזי → קרדיולוגיה', 5);

    // Demo route: replace the steps wholesale. The photos are the point of this
    // route, so a re-seed must not leave a half-updated mix of old and new.
    await client.query(`DELETE FROM route_steps WHERE route_id = $1`, [demoRouteId]);
    for (const [idx, instruction] of DEMO_STEPS.entries()) {
      await client.query(`
        INSERT INTO route_steps (route_id, step_order, image_url, instruction_text)
        VALUES ($1, $2, $3, $4)
      `, [
        demoRouteId,
        idx + 1,
        demoStepUrls?.[idx] ?? `https://placeholder.example.com/step-${idx + 1}.jpg`,
        instruction,
      ]);
    }
    await client.query(
      `UPDATE navigation_routes SET steps_count = $2 WHERE id = $1`,
      [demoRouteId, DEMO_STEPS.length],
    );

    const cardioSteps = [
      'צא מהחניון לכיוון הכניסה הראשית',
      'פנה שמאלה בכניסה הראשית',
      'עלה במעלית לקומה 4',
      'פנה ימינה מהמעלית',
      'מחלקת הקרדיולוגיה נמצאת בסוף המסדרון',
    ];
    for (const [idx, instruction] of cardioSteps.entries()) {
      await client.query(`
        INSERT INTO route_steps (route_id, step_order, image_url, instruction_text)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (route_id, step_order) DO NOTHING
      `, [cardioRouteId, idx + 1, `https://placeholder.example.com/step-${idx + 1}.jpg`, instruction]);
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

    // The demo checklist. Cataract surgery is done under sedation, so fasting and
    // an escort home are the two items that actually matter to the patient.
    const demoItems = [
      {
        id: randomUUID(), text: 'הבא תעודת זהות', category: 'bring', time_sensitive: false,
        description: 'נדרשת תעודת זהות מקורית, לא צילום', link_target: null,
      },
      {
        id: randomUUID(), text: 'הבא טופס 17 מקופת החולים', category: 'bring', time_sensitive: false,
        description: 'ללא הטופס לא ניתן לבצע את הקבלה', link_target: null,
      },
      {
        id: randomUUID(), text: 'הבא את המשקפיים ורשימת טיפות העיניים שלך', category: 'bring', time_sensitive: false,
        description: null, link_target: null,
      },
      {
        id: randomUUID(), text: 'הגע בצום החל מחצות', category: 'fast', time_sensitive: true,
        description: 'אין לאכול או לשתות החל משעה זו', link_target: null,
      },
      {
        id: randomUUID(), text: 'המשך בטיפות העיניים לפי הנחיית הרופא', category: 'medication', time_sensitive: true,
        description: 'אל תפסיק טיפול ללא אישור הרופא המטפל', link_target: null,
      },
      {
        id: randomUUID(), text: 'ארגן מלווה שיחזיר אותך הביתה', category: 'other', time_sensitive: false,
        description: 'לאחר הניתוח לא ניתן לנהוג', link_target: null,
      },
      {
        id: randomUUID(), text: 'מלא את הטפסים הדיגיטליים', category: 'other', time_sensitive: false,
        description: 'הטפסים ממתינים לך באפליקציה', link_target: 'forms',
      },
      {
        id: randomUUID(), text: 'הגע 30 דקות מוקדם', category: 'other', time_sensitive: false,
        description: null, link_target: null,
      },
    ];
    await client.query(`
      INSERT INTO checklist_templates (procedure_type, hospital_id, items_json)
      VALUES ($3, $1, $2)
      ON CONFLICT (procedure_type, hospital_id) DO UPDATE SET items_json = EXCLUDED.items_json
    `, [HOSPITAL_ID, JSON.stringify(demoItems), DEMO_PROCEDURE]);

    // Second, unused template: kept separate from pre-op-cardiac (which is
    // referenced by the seeded appointment) so the "protected" flag and the
    // "in active use" state never land on the same row in tests/dev data.
    await client.query(`
      INSERT INTO checklist_templates (procedure_type, hospital_id, items_json)
      VALUES ('general-baseline', $1, $2)
      ON CONFLICT (procedure_type, hospital_id) DO NOTHING
    `, [HOSPITAL_ID, JSON.stringify(items)]);

    // Baseline system entity: admins may edit it but never delete it.
    // Explicitly reset pre-op-cardiac too, in case an older seed run (or this
    // script re-run against an existing DB) left it protected.
    await client.query(
      `UPDATE checklist_templates SET is_protected = FALSE
       WHERE procedure_type = 'pre-op-cardiac' AND hospital_id = $1`,
      [HOSPITAL_ID]
    );
    await client.query(
      `UPDATE checklist_templates SET is_protected = TRUE
       WHERE procedure_type = 'general-baseline' AND hospital_id = $1`,
      [HOSPITAL_ID]
    );
    // Protect the cardiology baseline only. The demo route must stay editable:
    // "look how configurable this is" is part of the admin-screens segment, and a
    // protected route also makes the protected-guard fire before the in-active-use
    // guard that the admin route tests assert against.
    await client.query(
      `UPDATE navigation_routes SET is_protected = (id = $1)
       WHERE is_default = TRUE AND archived = FALSE`,
      [cardioRouteId],
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
      { procedure_type: null, label: 'התחייבות כספית מקופת החולים, טופס 17', item_type: 'patient_upload', required: true, order_index: 4, section: 'financial', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: null, label: 'צילום תעודת זהות (כולל הספח)', item_type: 'patient_upload', required: true, order_index: 5, section: 'financial', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: 'pre-op-cardiac', label: 'סיכום רפואי מהרופא המפנה', item_type: 'patient_upload', required: true, order_index: 6, section: 'documents', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: 'pre-op-cardiac', label: 'תוצאות בדיקות דם עדכניות (תפקודי קרישה)', item_type: 'patient_upload', required: true, order_index: 7, section: 'documents', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: 'pre-op-cardiac', label: 'בדיקות דימות: פענוח CT / רנטגן / אולטרסאונד', item_type: 'patient_upload', required: false, order_index: 8, section: 'documents', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: 'pre-op-cardiac', label: 'הסכמה לניתוח', item_type: 'staff_upload_sign', required: true, order_index: 9, section: 'consent', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: DEMO_PROCEDURE, label: 'סיכום רפואי מרופא העיניים המפנה', item_type: 'patient_upload', required: true, order_index: 6, section: 'documents', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: DEMO_PROCEDURE, label: 'תוצאות בדיקת ביומטריה ולחץ תוך-עיני', item_type: 'patient_upload', required: true, order_index: 7, section: 'documents', sub_label: null, placeholder: null, list_item_placeholder: null },
      { procedure_type: DEMO_PROCEDURE, label: 'הסכמה לניתוח קטרקט', item_type: 'staff_upload_sign', required: true, order_index: 9, section: 'consent', sub_label: null, placeholder: null, list_item_placeholder: null },
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

      // The insert above returns nothing when the template already exists, so on a
      // re-seed against a live database every item was skipped and the demo
      // appointment ended up with no forms at all. Fall back to looking it up.
      const templateItemId: string | undefined = fti?.id ?? (
        await client.query<{ id: string }>(
          `SELECT id FROM form_template_items
           WHERE (procedure_type IS NOT DISTINCT FROM $1) AND label = $2
           LIMIT 1`,
          [tmpl.procedure_type, tmpl.label],
        )
      ).rows[0]?.id;
      if (!templateItemId) continue;

      // Only the demo procedure's items (and the universal ones) belong on the
      // seeded appointment — a cardiac consent form on an eye patient is exactly
      // the kind of detail a visitor notices.
      if (tmpl.procedure_type !== null && tmpl.procedure_type !== DEMO_PROCEDURE) continue;

      // Snapshot to the seeded appointment
      await client.query(`
        INSERT INTO patient_form_items
          (appointment_id, form_template_item_id, label, item_type, required, order_index,
           section, sub_label, placeholder, list_item_placeholder)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (appointment_id, form_template_item_id) WHERE form_template_item_id IS NOT NULL DO NOTHING
      `, [
        appointmentId, templateItemId, tmpl.label, tmpl.item_type, tmpl.required, tmpl.order_index,
        tmpl.section, tmpl.sub_label, tmpl.placeholder, tmpl.list_item_placeholder,
      ]);
    }

    // Baseline system entity: admins may edit it but never deactivate it.
    await client.query(
      `UPDATE form_template_items SET is_protected = TRUE
       WHERE procedure_type IS NULL AND label = 'שם מלא'`
    );

    await client.query('COMMIT');

    const patientAppUrl = process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:5173/visit';
    const magicLinkUrl = `${patientAppUrl}/${token}`;

    // ─── Enqueue magic link SMS ───────────────────────────────────────────────
    const PHONE_NUMBER = '+972501234567';
    const smsMessage = `שלום ישראל! הקישור שלך לביקור במחלקת ${DEMO_DEPT}: ${magicLinkUrl}`;

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
