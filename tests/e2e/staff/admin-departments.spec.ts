import { test, expect } from '@playwright/test';

/**
 * E2E smoke test for the department arrival-info admin page:
 * staff (admin) logs in → opens Admin → Departments → edits a department's
 * address → saves → reloads → the edit persisted.
 *
 * Prerequisites:
 *   docker compose up -d && pnpm --filter api db:migrate && pnpm --filter api db:seed
 *   pnpm --filter api dev
 *   pnpm --filter staff-backoffice dev
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /login|התחבר|כניסה/i }).click();
  await expect(page).toHaveURL(/\/queue/);
}

test('admin can edit and persist a department\'s arrival info', async ({ page }) => {
  await login(page);

  await page.goto('/admin/departments');
  await expect(page.getByRole('heading', { name: 'פרטי הגעה למחלקות' })).toBeVisible();

  const row = page.locator('tr', { hasText: 'קרדיולוגיה' }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'ערוך' }).click();

  const addressValue = `כתובת בדיקה ${Date.now()}`;
  const addressInput = page.locator('input[placeholder="רחוב הרופאים 15, תל אביב"]');
  await addressInput.fill(addressValue);
  await page.getByRole('button', { name: 'שמור' }).click();

  // Row updates in place, editor closes
  await expect(page.getByRole('button', { name: 'שמור' })).not.toBeVisible();
  await expect(page.locator('tr', { hasText: 'קרדיולוגיה' }).first()).toContainText(addressValue);

  // Persisted server-side, not just local state
  await page.reload();
  await expect(page.locator('tr', { hasText: 'קרדיולוגיה' }).first()).toContainText(addressValue);
});
