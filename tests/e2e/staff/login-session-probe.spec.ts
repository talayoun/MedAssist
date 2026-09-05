import { test, expect } from '@playwright/test';

/**
 * The login page fired two identical unauthenticated /auth/me calls, so anyone
 * who opened devtools during a demo saw two red 401s before logging in. One call
 * site, doubled by StrictMode re-running the bootstrap effect in dev.
 *
 * Prerequisites:
 *   docker compose up -d && pnpm --filter api dev && pnpm --filter staff-backoffice dev
 */

test('the login page probes the session once, not twice', async ({ page }) => {
  const probes: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/auth/me')) probes.push(req.url());
  });

  await page.goto('/login');
  await expect(page.locator('input[type="password"]')).toBeVisible();
  // Give the second StrictMode pass time to fire if it is going to.
  await page.waitForTimeout(500);

  expect(probes).toHaveLength(1);
});
