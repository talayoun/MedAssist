import { test, expect } from '@playwright/test';

/**
 * Constitutional requirement tests for the Patient PWA.
 * Asserts: RTL layout, tap targets ≥44×44px, body text ≥16px.
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm --filter api db:migrate && pnpm --filter api db:seed && pnpm --filter api dev
 *   pnpm --filter patient-pwa dev
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

const MIN_TAP_PX = 44;
const MIN_BODY_FONT_PX = 16;

test.describe('Patient PWA constitutional requirements', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginRes.status(), 'admin login').toBe(200);

    const { departments } = await (await request.get(`${API_URL}/api/staff/departments`)).json();
    const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
    expect(dept, 'seeded department must exist').toBeTruthy();

    const apptRes = await request.post(`${API_URL}/api/staff/appointments`, {
      data: {
        patient_name: 'Constitutional Test',
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
    token = body.magic_link_token;
  });

  test('html element has dir=rtl and lang=he', async ({ page }) => {
    await page.goto(`/visit/${token}/checklist`);
    await page.waitForSelector('[role="checkbox"]');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  });

  test('magic-link entry page has RTL layout', async ({ page }) => {
    await page.goto(`/visit/${token}`);
    // MagicLinkEntry renders briefly before redirecting — check html immediately
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('checklist items meet minimum tap target (44×44px)', async ({ page }) => {
    await page.goto(`/visit/${token}/checklist`);
    await page.waitForSelector('[role="checkbox"]');

    const items = page.locator('[role="checkbox"]');
    const count = await items.count();
    expect(count, 'at least one checklist item').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box, `item ${i} must be visible`).not.toBeNull();
      expect(box!.width, `item ${i} width ≥${MIN_TAP_PX}px`).toBeGreaterThanOrEqual(MIN_TAP_PX);
      expect(box!.height, `item ${i} height ≥${MIN_TAP_PX}px`).toBeGreaterThanOrEqual(MIN_TAP_PX);
    }
  });

  test('primary body text on checklist meets minimum font size (≥16px)', async ({ page }) => {
    await page.goto(`/visit/${token}/checklist`);
    await page.waitForSelector('[role="checkbox"]');

    // Checks headings, paragraphs, and buttons — primary readable content.
    // Supplementary labels (urgentBadge) are excluded by selector scope.
    const violations = await page.evaluate((minPx: number) => {
      const results: string[] = [];
      document.querySelectorAll('h1, h2, h3, p, button').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || !el.textContent?.trim()) return;
        const fs = parseFloat(window.getComputedStyle(el).fontSize);
        if (fs < minPx) {
          results.push(`<${el.tagName.toLowerCase()}> "${el.textContent!.trim().slice(0, 40)}" = ${fs}px`);
        }
      });
      return results;
    }, MIN_BODY_FONT_PX);

    expect(violations, `font-size violations:\n${violations.join('\n')}`).toHaveLength(0);
  });
});
