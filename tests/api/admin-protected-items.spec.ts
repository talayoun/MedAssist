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
