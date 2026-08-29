import { test, expect, Page } from '@playwright/test';

/**
 * The new-appointment modal is the first thing a visitor sees on demo day.
 *
 * The procedure used to be free text whose own suggestion list did not match the
 * seeded templates, the forms list offered every procedure's paperwork at once
 * (cardiac consent for an eye patient), and nothing attached unless staff ticked
 * it, so a patient created here arrived with almost no forms.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 *   pnpm --filter staff-backoffice dev
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function openModal(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/דוא|אימייל|email/i).or(page.locator('input[type="email"]')).first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /התחבר|כניסה/ }).click();
  await expect(page).toHaveURL(/\/queue/);

  await page.getByRole('button', { name: /מטופל חדש/ }).first().click();
  const modal = page.locator('h2:has-text("מטופל חדש")').locator('xpath=ancestor::div[contains(@style,"background")][1]');
  await expect(modal.locator('h2:has-text("מטופל חדש")')).toBeVisible();
  return modal;
}

/** The procedure select sits after the department select in the form. */
const procedureSelect = (modal: ReturnType<Page['locator']>) => modal.locator('select').nth(1);

test.describe('staff: the new-appointment modal picks a real procedure', () => {
  test('procedure is a picker of seeded procedures with Hebrew names', async ({ page }) => {
    const modal = await openModal(page);

    // Free text is gone: no input carrying the old datalist.
    await expect(modal.locator('input[list]')).toHaveCount(0);

    const select = procedureSelect(modal);
    await expect(select).toBeVisible();

    const options = await select.locator('option').allTextContents();
    expect(options).toContain('ניתוח קטרקט');
    expect(options).toContain('הכנה לניתוח לב');
    // The slug the old datalist offered never existed as a template.
    expect(options.join('|')).not.toContain('cataract-surgery');
    expect(options.join('|')).not.toContain('pre-op-cardiac');
  });

  test('the forms list follows the chosen procedure and required items are ticked', async ({ page }) => {
    const modal = await openModal(page);
    const select = procedureSelect(modal);

    await select.selectOption({ label: 'ניתוח קטרקט' });
    await expect(modal.getByText('הסכמה לניתוח קטרקט')).toBeVisible();
    // Cardiac paperwork must not be on offer for an eye patient.
    await expect(modal.getByText('תוצאות בדיקות דם עדכניות (תפקודי קרישה)')).toHaveCount(0);

    // Required items come pre-ticked; the universal ones are always in the list.
    const checked = modal.locator('input[type="checkbox"]:checked');
    expect(await checked.count()).toBeGreaterThan(3);
    const idCopy = modal.locator('label', { hasText: 'צילום תעודת זהות' }).locator('input[type="checkbox"]');
    await expect(idCopy).toBeChecked();

    await select.selectOption({ label: 'הכנה לניתוח לב' });
    await expect(modal.getByText('תוצאות בדיקות דם עדכניות (תפקודי קרישה)')).toBeVisible();
    await expect(modal.getByText('הסכמה לניתוח קטרקט')).toHaveCount(0);
  });
});
