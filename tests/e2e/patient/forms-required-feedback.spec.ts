import { test, expect, APIRequestContext, Page } from '@playwright/test';

/**
 * A blocked submit used to change nothing on the item that blocked it. The
 * patient was scrolled to a card that looked exactly like every other card,
 * under a message about "fields marked as required" when nothing was marked.
 *
 * Now: outstanding required items carry חובה from the start, and the ones that
 * actually stopped a submit turn into the error card until they are filled.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 *   pnpm --filter patient-pwa dev
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

const ID_FIELD = 'תעודת זהות';
const CLINIC_CONSENT = 'הסכמה לניתוח קטרקט';

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

/** The card wrapper for the item carrying exactly this label. */
function itemCard(page: Page, label: string) {
  // Exact, because 'תעודת זהות' is also a substring of 'צילום תעודת זהות (כולל הספח)'.
  return page.locator('[id^="form-item-"]').filter({ has: page.getByText(label, { exact: true }) });
}

test.describe('patient: required items say so, and say when they blocked you', () => {
  let token: string;

  test.beforeEach(async ({ request }) => {
    token = await createEyeVisit(request);
  });

  test('outstanding required items are marked, the clinic-owned consent is not', async ({ page }) => {
    await page.goto(`/visit/${token}/forms`);
    await expect(page.getByRole('heading', { name: 'מסמכים', exact: true })).toBeVisible({ timeout: 10_000 });

    // Every marker on screen belongs to something the patient can act on.
    expect(await page.getByText('חובה', { exact: true }).count()).toBeGreaterThan(0);

    // The consent still waiting on the clinic is required but not the patient's
    // to clear, so it carries its explanation instead of a marker.
    const consent = itemCard(page, CLINIC_CONSENT);
    await expect(consent.getByText('חובה', { exact: true })).toHaveCount(0);
    await expect(consent.getByText('המרפאה תכין את הטופס עבורך, לא נדרשת פעולה מצדך')).toBeVisible();
  });

  test('a blocked submit turns the blocking items red and keeps the patient on the page', async ({ page }) => {
    await page.goto(`/visit/${token}/forms`);
    await expect(page.getByRole('heading', { name: 'מסמכים', exact: true })).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('[data-invalid="true"]')).toHaveCount(0);

    await page.getByTestId('forms-submit-btn').click();

    await expect(page).toHaveURL(new RegExp(`/visit/${token}/forms$`));
    await expect(page.getByTestId('forms-submit-error')).toBeVisible();
    expect(await page.locator('[data-invalid="true"]').count()).toBeGreaterThan(0);

    // The consent the clinic owes never blocked, so it never goes red.
    expect(await itemCard(page, CLINIC_CONSENT).getAttribute('data-invalid')).toBeNull();
  });

  test('filling a flagged item clears it without another submit', async ({ page }) => {
    await page.goto(`/visit/${token}/forms`);
    await expect(page.getByRole('heading', { name: 'מסמכים', exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('forms-submit-btn').click();

    const idCard = itemCard(page, ID_FIELD);
    await expect(idCard).toHaveAttribute('data-invalid', 'true');
    await expect(idCard.getByText('שדה חובה')).toBeVisible();

    const input = idCard.locator('input[type="text"]');
    await input.fill('012345678');
    await input.blur();

    await expect(idCard).not.toHaveAttribute('data-invalid', 'true');
    await expect(idCard.getByText('שדה חובה')).toHaveCount(0);
    await expect(idCard.getByText('חובה', { exact: true })).toHaveCount(0);
  });
});
