import { test, expect, APIRequestContext, request as playwrightRequest } from '@playwright/test';
import { Client } from 'pg';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * E3 — two devices loading the Waiting screen for the first time at the same moment.
 *
 * The waiting_queue row is created lazily on first GET. appointment_id is UNIQUE
 * (migration 006), so without ON CONFLICT the loser of the race gets a raw
 * duplicate-key 500 instead of the queue status.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate
 *   pnpm --filter api db:seed
 *   pnpm --filter api dev
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

const CONCURRENT_LOADS = 10;

async function loginAsAdmin(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function createAppointmentWithIds(
  request: APIRequestContext
): Promise<{ token: string; appointmentId: string; departmentId: string }> {
  const deptRes = await request.get('/api/staff/departments');
  const { departments } = await deptRes.json();
  const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
  expect(dept, 'seeded department must exist').toBeTruthy();

  const res = await request.post('/api/staff/appointments', {
    data: {
      patient_name: 'רחל כהן',
      phone_number: `+97252${Date.now().toString().slice(-7)}`,
      department_id: dept.id,
      procedure_type: 'pre-op-cardiac',
      visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      custom_items: [],
      suppressed_template_item_ids: [],
      send_now: true,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  expect(body.magic_link_token).toBeTruthy();
  return { token: body.magic_link_token, appointmentId: body.appointment_id, departmentId: dept.id };
}

async function createAppointment(request: APIRequestContext): Promise<string> {
  const deptRes = await request.get('/api/staff/departments');
  const { departments } = await deptRes.json();
  const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
  expect(dept, 'seeded department must exist').toBeTruthy();

  const res = await request.post('/api/staff/appointments', {
    data: {
      patient_name: 'רחל כהן',
      phone_number: `+97252${Date.now().toString().slice(-7)}`,
      department_id: dept.id,
      procedure_type: 'pre-op-cardiac',
      visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      custom_items: [],
      suppressed_template_item_ids: [],
      // send_now is required for the response to carry a usable token
      send_now: true,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  expect(body.magic_link_token).toBeTruthy();
  return body.magic_link_token;
}

test.describe('waiting: concurrent first load', () => {
  test('simultaneous first loads all return the queue status, never a 500', async ({ request }) => {
    await loginAsAdmin(request);
    const token = await createAppointment(request);

    // One APIRequestContext serializes its requests over a single connection, so
    // reusing the `request` fixture here would never actually race. Each simulated
    // device gets its own context — that is what puts the inserts in flight together.
    const devices = await Promise.all(
      Array.from({ length: CONCURRENT_LOADS }, () => playwrightRequest.newContext({ baseURL: API_URL }))
    );

    try {
      // Fresh appointment: no waiting_queue row exists yet, so every one of these
      // races to create it.
      const responses = await Promise.all(
        devices.map((device) => device.get(`/api/visit/${token}/waiting`))
      );

      const statuses = responses.map((r) => r.status());
      expect(statuses, `expected all ${CONCURRENT_LOADS} loads to succeed, got ${statuses.join(',')}`)
        .toEqual(Array(CONCURRENT_LOADS).fill(200));

      // Every caller must see the same queue entry, not a partially-built one.
      const bodies = await Promise.all(responses.map((r) => r.json()));
      for (const body of bodies) {
        expect(body.status).toBe('waiting');
        expect(body.arrival_confirmed).toBe(true);
        expect(body.department).toBe('קרדיולוגיה');
      }
    } finally {
      await Promise.all(devices.map((device) => device.dispose()));
    }
  });

  test('a later load returns the same row rather than creating a second one', async ({ request }) => {
    await loginAsAdmin(request);
    const token = await createAppointment(request);

    const first = await request.get(`/api/visit/${token}/waiting`);
    expect(first.status()).toBe(200);
    const firstBody = await first.json();

    const second = await request.get(`/api/visit/${token}/waiting`);
    expect(second.status()).toBe(200);
    const secondBody = await second.json();

    expect(secondBody.updated_at).toBe(firstBody.updated_at);
    expect(secondBody.queue_position).toBe(firstBody.queue_position);
  });

  /**
   * Firing N parallel HTTP requests does not reliably land inside the ~1ms window
   * between one request's SELECT and its INSERT committing — every volume-based
   * attempt serialized. This holds the other side of the race open explicitly:
   * an uncommitted INSERT from a second connection makes the endpoint's own INSERT
   * block on the unique index, so the collision is deterministic rather than lucky.
   */
  test('loses the insert race to another connection and still returns 200', async ({ request }) => {
    test.skip(!process.env.DATABASE_URL, 'needs DATABASE_URL (run under doppler)');

    await loginAsAdmin(request);
    const { token, appointmentId, departmentId } = await createAppointmentWithIds(request);

    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();

    try {
      await db.query('BEGIN');
      await db.query(
        `INSERT INTO waiting_queue (appointment_id, department_id, status) VALUES ($1, $2, 'waiting')`,
        [appointmentId, departmentId]
      );

      // In flight while the competing insert is still uncommitted.
      const pending = request.get(`/api/visit/${token}/waiting`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await db.query('COMMIT');

      const res = await pending;
      expect(res.status(), await res.text()).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('waiting');
      expect(body.department).toBe('קרדיולוגיה');
    } finally {
      await db.query('ROLLBACK').catch(() => undefined);
      await db.query('DELETE FROM waiting_queue WHERE appointment_id = $1', [appointmentId]).catch(() => undefined);
      await db.end();
    }
  });
});
