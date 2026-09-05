import { test, expect } from '@playwright/test';

/**
 * E13 — rapid double-tap on the checklist.
 *
 * Each tap optimistically flips the box and POSTs the whole completed set. If a
 * save fails, the rollback must undo only that item — restoring a snapshot
 * captured when the tap started also erases any tap the patient made while the
 * request was still in flight.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 *   pnpm --filter patient-pwa dev
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

test.describe('checklist: optimistic rollback', () => {
  let token: string;

  // A fresh appointment per test: the rollback case deliberately leaves the server
  // holding a tick the UI rolled back, so a shared appointment would carry that
  // state into the next test and fail it for the wrong reason.
  test.beforeEach(async ({ request }) => {
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
    token = (await apptRes.json()).magic_link_token;
    expect(token).toBeTruthy();
  });

  test('a failed save reverts only its own item, not a later tap', async ({ page }) => {
    // Fail the first save, let every later one through — but hold the failure open
    // long enough that the second tap is already applied when the rollback fires.
    // Aborting immediately resolves before the second click and the two taps never
    // interleave, which is exactly the false negative this delay exists to avoid.
    const FAILURE_DELAY_MS = 800;
    let saveCount = 0;
    await page.route('**/checklist/progress', async (route) => {
      saveCount += 1;
      if (saveCount === 1) {
        await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await page.goto(`/visit/${token}/checklist`);

    const boxes = page.getByRole('checkbox');
    await expect(boxes.first()).toBeVisible();
    expect(await boxes.count(), 'need at least two items to test interleaving').toBeGreaterThan(1);

    const first = boxes.nth(0);
    const second = boxes.nth(1);
    await expect(first).toHaveAttribute('aria-checked', 'false');
    await expect(second).toHaveAttribute('aria-checked', 'false');

    // Two taps in quick succession while the first save is still hanging.
    await first.click();
    await second.click();
    await expect(second).toHaveAttribute('aria-checked', 'true');

    // Now let the first save's failure land.
    await page.waitForTimeout(FAILURE_DELAY_MS + 400);

    // The failed save's item reverts...
    await expect(first).toHaveAttribute('aria-checked', 'false');
    // ...and the tap that happened while it was in flight survives.
    // Pre-fix this is where it breaks: the stale-snapshot rollback unchecks both.
    await expect(second).toHaveAttribute('aria-checked', 'true');
  });

  test('a successful tap stays checked after a reload', async ({ page }) => {
    await page.goto(`/visit/${token}/checklist`);

    const boxes = page.getByRole('checkbox');
    await expect(boxes.first()).toBeVisible();

    const target = boxes.nth(0);
    await target.click();
    await expect(target).toHaveAttribute('aria-checked', 'true');

    await page.reload();
    await expect(page.getByRole('checkbox').nth(0)).toHaveAttribute('aria-checked', 'true');
  });
});
