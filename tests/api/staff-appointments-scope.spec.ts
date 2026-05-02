import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const ADMIN = { email: 'admin@medassist.test', password: 'AdminPassword123' };
const SCOPED_STAFF = { email: 'staff@medassist.test', password: 'StaffPassword123' };
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

async function login(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
  expect(res.status()).toBe(200);
}

async function getScopedStaffDeptId(request: APIRequestContext): Promise<string> {
  // Login as admin to fetch staff details
  const res = await request.get(`${API_URL}/api/staff/departments`);
  expect(res.status()).toBe(200);
  const { departments } = await res.json();
  expect(departments.length).toBeGreaterThan(0);
  return departments[0].id as string;
}

function appointmentPayload(departmentId: string) {
  return {
    patient_name: 'Scope Test Patient',
    phone_number: `+97250${Date.now().toString().slice(-7)}`,
    department_id: departmentId,
    procedure_type: 'pre-op-cardiac',
    visit_datetime: new Date(Date.now() + 86_400_000).toISOString(),
    custom_items: [],
    suppressed_template_item_ids: [],
    send_now: false,
  };
}

test.describe('POST /api/staff/appointments — department scope', () => {
  let ownDeptId: string;
  // A UUID that exists in DB (the scoped staff's own dept) fetched in beforeAll.
  // A UUID that does NOT exist in DB, used to test cross-dept 403.
  const foreignDeptId = '00000000-dead-beef-0000-000000000099';

  test.beforeAll(async ({ request }) => {
    await login(request, ADMIN.email, ADMIN.password);
    ownDeptId = await getScopedStaffDeptId(request);
  });

  // ─── Admin (null scope) ────────────────────────────────────────────────────

  test('admin can create appointment in any department', async ({ request }) => {
    await login(request, ADMIN.email, ADMIN.password);
    const res = await request.post(`${API_URL}/api/staff/appointments`, {
      data: appointmentPayload(ownDeptId),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.appointment_id).toBeTruthy();
  });

  // ─── Scoped staff — own department ────────────────────────────────────────

  test('scoped staff can create appointment in own department', async ({ request }) => {
    await login(request, SCOPED_STAFF.email, SCOPED_STAFF.password);
    const res = await request.post(`${API_URL}/api/staff/appointments`, {
      data: appointmentPayload(ownDeptId),
    });
    expect(res.status()).toBe(201);
  });

  // ─── Scoped staff — foreign department ────────────────────────────────────

  test('scoped staff gets 403 when posting to a foreign department', async ({ request }) => {
    await login(request, SCOPED_STAFF.email, SCOPED_STAFF.password);
    const res = await request.post(`${API_URL}/api/staff/appointments`, {
      data: appointmentPayload(foreignDeptId),
    });
    // 403 from scope check, not 404 from dept-not-found — scope gate fires first
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
  });

  // ─── Regression: staff_id passed as department_id ─────────────────────────

  test('scoped staff passing own staff_id as department_id gets 403 from scope check', async ({ request }) => {
    await login(request, SCOPED_STAFF.email, SCOPED_STAFF.password);

    // Fetch own staff id from /me
    const meRes = await request.get(`${API_URL}/api/auth/me`);
    expect(meRes.status()).toBe(200);
    const { user: { id: staffId } } = await meRes.json() as { user: { id: string } };

    // staffId !== ownDeptId, so scope check fires 403 before any DB lookup
    const res = await request.post(`${API_URL}/api/staff/appointments`, {
      data: appointmentPayload(staffId),
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  // ─── Unauthenticated ──────────────────────────────────────────────────────

  test('unauthenticated request gets 401', async ({ request }) => {
    // Fresh request context has no session cookie — do NOT call login
    const res = await request.post(`${API_URL}/api/staff/appointments`, {
      data: appointmentPayload(ownDeptId),
    });
    expect(res.status()).toBe(401);
  });
});
