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
  test('logout revokes the session — replaying the same token is rejected afterward', async ({ request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginRes.status(), await loginRes.text()).toBe(200);

    // Capture the raw token before logout. logout() responds with
    // Set-Cookie: med_session=; Max-Age=0, which Playwright's APIRequestContext
    // (like a browser) honors and clears from its own cookie jar — so a later
    // request through `request` alone would send no cookie at all and 401 for
    // the wrong reason (missing token), never exercising revocation. We replay
    // the raw token explicitly to simulate the real threat: a stolen/cached
    // cookie replayed after the legitimate user logged out.
    const cookies = (await request.storageState()).cookies;
    const sessionCookie = cookies.find((c) => c.name === 'med_session');
    expect(sessionCookie, 'med_session cookie should be set after login').toBeTruthy();
    const token = sessionCookie!.value;

    const meBeforeRes = await request.get('/api/auth/me');
    expect(meBeforeRes.status()).toBe(200);

    const logoutRes = await request.post('/api/auth/logout');
    expect(logoutRes.status(), await logoutRes.text()).toBe(200);

    const meAfterRes = await request.get('/api/auth/me', {
      headers: { Cookie: `med_session=${token}` },
    });
    expect(meAfterRes.status()).toBe(401);
    expect((await meAfterRes.json()).error).toBe('session_expired');
  });
});
