import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * API contract tests for is_protected on admin-managed entities.
 *
 * Prerequisites:
 *   docker compose up -d
 *   doppler run -- pnpm --filter api db:migrate
 *   doppler run -- pnpm --filter api db:seed
 *   doppler run -- pnpm --filter api dev
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function loginAs(request: APIRequestContext, email: string, password: string): Promise<void> {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `login failed for ${email}: ${await res.text()}`).toBe(200);
}

test.describe('is_protected exposure', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('checklist templates expose is_protected and at least one seeded row is protected', async ({ request }) => {
    const res = await request.get('/api/admin/checklists');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const tpl of body.templates) expect(typeof tpl.is_protected).toBe('boolean');
    expect(body.templates.some((t: { is_protected: boolean }) => t.is_protected)).toBe(true);
  });

  test('navigation routes expose is_protected', async ({ request }) => {
    const res = await request.get('/api/admin/navigation-routes');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const r of body.routes) expect(typeof r.is_protected).toBe('boolean');
  });

  test('form templates expose is_protected', async ({ request }) => {
    const res = await request.get('/api/admin/form-templates');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const it of body.items) expect(typeof it.is_protected).toBe('boolean');
  });
});

test.describe('protected rows cannot be deleted', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('DELETE on a protected checklist template returns 409 item_protected', async ({ request }) => {
    const list = await request.get('/api/admin/checklists');
    const protectedTpl = (await list.json()).templates
      .find((t: { is_protected: boolean }) => t.is_protected);
    expect(protectedTpl, 'seed must contain a protected template').toBeTruthy();

    const res = await request.delete(`/api/admin/checklists/${protectedTpl.template_id}`);
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('item_protected');
  });

  test('the protected template still exists after the rejected delete', async ({ request }) => {
    const list = await request.get('/api/admin/checklists');
    const still = (await list.json()).templates
      .some((t: { is_protected: boolean }) => t.is_protected);
    expect(still).toBe(true);
  });

  test('PATCH deactivating a protected form template item returns 409 item_protected', async ({ request }) => {
    const list = await request.get('/api/admin/form-templates');
    const protectedItem = (await list.json()).items
      .find((it: { is_protected: boolean }) => it.is_protected);
    expect(protectedItem, 'seed must contain a protected form template item').toBeTruthy();

    const res = await request.patch(`/api/admin/form-templates/${protectedItem.id}`, {
      data: { is_active: false },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('item_protected');

    const listAfter = await request.get('/api/admin/form-templates');
    const stillActive = (await listAfter.json()).items
      .some((it: { id: string; is_active: boolean }) => it.id === protectedItem.id && it.is_active);
    expect(stillActive).toBe(true);
  });

  test('PUT archiving a protected navigation route returns 409 item_protected', async ({ request }) => {
    const list = await request.get('/api/admin/navigation-routes');
    const protectedRoute = (await list.json()).routes
      .find((r: { is_protected: boolean }) => r.is_protected);
    expect(protectedRoute, 'seed must contain a protected navigation route').toBeTruthy();

    const res = await request.put(`/api/admin/navigation-routes/${protectedRoute.route_id}`, {
      data: { archived: true },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('item_protected');

    const listAfter = await request.get('/api/admin/navigation-routes');
    const stillUnarchived = (await listAfter.json()).routes
      .some((r: { route_id: string; archived: boolean }) => r.route_id === protectedRoute.route_id && !r.archived);
    expect(stillUnarchived).toBe(true);
  });
});
