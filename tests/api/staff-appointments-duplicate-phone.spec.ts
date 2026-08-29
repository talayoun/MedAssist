import { test, expect, APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

/**
 * Two bookings for the same phone number at the same moment.
 *
 * The patient upsert was a SELECT followed by an INSERT with nothing between
 * them: both requests saw no existing patient, both inserted, and the second
 * came back as a raw 500 from the unique constraint on phone_number. The insert
 * carries its own conflict clause now, so the loser reuses the row.
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function departmentId(request: APIRequestContext): Promise<string> {
  const { departments } = await (await request.get('/api/staff/departments')).json();
  const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
  expect(dept, 'seeded department must exist').toBeTruthy();
  return dept.id;
}

test.describe('POST /api/staff/appointments, same phone twice', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(res.status(), 'admin login').toBe(200);
  });

  /**
   * Deliberately held open rather than fired in volume: two parallel POSTs only
   * lose the race sometimes, and a test that reproduces a bug one run in three is
   * not evidence of anything. Another connection inserts the patient and sits on
   * it uncommitted while the request is in flight, which is the interleaving.
   */
  test('loses the patient insert race to another connection and still books', async ({ request }) => {
    test.skip(!process.env.DATABASE_URL, 'needs DATABASE_URL (run under doppler)');

    const deptId = await departmentId(request);
    const phone = `+97250${Date.now().toString().slice(-7)}`;

    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();

    try {
      await db.query('BEGIN');
      await db.query('INSERT INTO patients (name, phone_number) VALUES ($1, $2)', ['ישראל ישראלי', phone]);

      const pending = request.post('/api/staff/appointments', {
        data: {
          patient_name: 'ישראל ישראלי',
          phone_number: phone,
          department_id: deptId,
          procedure_type: 'pre-op-cardiac',
          visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          custom_items: [],
          suppressed_template_item_ids: [],
          send_now: true,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));
      await db.query('COMMIT');

      const res = await pending;
      expect(res.status(), await res.text()).toBe(201);
    } finally {
      await db.query('ROLLBACK').catch(() => undefined);
      await db.end();
    }
  });

  test('two simultaneous bookings for one phone both succeed', async ({ request }) => {
    const deptId = await departmentId(request);
    const phone = `+97250${Date.now().toString().slice(-7)}`;

    const body = (name: string) => ({
      data: {
        patient_name: name,
        phone_number: phone,
        department_id: deptId,
        procedure_type: 'pre-op-cardiac',
        visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        custom_items: [],
        suppressed_template_item_ids: [],
        send_now: true,
      },
    });

    // Fired together on purpose: this is the interleaving that used to 500.
    const [first, second] = await Promise.all([
      request.post('/api/staff/appointments', body('ישראל ישראלי')),
      request.post('/api/staff/appointments', body('ישראל ישראלי')),
    ]);

    expect(first.status(), await first.text()).toBe(201);
    expect(second.status(), await second.text()).toBe(201);
  });

  test('booking the same phone again reuses the patient and updates the name', async ({ request }) => {
    const deptId = await departmentId(request);
    const phone = `+97250${(Date.now() + 1).toString().slice(-7)}`;

    const first = await request.post('/api/staff/appointments', {
      data: {
        patient_name: 'רחל כהן',
        phone_number: phone,
        department_id: deptId,
        procedure_type: 'pre-op-cardiac',
        visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        custom_items: [],
        suppressed_template_item_ids: [],
        send_now: true,
      },
    });
    expect(first.status()).toBe(201);
    const firstId = (await first.json()).appointment_id;

    const second = await request.post('/api/staff/appointments', {
      data: {
        patient_name: 'רחל כהן-לוי',
        phone_number: phone,
        department_id: deptId,
        procedure_type: 'pre-op-cardiac',
        visit_datetime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        custom_items: [],
        suppressed_template_item_ids: [],
        send_now: true,
      },
    });
    expect(second.status()).toBe(201);
    const secondId = (await second.json()).appointment_id;

    // One patient row behind both visits, so the corrected name shows on the
    // earlier appointment too. Scoped to these two ids: other specs seed
    // patients by the same name and would make a queue-wide check meaningless.
    for (const id of [firstId, secondId]) {
      const detail = await (await request.get(`/api/staff/appointments/${id}`)).json();
      expect(detail.patient_name).toBe('רחל כהן-לוי');
    }
  });
});
