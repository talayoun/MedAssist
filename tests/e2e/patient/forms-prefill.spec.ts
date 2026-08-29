import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * What the visit already knows is not asked for again.
 *
 * The intake form opens with the patient's name filled in, and the value is a
 * real saved value, not decoration: it survives a reload and it satisfies the
 * submit gate. It stays editable, and an edit is never overwritten by the
 * prefill arriving late.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 *   pnpm --filter patient-pwa dev
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';
const PATIENT_NAME = 'רחל כהן';

/** Creates a visit the way the back office does: forms attach only when ticked. */
async function createVisitWithNameField(request: APIRequestContext): Promise<string> {
  const loginRes = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(loginRes.status(), 'admin login').toBe(200);

  const { departments } = await (await request.get(`${API_URL}/api/staff/departments`)).json();
  const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
  expect(dept, 'seeded department must exist').toBeTruthy();

  const { items } = await (await request.get(`${API_URL}/api/staff/form-templates`)).json();
  const nameField = items.find((i: { label: string }) => i.label === 'שם מלא');
  expect(nameField, 'the seeded intake form must have a full-name field').toBeTruthy();

  const apptRes = await request.post(`${API_URL}/api/staff/appointments`, {
    data: {
      patient_name: PATIENT_NAME,
      phone_number: `+97250${Date.now().toString().slice(-7)}`,
      department_id: dept.id,
      procedure_type: 'pre-op-cardiac',
      visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      custom_items: [],
      suppressed_template_item_ids: [],
      send_now: true,
      form_template_ids: [nameField.id],
    },
  });
  expect(apptRes.status(), 'create appointment').toBe(201);
  const token = (await apptRes.json()).magic_link_token;
  expect(token).toBeTruthy();
  return token;
}

test.describe('patient: the forms screen fills in what is already known', () => {
  let token: string;

  test.beforeEach(async ({ request }) => {
    token = await createVisitWithNameField(request);
  });

  test('the name arrives filled, saved, and still editable', async ({ page }) => {
    await page.goto(`/visit/${token}/forms`);

    const nameInput = page.getByRole('textbox').first();
    await expect(nameInput).toHaveValue(PATIENT_NAME);
    await expect(nameInput).toBeEditable();

    // Saved, not just displayed: a reload brings it back from the server.
    await page.reload();
    await expect(page.getByRole('textbox').first()).toHaveValue(PATIENT_NAME);
  });

  test('an edit replaces the prefilled name and survives a reload', async ({ page }) => {
    await page.goto(`/visit/${token}/forms`);

    const nameInput = page.getByRole('textbox').first();
    await expect(nameInput).toHaveValue(PATIENT_NAME);

    await nameInput.fill('רחל כהן-לוי');
    await nameInput.blur();

    await page.reload();
    await expect(page.getByRole('textbox').first()).toHaveValue('רחל כהן-לוי');
  });
});
