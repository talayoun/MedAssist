import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * E6 — every admin router must state its own auth, not inherit safety from where
 * it happens to be mounted in app.ts.
 *
 * departments and form-templates previously mounted only requireAdmin. That does
 * reject unauthenticated requests today, so this was never an open door — but the
 * guarantee was implicit. These assertions make a future mount reshuffle fail
 * loudly instead of silently opening the routes.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN = { email: 'admin@medassist.test', password: 'AdminPassword123' };
const SCOPED_STAFF = { email: 'staff@medassist.test', password: 'StaffPassword123' };

const ADMIN_ROUTES = [
  '/api/admin/departments',
  '/api/admin/form-templates',
  '/api/admin/checklists',
  '/api/admin/navigation-routes',
];

async function login(request: APIRequestContext, email: string, password: string): Promise<void> {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
  expect(res.status(), await res.text()).toBe(200);
}

test.describe('admin routers: auth is stated, not inherited', () => {
  for (const route of ADMIN_ROUTES) {
    test(`${route} rejects an unauthenticated request with 401`, async ({ request }) => {
      // A context that has never logged in, so no session cookie is attached.
      const anon = await request.storageState();
      expect(anon.cookies.filter((c) => c.name === 'med_session')).toHaveLength(0);

      const res = await request.get(`${API_URL}${route}`);
      expect(res.status(), await res.text()).toBe(401);
      expect((await res.json()).error).toBe('not_authenticated');
    });

    test(`${route} rejects a non-admin staff session with 403`, async ({ request }) => {
      await login(request, SCOPED_STAFF.email, SCOPED_STAFF.password);
      const res = await request.get(`${API_URL}${route}`);
      expect(res.status(), await res.text()).toBe(403);
      expect((await res.json()).error).toBe('insufficient_role');
    });

    test(`${route} allows an admin session`, async ({ request }) => {
      await login(request, ADMIN.email, ADMIN.password);
      const res = await request.get(`${API_URL}${route}`);
      expect(res.status(), await res.text()).toBe(200);
    });
  }
});
