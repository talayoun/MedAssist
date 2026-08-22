import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * E11 + E12 — network failures that used to be invisible to the patient.
 *
 * E11: the Navigation "אני כאן" tap only handled ApiError, so a dropped
 *      connection stopped the spinner and showed nothing at all.
 * E12: the Waiting page's fetch failure only console.error'd, leaving the
 *      patient on a loading spinner indefinitely.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 *   pnpm --filter patient-pwa dev
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function createVisit(request: APIRequestContext): Promise<string> {
  const loginRes = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(loginRes.status(), 'admin login').toBe(200);

  const { departments } = await (await request.get(`${API_URL}/api/staff/departments`)).json();
  const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
  expect(dept, 'seeded department must exist').toBeTruthy();

  const apptRes = await request.post(`${API_URL}/api/staff/appointments`, {
    data: {
      patient_name: 'ישראל ישראלי',
      phone_number: `+97250${Date.now().toString().slice(-7)}`,
      department_id: dept.id,
      procedure_type: 'pre-op-cardiac',
      visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      custom_items: [],
      suppressed_template_item_ids: [],
      // send_now is required for the response to carry a usable token
      send_now: true,
    },
  });
  expect(apptRes.status(), 'create appointment').toBe(201);
  const token = (await apptRes.json()).magic_link_token;
  expect(token).toBeTruthy();
  return token;
}

test.describe('patient: network failures are visible', () => {
  let token: string;

  test.beforeEach(async ({ request }) => {
    token = await createVisit(request);
  });

  // Navigation opens on the "getting to the hospital" screen; the step-by-step
  // walkthrough with the "אני כאן" confirm only appears after this local toggle.
  async function openStepView(page: import('@playwright/test').Page): Promise<void> {
    await page.goto(`/visit/${token}/navigation`);
    await page.getByRole('button', { name: 'הגעתי למרפאה' }).click();
  }

  test('E11: a dropped connection on the "here" tap shows an error and keeps the step', async ({ page }) => {
    await openStepView(page);

    const confirm = page.getByRole('button', { name: 'אני כאן' });
    await expect(confirm).toBeVisible();

    // Kill the connection only for the confirm call, so loading the page still works.
    await page.route('**/navigation/steps/*/confirm', (route) => route.abort('failed'));
    await confirm.click();

    // Pre-fix: the catch only handled ApiError, so nothing at all appeared here.
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('נסה שוב');

    // The navigation step must survive so the patient can just tap again.
    await expect(confirm).toBeVisible();
  });

  test('E11: the error clears when a retried tap succeeds', async ({ page }) => {
    await openStepView(page);

    const confirm = page.getByRole('button', { name: 'אני כאן' });
    await expect(confirm).toBeVisible();

    let failNext = true;
    await page.route('**/navigation/steps/*/confirm', async (route) => {
      if (failNext) {
        failNext = false;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await confirm.click();
    await expect(page.getByRole('alert')).toBeVisible();

    await confirm.click();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('E12: a failed first load on Waiting shows an error, not an endless spinner', async ({ page }) => {
    await page.route('**/api/visit/*/waiting', (route) => route.abort('failed'));

    await page.goto(`/visit/${token}/waiting`);

    // Pre-fix: the failure was only console.error'd, so this stayed on screen forever.
    await expect(page.getByText('טוען מצב תור...')).toHaveCount(0);

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('לא הצלחנו לטעון את מצב התור');
  });

  test('E12: the queue state renders once the connection comes back', async ({ page }) => {
    let failNext = true;
    await page.route('**/api/visit/*/waiting', async (route) => {
      if (failNext) {
        failNext = false;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await page.goto(`/visit/${token}/waiting`);
    await expect(page.getByRole('alert')).toBeVisible();

    // The page polls on an interval; a manual reload stands in for the next tick
    // so the test does not have to wait out the real poll interval.
    await page.reload();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('טוען מצב תור...')).toHaveCount(0);
  });
});
