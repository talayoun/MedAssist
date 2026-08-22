import { test, expect } from '@playwright/test';

/**
 * E2E coverage for admin bulk delete on the checklist templates table:
 * bulk bar visibility threshold, protected-row exclusion, select-all skip,
 * and an end-to-end bulk delete against throwaway data.
 *
 * Prerequisites:
 *   docker compose up -d && pnpm --filter api db:migrate && pnpm --filter api db:seed
 *   pnpm --filter api dev
 *   pnpm --filter staff-backoffice dev
 */

// Absolute, like every other staff spec: the back-office dev server has no /api
// proxy, so a relative path resolves against :5174 and 404s.
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /login|התחבר|כניסה/i }).click();
  await expect(page).toHaveURL(/\/queue/);
}

test.describe('admin bulk delete — checklist templates', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/admin/checklists');
  });

  test('bulk bar is hidden at one selection and shown above one', async ({ page }) => {
    const boxes = page.locator('tbody input[type="checkbox"]:not([disabled])');
    await boxes.nth(0).check();
    await expect(page.getByRole('button', { name: 'מחק נבחרים' })).toBeHidden();
    await boxes.nth(1).check();
    await expect(page.getByRole('button', { name: 'מחק נבחרים' })).toBeVisible();
    await expect(page.getByText('2 נבחרו')).toBeVisible();
  });

  test('a protected row cannot be selected', async ({ page }) => {
    const protectedRow = page.locator('tbody tr', { hasText: 'מערכת' }).first();
    await expect(protectedRow.locator('input[type="checkbox"]')).toBeDisabled();
  });

  test('select-all skips protected rows', async ({ page }) => {
    await page.locator('thead input[type="checkbox"]').check();
    const enabled = await page.locator('tbody input[type="checkbox"]:not([disabled])').count();
    await expect(page.getByText(`${enabled} נבחרו`)).toBeVisible();
  });

  test('bulk delete removes the selected rows and reports the outcome', async ({ page }) => {
    // Create two throwaway templates over the API so the test is self-contained
    // and never deletes seeded data. Unused templates have zero checklist_progress
    // rows, so they hard-delete rather than archive: the expected split is "נמחקו 2".
    // page.request shares the logged-in browser context's session cookie.
    // Unique per run: fixed names meant one aborted run left rows behind and every
    // later run died on duplicate_procedure_type.
    const run = Date.now().toString().slice(-6);
    const names = [`בדיקה-מחיקה-א-${run}`, `בדיקה-מחיקה-ב-${run}`];
    for (const procedure_type of names) {
      const res = await page.request.post(`${API_URL}/api/admin/checklists`, {
        data: { procedure_type, items: [] },
      });
      expect(res.status(), await res.text()).toBe(201);
    }
    await page.reload();

    for (const name of names) {
      await page.locator('tbody tr', { hasText: name }).locator('input[type="checkbox"]').check();
    }
    await page.getByRole('button', { name: 'מחק נבחרים' }).click();
    await expect(page.getByText('למחוק 2 תבניות?')).toBeVisible();
    // exact: the bulk bar's "מחק נבחרים" also matches a loose name.
    await page.getByRole('button', { name: 'מחק', exact: true }).click();

    await expect(page.getByText('נמחקו 2')).toBeVisible();
    for (const name of names) {
      await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(0);
    }
  });
});
