import { test, expect } from '@playwright/test';

/**
 * E2E smoke test for the elective onboarding flow:
 * staff logs in → opens "New Appointment" modal → submits with send_now →
 * patient appears in queue with phase 'link_sent'.
 *
 * Prerequisites:
 *   docker compose up -d && pnpm --filter api db:migrate && pnpm --filter api db:seed
 *   pnpm --filter api dev      (API on :3000)
 *   pnpm --filter staff-backoffice dev  (backoffice on :5174)
 *   pnpm --filter api worker  (so queued_now SMS actually fires; optional for this test)
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

test('staff can onboard a new elective patient via the UI', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel(/email|אימייל|דוא/i).fill(ADMIN_EMAIL).catch(async () => {
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  });
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /login|התחבר|כניסה/i }).click();

  await expect(page).toHaveURL(/\/queue/);

  await page.getByRole('button', { name: /מטופל חדש/ }).click();

  const modal = page.locator('role=dialog').or(page.locator('h2:has-text("מטופל חדש")').locator('xpath=ancestor::div[2]'));
  await expect(page.locator('h2:has-text("מטופל חדש")')).toBeVisible();

  const uniquePhone = `+97259${Date.now().toString().slice(-7)}`;
  const uniqueName = `E2E Test ${Date.now()}`;

  await page.locator('input').filter({ hasText: '' }).first().fill(uniqueName);
  // Fall back to ordered inputs since labels are in Hebrew
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(uniqueName);
  await inputs.nth(1).fill(uniquePhone);

  const departmentSelect = page.locator('form select').first();
  await departmentSelect.selectOption({ label: 'קרדיולוגיה' });

  // procedure_type defaults to 'pre-op-cardiac' — leave it
  // visit_datetime defaults to +3 days — leave it
  // send_now checkbox is on by default — leave it

  await page.getByRole('button', { name: 'צור פגישה' }).click();

  // Success banner appears and queue refreshes
  await expect(page.getByText(/המטופל נוצר/)).toBeVisible({ timeout: 5000 });

  // New patient visible on queue with link_sent phase badge
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 });
  await expect(
    page.locator(`text=${uniqueName}`).locator('xpath=ancestor::div[contains(@style,"border-radius")][1]').getByText('קישור נשלח')
  ).toBeVisible();
});
