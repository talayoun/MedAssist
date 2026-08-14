import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * API contract tests for staff session revocation on logout.
 *
 * Prerequisites:
 *   docker compose up -d
 *   doppler run -- pnpm --filter api db:migrate
 *   doppler run -- pnpm --filter api db:seed
 *   doppler run -- pnpm --filter api dev
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

test.describe('staff session revocation', () => {
  test('logout revokes the session — the same cookie is rejected afterward', async ({ request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginRes.status(), await loginRes.text()).toBe(200);

    const meBeforeRes = await request.get('/api/auth/me');
    expect(meBeforeRes.status()).toBe(200);

    const logoutRes = await request.post('/api/auth/logout');
    expect(logoutRes.status(), await logoutRes.text()).toBe(200);

    // Same session cookie (Playwright's APIRequestContext persists cookies across
    // calls) must now be rejected — this is the bug: logout previously wrote the
    // revocation key under a different Redis prefix than the auth middleware read,
    // so a "logged out" token stayed valid for its full remaining TTL.
    const meAfterRes = await request.get('/api/auth/me');
    expect(meAfterRes.status()).toBe(401);
  });
});
