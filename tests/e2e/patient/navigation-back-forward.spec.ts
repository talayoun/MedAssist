import { test, expect, APIRequestContext, Page } from '@playwright/test';

/**
 * Internal navigation is a plain back/forward flow.
 *
 * Before this, stepping back put the patient in a "peek" state: the only way
 * forward was a "חזרה לשלב הנוכחי" button that jumped straight back to the
 * furthest step, so going back two and forward one was impossible. The dots
 * also stayed filled to the server's progress, so stepping back showed steps
 * ahead as already done.
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
      patient_name: 'רחל כהן',
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

/** Filled dots are full opacity; steps not yet confirmed sit at 0.3. */
async function filledDots(page: Page): Promise<number> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('div.rounded-full.h-2'))
      .filter((el) => (el as HTMLElement).style.opacity === '1').length
  );
}

test.describe('patient: internal navigation moves freely in both directions', () => {
  let token: string;

  test.beforeEach(async ({ request, page }) => {
    token = await createVisit(request);
    await page.goto(`/visit/${token}/navigation`);
    // The step view sits behind the "getting to the hospital" screen.
    await page.getByRole('button', { name: 'הגעתי למרפאה' }).click();
  });

  test('back two, forward one, with no "return to current step" gate', async ({ page }) => {
    const here = page.getByRole('button', { name: 'אני כאן' });
    const back = page.getByRole('button', { name: 'השלב הקודם' });

    await expect(page.getByText(/שלב 1 מתוך/)).toBeVisible();
    await expect(back).toBeDisabled();

    await here.click();
    await expect(page.getByText(/שלב 2 מתוך/)).toBeVisible();
    await here.click();
    await expect(page.getByText(/שלב 3 מתוך/)).toBeVisible();

    // Both controls stay on screen the whole time, and stepping back does not
    // replace the confirm button with a gate.
    await back.click();
    await expect(page.getByText(/שלב 2 מתוך/)).toBeVisible();
    await back.click();
    await expect(page.getByText(/שלב 1 מתוך/)).toBeVisible();
    await expect(here).toBeVisible();
    await expect(page.getByRole('button', { name: 'חזרה לשלב הנוכחי' })).toHaveCount(0);

    // Forward one from a step already confirmed: a single step, not a jump.
    await here.click();
    await expect(page.getByText(/שלב 2 מתוך/)).toBeVisible();
  });

  test('dots uncheck ahead of the viewed step and re-check going forward', async ({ page }) => {
    const here = page.getByRole('button', { name: 'אני כאן' });
    const back = page.getByRole('button', { name: 'השלב הקודם' });

    await here.click();
    await here.click();
    await expect(page.getByText(/שלב 3 מתוך/)).toBeVisible();
    expect(await filledDots(page)).toBe(3);

    await back.click();
    await expect(page.getByText(/שלב 2 מתוך/)).toBeVisible();
    expect(await filledDots(page)).toBe(2);

    await here.click();
    await expect(page.getByText(/שלב 3 מתוך/)).toBeVisible();
    expect(await filledDots(page)).toBe(3);
  });

  test('the back arrow returns to the route to the hospital and clears arrival', async ({ page }) => {
    await page.getByRole('button', { name: 'חזרה לדרך לבית החולים' }).click();

    await expect(page.getByRole('heading', { name: 'בדרך לבית החולים' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'אני כאן' })).toHaveCount(0);

    // Re-entry needs the arrival button again.
    await page.getByRole('button', { name: 'הגעתי למרפאה' }).click();
    await expect(page.getByRole('button', { name: 'אני כאן' })).toBeVisible();
  });
  test('the last step is labelled as the arrival, not as another step', async ({ page }) => {
    const here = page.getByRole('button', { name: 'אני כאן' });

    // Walk to the final step. The cardiac route is short, so this is quick.
    const total = Number((await page.getByText(/שלב \d+ מתוך \d+/).innerText()).match(/מתוך (\d+)/)![1]);
    for (let i = 1; i < total; i++) {
      await here.click();
      await expect(page.getByText(new RegExp(`שלב ${i + 1} מתוך`))).toBeVisible();
    }

    await expect(page.getByRole('button', { name: 'הגעתי ליעד' })).toBeVisible();
    await expect(here).toHaveCount(0);

    // And it still does what the confirm always did: ends navigation.
    await page.getByRole('button', { name: 'הגעתי ליעד' }).click();
    await expect(page).toHaveURL(/\/waiting$/);
  });
});
