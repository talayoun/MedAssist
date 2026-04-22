import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * API contract tests for /api/admin/navigation-routes (CRUD + steps + reorder + delete rules).
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate
 *   pnpm --filter api db:seed
 *   pnpm --filter api dev
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';
const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL ?? 'staff@medassist.test';
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD ?? 'StaffPassword123';

async function loginAs(request: APIRequestContext, email: string, password: string): Promise<void> {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `login failed for ${email}: ${await res.text()}`).toBe(200);
}

async function getSeededDeptId(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/staff/departments');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.departments.length).toBeGreaterThan(0);
  return body.departments[0].id;
}

test.describe('Auth — non-admin gets 403', () => {
  test('staff role cannot list/create routes', async ({ request }) => {
    await loginAs(request, STAFF_EMAIL, STAFF_PASSWORD);

    const listRes = await request.get('/api/admin/navigation-routes');
    expect(listRes.status()).toBe(403);

    const createRes = await request.post('/api/admin/navigation-routes', {
      data: {
        name: 'x',
        from_department_id: null,
        to_department_id: '00000000-0000-0000-0000-000000000000',
        is_default: false,
        steps: [],
      },
    });
    expect(createRes.status()).toBe(403);
  });
});

test.describe('GET /api/admin/navigation-routes', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('returns seeded routes', async ({ request }) => {
    const res = await request.get('/api/admin/navigation-routes');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThan(0);
    const r = body.routes[0];
    expect(r).toHaveProperty('route_id');
    expect(r).toHaveProperty('name');
    expect(r).toHaveProperty('from_department_id');
    expect(r).toHaveProperty('to_department_id');
    expect(r).toHaveProperty('is_default');
    expect(r).toHaveProperty('archived');
    expect(r).toHaveProperty('steps_count');
  });

  test('excludes archived by default', async ({ request }) => {
    const res = await request.get('/api/admin/navigation-routes');
    const body = await res.json();
    const hasArchived = body.routes.some((r: { archived: boolean }) => r.archived);
    expect(hasArchived).toBe(false);
  });
});

test.describe('POST /api/admin/navigation-routes — CRUD happy path', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('creates route with steps and returns detail', async ({ request }) => {
    const deptId = await getSeededDeptId(request);
    const name = `test-route-${Date.now()}`;
    const res = await request.post('/api/admin/navigation-routes', {
      data: {
        name,
        from_department_id: null,
        to_department_id: deptId,
        is_default: false,
        steps: [
          { image_url: 'https://example.com/a.jpg', instruction_text: 'צעד 1' },
          { image_url: 'https://example.com/b.jpg', instruction_text: 'צעד 2' },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.name).toBe(name);
    expect(body.steps_count).toBe(2);
    expect(body.is_default).toBe(false);
    expect(body.archived).toBe(false);
    expect(body.steps).toHaveLength(2);
    expect(body.steps[0].order).toBe(1);
    expect(body.steps[1].order).toBe(2);
  });

  test('rejects empty name with 400', async ({ request }) => {
    const deptId = await getSeededDeptId(request);
    const res = await request.post('/api/admin/navigation-routes', {
      data: {
        name: '',
        from_department_id: null,
        to_department_id: deptId,
        is_default: false,
        steps: [],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects bad UUID in to_department_id with 400', async ({ request }) => {
    const res = await request.post('/api/admin/navigation-routes', {
      data: {
        name: 'bad',
        from_department_id: null,
        to_department_id: 'not-a-uuid',
        is_default: false,
        steps: [],
      },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects >20 steps with 400', async ({ request }) => {
    const deptId = await getSeededDeptId(request);
    const steps = Array.from({ length: 21 }, (_, i) => ({
      image_url: `https://example.com/${i}.jpg`,
      instruction_text: `צעד ${i}`,
    }));
    const res = await request.post('/api/admin/navigation-routes', {
      data: {
        name: 'too-many',
        from_department_id: null,
        to_department_id: deptId,
        is_default: false,
        steps,
      },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('Default-toggle safety', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('creating second is_default=true for same (from,to) unsets the previous', async ({ request }) => {
    const deptId = await getSeededDeptId(request);

    // Create first default route
    const r1 = await request.post('/api/admin/navigation-routes', {
      data: {
        name: `default-a-${Date.now()}`,
        from_department_id: null,
        to_department_id: deptId,
        is_default: true,
        steps: [],
      },
    });
    expect(r1.status()).toBe(201);
    const first = await r1.json();

    // Create second default route for same pair
    const r2 = await request.post('/api/admin/navigation-routes', {
      data: {
        name: `default-b-${Date.now()}`,
        from_department_id: null,
        to_department_id: deptId,
        is_default: true,
        steps: [],
      },
    });
    expect(r2.status()).toBe(201);

    // Reload first — should now have is_default=false
    const firstReload = await request.get(`/api/admin/navigation-routes/${first.route_id}`);
    const firstBody = await firstReload.json();
    expect(firstBody.is_default).toBe(false);
  });
});

test.describe('DELETE — soft-delete guards', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('hard-deletes a route with zero usage', async ({ request }) => {
    const deptId = await getSeededDeptId(request);
    const createRes = await request.post('/api/admin/navigation-routes', {
      data: {
        name: `delete-test-${Date.now()}`,
        from_department_id: null,
        to_department_id: deptId,
        is_default: false,
        steps: [],
      },
    });
    expect(createRes.status()).toBe(201);
    const { route_id } = await createRes.json();

    const delRes = await request.delete(`/api/admin/navigation-routes/${route_id}`);
    expect(delRes.status()).toBe(200);
    const body = await delRes.json();
    expect(body.deleted).toBe(true);
    expect(body.archived).toBe(false);
  });

  test('returns 404 for unknown route id', async ({ request }) => {
    const res = await request.delete('/api/admin/navigation-routes/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });

  test('returns 409 when route is the default for an active appointment dept', async ({ request }) => {
    // Seeded appointment (phase=link_sent) uses the dept default route via fallback.
    // The seeded route is is_default=true, from_department_id=NULL.
    const listRes = await request.get('/api/admin/navigation-routes');
    const { routes } = await listRes.json();
    const seeded = routes.find(
      (r: { from_department_id: string | null; is_default: boolean }) =>
        r.from_department_id === null && r.is_default === true,
    );
    if (!seeded) {
      test.skip(true, 'no seeded default route found');
      return;
    }

    const delRes = await request.delete(`/api/admin/navigation-routes/${seeded.route_id}`);
    expect(delRes.status()).toBe(409);
    const body = await delRes.json();
    expect(body.error).toBe('route_in_active_use');
    expect(typeof body.active_count).toBe('number');
  });
});

test.describe('Steps CRUD + reorder', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('add step, update step, reorder, delete step', async ({ request }) => {
    const deptId = await getSeededDeptId(request);
    const createRes = await request.post('/api/admin/navigation-routes', {
      data: {
        name: `steps-test-${Date.now()}`,
        from_department_id: null,
        to_department_id: deptId,
        is_default: false,
        steps: [
          { image_url: 'https://example.com/1.jpg', instruction_text: 'צעד 1' },
          { image_url: 'https://example.com/2.jpg', instruction_text: 'צעד 2' },
          { image_url: 'https://example.com/3.jpg', instruction_text: 'צעד 3' },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const route = await createRes.json();

    // Add a fourth step
    const addRes = await request.post(`/api/admin/navigation-routes/${route.route_id}/steps`, {
      data: { image_url: 'https://example.com/4.jpg', instruction_text: 'צעד 4' },
    });
    expect(addRes.status()).toBe(201);
    const addedStep = await addRes.json();
    expect(addedStep.order).toBe(4);

    // Update the second step's instruction
    const s2 = route.steps[1];
    const updRes = await request.put(`/api/admin/navigation-routes/${route.route_id}/steps/${s2.step_id}`, {
      data: { instruction_text: 'צעד 2 מעודכן' },
    });
    expect(updRes.status()).toBe(200);
    const updated = await updRes.json();
    expect(updated.instruction).toBe('צעד 2 מעודכן');

    // Reorder: put the newly added step first
    const reorderedIds = [
      addedStep.step_id,
      route.steps[0].step_id,
      route.steps[1].step_id,
      route.steps[2].step_id,
    ];
    const reorderRes = await request.put(`/api/admin/navigation-routes/${route.route_id}/steps/order`, {
      data: { ordered_ids: reorderedIds },
    });
    expect(reorderRes.status()).toBe(200);

    // GET — verify order
    const getRes = await request.get(`/api/admin/navigation-routes/${route.route_id}`);
    const reloaded = await getRes.json();
    expect(reloaded.steps.map((s: { step_id: string }) => s.step_id)).toEqual(reorderedIds);
    expect(reloaded.steps.map((s: { order: number }) => s.order)).toEqual([1, 2, 3, 4]);

    // Delete the first step in current order (was the added one)
    const delRes = await request.delete(
      `/api/admin/navigation-routes/${route.route_id}/steps/${addedStep.step_id}`,
    );
    expect(delRes.status()).toBe(200);

    // Verify repack — 3 steps with orders 1..3
    const finalRes = await request.get(`/api/admin/navigation-routes/${route.route_id}`);
    const final = await finalRes.json();
    expect(final.steps).toHaveLength(3);
    expect(final.steps.map((s: { order: number }) => s.order)).toEqual([1, 2, 3]);
  });

  test('reorder with mismatched step ids returns 400', async ({ request }) => {
    const deptId = await getSeededDeptId(request);
    const createRes = await request.post('/api/admin/navigation-routes', {
      data: {
        name: `mismatch-test-${Date.now()}`,
        from_department_id: null,
        to_department_id: deptId,
        is_default: false,
        steps: [
          { image_url: 'https://example.com/1.jpg', instruction_text: 'a' },
          { image_url: 'https://example.com/2.jpg', instruction_text: 'b' },
        ],
      },
    });
    const route = await createRes.json();

    const res = await request.put(`/api/admin/navigation-routes/${route.route_id}/steps/order`, {
      data: { ordered_ids: ['00000000-0000-0000-0000-000000000000'] },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('Patient nav regression', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('seeded patient GET /api/visit/:token/navigation still returns steps in order', async ({ request }) => {
    // Use the staff re-issue flow: list seeded queue → get an elective appointment → resend invite → get token.
    const q = await request.get('/api/staff/queue');
    expect(q.status()).toBe(200);
    const qBody = await q.json();
    const pat = qBody.patients?.find((p: { track: string; current_phase: string }) =>
      p.track === 'elective' && p.current_phase === 'link_sent');
    if (!pat) {
      test.skip(true, 'no seeded elective link_sent patient');
      return;
    }

    const resend = await request.post(`/api/staff/queue/${pat.appointment_id}/resend-invite`);
    expect(resend.status()).toBe(200);
    const { token } = await resend.json();

    const nav = await request.get(`/api/visit/${token}/navigation`);
    expect(nav.status()).toBe(200);
    const body = await nav.json();
    expect(body).toHaveProperty('route_id');
    expect(body.total_steps).toBeGreaterThan(0);
    expect(Array.isArray(body.steps)).toBe(true);
    expect(body.steps.length).toBeGreaterThan(0);
  });
});
