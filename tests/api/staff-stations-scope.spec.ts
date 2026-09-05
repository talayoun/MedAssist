import { test, expect, APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

/**
 * E10 — station writes had no department scoping, so any staff user could add,
 * reorder, or complete stations for a patient in another department. Mirrors the
 * rule queue.service already enforces: 'staff' confined to their own department,
 * admin unrestricted, out-of-scope reads as 404.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN = { email: 'admin@medassist.test', password: 'AdminPassword123' };
const SCOPED_STAFF = { email: 'staff@medassist.test', password: 'StaffPassword123' };

const FOREIGN_DEPT_NAME = 'אורתופדיה (בדיקת הרשאות)';

async function login(request: APIRequestContext, email: string, password: string): Promise<void> {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
  expect(res.status(), await res.text()).toBe(200);
}

async function createAppointment(request: APIRequestContext, departmentId: string): Promise<string> {
  const res = await request.post(`${API_URL}/api/staff/appointments`, {
    data: {
      patient_name: 'מרים גולדברג',
      phone_number: `+97250${Date.now().toString().slice(-7)}`,
      department_id: departmentId,
      procedure_type: 'pre-op-cardiac',
      visit_datetime: new Date(Date.now() + 86_400_000).toISOString(),
      custom_items: [],
      suppressed_template_item_ids: [],
      send_now: false,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).appointment_id;
}

test.describe('staff stations — department scope', () => {
  let ownDeptId: string;
  let foreignDeptId: string;

  // Only one department is seeded, so the cross-department case needs a second
  // one. There is no admin API to create departments yet (that is M8).
  test.beforeAll(async ({ request }) => {
    test.skip(!process.env.DATABASE_URL, 'needs DATABASE_URL (run under doppler)');

    await login(request, ADMIN.email, ADMIN.password);
    const { departments } = await (await request.get(`${API_URL}/api/staff/departments`)).json();
    const own = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
    expect(own, 'seeded department must exist').toBeTruthy();
    ownDeptId = own.id;

    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO departments (hospital_id, name)
         SELECT hospital_id, $1 FROM departments WHERE id = $2
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [FOREIGN_DEPT_NAME, ownDeptId]
      );
      foreignDeptId =
        rows[0]?.id ??
        (await db.query<{ id: string }>('SELECT id FROM departments WHERE name = $1', [FOREIGN_DEPT_NAME]))
          .rows[0].id;
    } finally {
      await db.end();
    }
    expect(foreignDeptId).toBeTruthy();
  });

  test('scoped staff cannot add a station to another department\'s patient', async ({ request }) => {
    await login(request, ADMIN.email, ADMIN.password);
    const foreignAppt = await createAppointment(request, foreignDeptId);

    await login(request, SCOPED_STAFF.email, SCOPED_STAFF.password);
    const res = await request.post(`${API_URL}/api/staff/patients/${foreignAppt}/stations`, {
      data: { department_id: ownDeptId, order_index: 1 },
    });

    expect(res.status(), await res.text()).toBe(404);
  });

  test('scoped staff cannot reorder another department\'s patient stations', async ({ request }) => {
    await login(request, ADMIN.email, ADMIN.password);
    const foreignAppt = await createAppointment(request, foreignDeptId);
    const added = await request.post(`${API_URL}/api/staff/patients/${foreignAppt}/stations`, {
      data: { department_id: foreignDeptId, order_index: 1 },
    });
    expect(added.status(), await added.text()).toBe(201);
    const stationId = (await added.json()).station_id;

    await login(request, SCOPED_STAFF.email, SCOPED_STAFF.password);
    const res = await request.put(`${API_URL}/api/staff/patients/${foreignAppt}/stations/order`, {
      data: { station_ids: [stationId] },
    });

    expect(res.status(), await res.text()).toBe(404);
  });

  test('scoped staff cannot complete another department\'s patient station', async ({ request }) => {
    await login(request, ADMIN.email, ADMIN.password);
    const foreignAppt = await createAppointment(request, foreignDeptId);
    const added = await request.post(`${API_URL}/api/staff/patients/${foreignAppt}/stations`, {
      data: { department_id: foreignDeptId, order_index: 1 },
    });
    expect(added.status(), await added.text()).toBe(201);
    const stationId = (await added.json()).station_id;

    await login(request, SCOPED_STAFF.email, SCOPED_STAFF.password);
    const res = await request.patch(
      `${API_URL}/api/staff/patients/${foreignAppt}/stations/${stationId}`,
      { data: { status: 'complete' } }
    );

    expect(res.status(), await res.text()).toBe(404);
  });

  // ─── The scoping must not break the legitimate cases ──────────────────────

  test('scoped staff can still manage stations for their own patient', async ({ request }) => {
    await login(request, ADMIN.email, ADMIN.password);
    const ownAppt = await createAppointment(request, ownDeptId);

    await login(request, SCOPED_STAFF.email, SCOPED_STAFF.password);

    // Routing the patient onward to a different department is normal and allowed:
    // the check is on the appointment's department, not the station's.
    const added = await request.post(`${API_URL}/api/staff/patients/${ownAppt}/stations`, {
      data: { department_id: foreignDeptId, order_index: 1 },
    });
    expect(added.status(), await added.text()).toBe(201);
    const stationId = (await added.json()).station_id;

    const reordered = await request.put(`${API_URL}/api/staff/patients/${ownAppt}/stations/order`, {
      data: { station_ids: [stationId] },
    });
    expect(reordered.status(), await reordered.text()).toBe(200);

    const completed = await request.patch(
      `${API_URL}/api/staff/patients/${ownAppt}/stations/${stationId}`,
      { data: { status: 'complete' } }
    );
    expect(completed.status(), await completed.text()).toBe(200);
    expect((await completed.json()).status).toBe('complete');
  });

  test('admin is not restricted by department', async ({ request }) => {
    await login(request, ADMIN.email, ADMIN.password);
    const foreignAppt = await createAppointment(request, foreignDeptId);

    const res = await request.post(`${API_URL}/api/staff/patients/${foreignAppt}/stations`, {
      data: { department_id: foreignDeptId, order_index: 1 },
    });
    expect(res.status(), await res.text()).toBe(201);
  });
});
