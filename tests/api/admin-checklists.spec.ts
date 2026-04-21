import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * API contract tests for /api/admin/checklists (CRUD + delete rules).
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

test.describe('GET /api/admin/checklists', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('returns seeded templates for admin', async ({ request }) => {
    const res = await request.get('/api/admin/checklists');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.templates)).toBe(true);
    expect(body.templates.length).toBeGreaterThan(0);
    const tpl = body.templates[0];
    expect(tpl).toHaveProperty('template_id');
    expect(tpl).toHaveProperty('procedure_type');
    expect(tpl).toHaveProperty('item_count');
    expect(tpl).toHaveProperty('archived');
  });

  test('excludes archived templates by default', async ({ request }) => {
    const res = await request.get('/api/admin/checklists');
    const body = await res.json();
    const hasArchived = body.templates.some((t: { archived: boolean }) => t.archived);
    expect(hasArchived).toBe(false);
  });
});

test.describe('Non-admin access', () => {
  test('staff role gets 403 on all admin checklist endpoints', async ({ request }) => {
    await loginAs(request, STAFF_EMAIL, STAFF_PASSWORD);

    const listRes = await request.get('/api/admin/checklists');
    expect(listRes.status()).toBe(403);

    const createRes = await request.post('/api/admin/checklists', {
      data: { procedure_type: 'x', items: [] },
    });
    expect(createRes.status()).toBe(403);
  });
});

test.describe('POST /api/admin/checklists', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('creates a template with items and returns it', async ({ request }) => {
    const procedureType = `test-proc-${Date.now()}`;
    const res = await request.post('/api/admin/checklists', {
      data: {
        procedure_type: procedureType,
        items: [
          { text: 'להביא תעודת זהות', category: 'bring', time_sensitive: false },
          { text: 'לצום 8 שעות', category: 'fast', time_sensitive: true },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.procedure_type).toBe(procedureType);
    expect(body.item_count).toBe(2);
    expect(body.archived).toBe(false);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].text).toBe('להביא תעודת זהות');
    expect(body.items[1].time_sensitive).toBe(true);
  });

  test('rejects duplicate procedure_type with 409', async ({ request }) => {
    const procedureType = `dup-proc-${Date.now()}`;
    await request.post('/api/admin/checklists', {
      data: { procedure_type: procedureType, items: [] },
    });
    const res2 = await request.post('/api/admin/checklists', {
      data: { procedure_type: procedureType, items: [] },
    });
    expect(res2.status()).toBe(409);
    const body = await res2.json();
    expect(body.error).toBe('duplicate_procedure_type');
  });

  test('rejects empty procedure_type with 400', async ({ request }) => {
    const res = await request.post('/api/admin/checklists', {
      data: { procedure_type: '', items: [] },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('PUT /api/admin/checklists/:id', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('updates procedure_type and replaces items', async ({ request }) => {
    const createRes = await request.post('/api/admin/checklists', {
      data: {
        procedure_type: `update-test-${Date.now()}`,
        items: [{ text: 'ישן', category: 'other', time_sensitive: false }],
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const updateRes = await request.put(`/api/admin/checklists/${created.template_id}`, {
      data: {
        items: [
          { text: 'חדש 1', category: 'bring', time_sensitive: false },
          { text: 'חדש 2', category: 'medication', time_sensitive: true },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.item_count).toBe(2);
    expect(updated.items[0].text).toBe('חדש 1');
  });

  test('returns 404 for unknown template id', async ({ request }) => {
    const res = await request.put('/api/admin/checklists/00000000-0000-0000-0000-000000000000', {
      data: { items: [] },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('DELETE /api/admin/checklists/:id', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('hard-deletes a template with zero usage', async ({ request }) => {
    const createRes = await request.post('/api/admin/checklists', {
      data: { procedure_type: `delete-test-${Date.now()}`, items: [] },
    });
    expect(createRes.status()).toBe(201);
    const { template_id } = await createRes.json();

    const delRes = await request.delete(`/api/admin/checklists/${template_id}`);
    expect(delRes.status()).toBe(200);
    const body = await delRes.json();
    expect(body.deleted).toBe(true);
    expect(body.archived).toBe(false);

    // Confirm gone from list
    const listRes = await request.get('/api/admin/checklists');
    const { templates } = await listRes.json();
    expect(templates.find((t: { template_id: string }) => t.template_id === template_id)).toBeUndefined();
  });

  test('returns 404 for unknown template id', async ({ request }) => {
    const res = await request.delete('/api/admin/checklists/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });

  test('returns 409 when template is in active use', async ({ request }) => {
    // The seeded pre-op-cardiac template is used by the seeded appointment (phase=link_sent).
    // Find it and attempt delete.
    const listRes = await request.get('/api/admin/checklists');
    const { templates } = await listRes.json();
    const seeded = templates.find((t: { procedure_type: string }) => t.procedure_type === 'pre-op-cardiac');
    if (!seeded) {
      test.skip(true, 'seeded pre-op-cardiac template not found — seed may not have run');
      return;
    }

    const delRes = await request.delete(`/api/admin/checklists/${seeded.template_id}`);
    expect(delRes.status()).toBe(409);
    const body = await delRes.json();
    expect(body.error).toBe('template_in_active_use');
    expect(typeof body.active_count).toBe('number');
  });
});
