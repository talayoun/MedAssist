import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * API contract tests for magic-link validity semantics (constitution v1.2):
 * reusable for the whole visit, invalidated only by TTL expiry, visit
 * completion (current_phase = 'done'), or staff removal (soft-delete).
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate
 *   pnpm --filter api db:seed
 *   pnpm --filter api dev
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function loginAsAdmin(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function createAppointment(request: APIRequestContext): Promise<{ appointmentId: string; token: string }> {
  const deptRes = await request.get('/api/staff/departments');
  const { departments } = await deptRes.json();
  const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
  expect(dept, 'seeded department must exist').toBeTruthy();

  const res = await request.post('/api/staff/appointments', {
    data: {
      patient_name: 'בדיקת תוקף קישור',
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
  return { appointmentId: body.appointment_id, token: body.magic_link_token };
}

test.describe('magic-link validity: reusable across the visit', () => {
  test('the same token resolves successfully on repeated opens', async ({ request }) => {
    await loginAsAdmin(request);
    const { token } = await createAppointment(request);

    const first = await request.get(`/api/visit/${token}`);
    expect(first.status()).toBe(200);

    const second = await request.get(`/api/visit/${token}`);
    expect(second.status()).toBe(200);

    // A route gated by requireMagicLinkToken (not just the initial resolve) also
    // keeps working — mirrors the app's 30s polling of the checklist/waiting pages.
    const checklist = await request.get(`/api/visit/${token}/checklist`);
    expect(checklist.status()).toBe(200);
    const checklistAgain = await request.get(`/api/visit/${token}/checklist`);
    expect(checklistAgain.status()).toBe(200);
  });
});

test.describe('magic-link validity: soft-deleted appointment', () => {
  test('token 404s after staff removes the patient via trash', async ({ request }) => {
    await loginAsAdmin(request);
    const { appointmentId, token } = await createAppointment(request);

    const preCheck = await request.get(`/api/visit/${token}`);
    expect(preCheck.status()).toBe(200);

    const delRes = await request.delete(`/api/admin/appointments/${appointmentId}`);
    expect(delRes.status()).toBe(200);

    const resolveRes = await request.get(`/api/visit/${token}`);
    expect(resolveRes.status()).toBe(404);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.error).toBe('link_not_found');

    // requireMagicLinkToken-gated routes must reject too, not just the initial resolve
    const checklistRes = await request.get(`/api/visit/${token}/checklist`);
    expect(checklistRes.status()).toBe(401);
  });
});

test.describe('magic-link validity: completed visit', () => {
  test('token 409s (link_used) once the visit reaches current_phase=done', async ({ request }) => {
    await loginAsAdmin(request);
    const { appointmentId, token } = await createAppointment(request);

    // Auto-creates a waiting_queue row for this appointment (waiting.service.ts)
    const waitingRes = await request.get(`/api/visit/${token}/waiting`);
    expect(waitingRes.status()).toBe(200);

    const statusRes = await request.patch(`/api/staff/queue/${appointmentId}/status`, {
      data: { status: 'done' },
    });
    expect(statusRes.status(), await statusRes.text()).toBe(200);

    const resolveRes = await request.get(`/api/visit/${token}`);
    expect(resolveRes.status()).toBe(409);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.error).toBe('link_used');

    // A page already open (mid-poll) must also stop working, not just the initial resolve
    const checklistRes = await request.get(`/api/visit/${token}/checklist`);
    expect(checklistRes.status()).toBe(409);
    const checklistBody = await checklistRes.json();
    expect(checklistBody.error).toBe('link_used');
  });
});
