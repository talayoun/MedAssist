import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

async function loginAndNavigateToPatient(
  page: import('@playwright/test').Page
): Promise<string> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /login|התחבר|כניסה/i }).click();
  await expect(page).toHaveURL(/\/queue/, { timeout: 10_000 });

  // Get appointment ID via API — pick first appointment that has form items.
  // Scope tests may create appointments without form items that sort first
  // (visit_datetime tomorrow > seed appointment 3 days from now).
  const resp = await page.request.get(`${API_URL}/api/staff/appointments`);
  expect(resp.status()).toBe(200);
  const { appointments } = await resp.json();
  expect(appointments.length).toBeGreaterThan(0);

  let appointmentId: string | undefined;
  for (const appt of appointments as Array<{ id: string }>) {
    const formsResp = await page.request.get(`${API_URL}/api/staff/patients/${appt.id}/forms`);
    if (formsResp.status() !== 200) continue;
    const { items } = await formsResp.json();
    if (Array.isArray(items) && items.length > 0) {
      appointmentId = appt.id;
      break;
    }
  }
  expect(appointmentId, 'No appointment with form items found — check seed data').toBeTruthy();

  // Navigate within SPA (no full page reload — auth React state preserved)
  await page.evaluate((path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/patients/${appointmentId as string}`);

  return appointmentId as string;
}

test.describe('staff: forms export', () => {
  test('documents card appears in patient detail', async ({ page }) => {
    await loginAndNavigateToPatient(page);
    await expect(page.getByRole('heading', { name: 'מסמכים' })).toBeVisible({ timeout: 10_000 });
  });

  test('export PDF button opens new tab', async ({ page, context }) => {
    await loginAndNavigateToPatient(page);
    await expect(page.getByText('ייצא PDF')).toBeVisible({ timeout: 10_000 });

    const [newTab] = await Promise.all([
      context.waitForEvent('page', { timeout: 15_000 }),
      page.getByText('ייצא PDF').click(),
    ]);
    // PDF served inline — browser opens it in viewer, URL becomes the presigned S3 URL
    await newTab.waitForURL(/^https?:\/\/(?!about)/, { timeout: 20_000 }).catch(() => {});
    expect(newTab.url()).toMatch(/^https?:\/\//);
  });

  test('patient info header shows name and department', async ({ page }) => {
    const appointmentId = await loginAndNavigateToPatient(page);

    const resp = await page.request.get(`${API_URL}/api/staff/appointments/${appointmentId}`);
    expect(resp.status()).toBe(200);
    const appt = await resp.json();

    await expect(page.getByText(appt.patient_name)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(appt.department_name)).toBeVisible({ timeout: 10_000 });
  });

  test('back button navigates to queue', async ({ page }) => {
    await loginAndNavigateToPatient(page);
    await expect(page.getByText('חזרה לתור ←')).toBeVisible({ timeout: 10_000 });
    await page.getByText('חזרה לתור ←').click();
    await expect(page).toHaveURL(/\/queue/, { timeout: 5_000 });
  });
});
