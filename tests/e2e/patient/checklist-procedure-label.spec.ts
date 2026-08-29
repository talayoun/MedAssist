import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * The checklist subtitle used to read `לקראת: cataract-surgery`: an English
 * database slug on a patient screen, in an otherwise fully Hebrew app.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 *   pnpm --filter patient-pwa dev
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function createVisit(request: APIRequestContext, procedure: string, deptName: string): Promise<string> {
  const loginRes = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(loginRes.status(), 'admin login').toBe(200);

  const { departments } = await (await request.get(`${API_URL}/api/staff/departments`)).json();
  const dept = departments.find((d: { name: string }) => d.name === deptName);
  expect(dept, `seeded department ${deptName} must exist`).toBeTruthy();

  const apptRes = await request.post(`${API_URL}/api/staff/appointments`, {
    data: {
      patient_name: 'רחל כהן',
      phone_number: `+97250${Date.now().toString().slice(-7)}`,
      department_id: dept.id,
      procedure_type: procedure,
      // Far enough out that the urgent banner does not take the subtitle's place.
      visit_datetime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
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

test.describe('patient: the checklist names the procedure in Hebrew', () => {
  test('the eye patient reads ניתוח קטרקט, not the slug', async ({ request, page }) => {
    const token = await createVisit(request, 'cataract-surgery', 'עיניים');

    await page.goto(`/visit/${token}/checklist`);
    await expect(page.getByText('לקראת: ניתוח קטרקט')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/cataract-surgery/)).toHaveCount(0);
  });

  test('the cardiac patient reads הכנה לניתוח לב', async ({ request, page }) => {
    const token = await createVisit(request, 'pre-op-cardiac', 'קרדיולוגיה');

    await page.goto(`/visit/${token}/checklist`);
    await expect(page.getByText('לקראת: הכנה לניתוח לב')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/pre-op-cardiac/)).toHaveCount(0);
  });
});
