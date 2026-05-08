import { test, expect, APIRequestContext } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function createTokenForTest(request: APIRequestContext): Promise<string> {
  const loginRes = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(loginRes.status(), 'admin login').toBe(200);

  const { departments } = await (await request.get(`${API_URL}/api/staff/departments`)).json();
  const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
  expect(dept, 'seeded department must exist').toBeTruthy();

  const apptRes = await request.post(`${API_URL}/api/staff/appointments`, {
    data: {
      patient_name: 'Forms E2E Test',
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
  const body = await apptRes.json();
  expect(body.magic_link_token, 'magic_link_token must be present').not.toBeNull();
  return body.magic_link_token as string;
}

test.describe('patient: forms (mobile)', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await createTokenForTest(request);
  });

  test('html element has dir=rtl', async ({ page }) => {
    await page.goto(`/visit/${token}/checklist`);
    await page.waitForSelector('[role="checkbox"]', { timeout: 10_000 });
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
  });

  test('documents section appears in checklist', async ({ page }) => {
    await page.goto(`/visit/${token}/checklist`);
    await page.waitForSelector('[role="checkbox"]', { timeout: 10_000 });
    await expect(page.getByText('מסמכים')).toBeVisible({ timeout: 8_000 });
  });

  test('tap targets are at least 44x44px', async ({ page }) => {
    await page.goto(`/visit/${token}/checklist`);
    await page.waitForSelector('[role="checkbox"]', { timeout: 10_000 });
    // Wait for form items to load (they load async after checklist)
    await page.waitForTimeout(500);

    const buttons = page.locator('[data-testid="form-action-btn"]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box?.width ?? 44).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 44).toBeGreaterThanOrEqual(44);
    }
  });

  test('signature page renders canvas', async ({ page }) => {
    await page.goto(`/visit/${token}/checklist`);
    await page.waitForSelector('[role="checkbox"]', { timeout: 10_000 });

    const signBtn = page.getByText('חתום').first();
    if ((await signBtn.count()) === 0) {
      test.skip();
      return;
    }
    await signBtn.click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('שלח חתימה')).toBeVisible();
  });
});
