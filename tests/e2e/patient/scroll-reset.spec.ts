import { test, expect, APIRequestContext, Page } from '@playwright/test';

/**
 * Every screen change starts at the top.
 *
 * A patient who scrolled to the bottom of the checklist used to land at that
 * same offset on the next screen, mid-page, with the heading off-screen.
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
      send_now: true,
    },
  });
  expect(apptRes.status(), 'create appointment').toBe(201);
  const token = (await apptRes.json()).magic_link_token;
  expect(token).toBeTruthy();
  return token;
}

/** Scroll as far down as the screen allows, and report where we ended up. */
async function scrollToBottom(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    return window.scrollY;
  });
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test.describe('patient: screen changes start at the top', () => {
  let token: string;

  test.beforeEach(async ({ request }) => {
    token = await createVisit(request);
  });

  test('moving between stages resets the scroll position', async ({ page }) => {
    await page.goto(`/visit/${token}/checklist`);
    await expect(page.getByRole('navigation', { name: 'ניווט ראשי' })).toBeVisible();

    const offset = await scrollToBottom(page);
    expect(offset, 'the checklist must be long enough to scroll for this to mean anything').toBeGreaterThan(0);

    await page.getByRole('button', { name: 'טפסים', exact: true }).click();
    await expect(page).toHaveURL(/\/forms$/);
    expect(await scrollY(page)).toBe(0);
  });

  test('moving between navigation steps resets the scroll position', async ({ page }) => {
    await page.goto(`/visit/${token}/navigation`);
    await page.getByRole('button', { name: 'הגעתי למרפאה' }).click();

    const here = page.getByRole('button', { name: 'אני כאן' });
    await expect(here).toBeVisible();

    const offset = await scrollToBottom(page);
    expect(offset, 'the step screen must be long enough to scroll').toBeGreaterThan(0);

    await here.click();
    await expect(page.getByText(/שלב 2 מתוך/)).toBeVisible();
    expect(await scrollY(page)).toBe(0);

    await scrollToBottom(page);
    await page.getByRole('button', { name: 'השלב הקודם' }).click();
    await expect(page.getByText(/שלב 1 מתוך/)).toBeVisible();
    expect(await scrollY(page)).toBe(0);
  });
});
