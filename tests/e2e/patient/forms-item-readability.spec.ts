import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * Two things the walkthrough caught on the forms screen.
 *
 * A long label (`סיכום רפואי מרופא העיניים המפנה`) shared its row with the
 * status text and two upload buttons, so on a phone it collapsed into a narrow
 * stack of single words. And a required consent that staff has not prepared yet
 * showed status `ממתין` with no button and no explanation, leaving the patient
 * with a required item they cannot clear.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 *   pnpm --filter patient-pwa dev
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

const LONG_LABEL = 'סיכום רפואי מרופא העיניים המפנה';
const PENDING_CONSENT = 'הסכמה לניתוח קטרקט';

async function createEyeVisit(request: APIRequestContext): Promise<string> {
  const loginRes = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(loginRes.status(), 'admin login').toBe(200);

  const { departments } = await (await request.get(`${API_URL}/api/staff/departments`)).json();
  const dept = departments.find((d: { name: string }) => d.name === 'עיניים');
  expect(dept, 'seeded eye department must exist').toBeTruthy();

  const { items } = await (await request.get(`${API_URL}/api/staff/form-templates`)).json();
  const eyeItems = items.filter(
    (i: { procedure_type: string | null }) => i.procedure_type === null || i.procedure_type === 'cataract-surgery',
  );
  expect(eyeItems.length, 'eye forms must exist').toBeGreaterThan(0);

  const apptRes = await request.post(`${API_URL}/api/staff/appointments`, {
    data: {
      patient_name: 'רחל כהן',
      phone_number: `+97250${Date.now().toString().slice(-7)}`,
      department_id: dept.id,
      procedure_type: 'cataract-surgery',
      visit_datetime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      custom_items: [],
      suppressed_template_item_ids: [],
      send_now: true,
      form_template_ids: eyeItems.map((i: { id: string }) => i.id),
    },
  });
  expect(apptRes.status(), 'create appointment').toBe(201);
  const token = (await apptRes.json()).magic_link_token;
  expect(token).toBeTruthy();
  return token;
}

test.describe('patient: form items stay readable', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await createEyeVisit(request);
  });

  test('a long label gets the full width of its card', async ({ page }) => {
    await page.goto(`/visit/${token}/forms`);

    const label = page.getByTestId('form-item-label').filter({ hasText: LONG_LABEL });
    await expect(label).toBeVisible({ timeout: 10_000 });

    const labelBox = await label.boundingBox();
    expect(labelBox, 'label must be laid out').toBeTruthy();

    // Pre-fix the label shared its row with the status and two buttons, so it had
    // roughly a third of the card and broke to four lines of one word each. Height
    // is the honest measure: an inline box hugs its text, so its width says more
    // about the string than about the room it was given.
    const lineHeight = await label.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect(labelBox!.height, 'the label must fit in at most two lines').toBeLessThanOrEqual(lineHeight * 2 + 2);
  });

  test('a consent the clinic has not prepared explains itself', async ({ page }) => {
    await page.goto(`/visit/${token}/forms`);

    const consent = page.getByTestId('form-item-label').filter({ hasText: PENDING_CONSENT });
    await expect(consent).toBeVisible({ timeout: 10_000 });

    const card = consent.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
    await expect(card.getByText('המרפאה תכין את הטופס עבורך, לא נדרשת פעולה מצדך')).toBeVisible();
  });
});
