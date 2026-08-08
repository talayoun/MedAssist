import { test, expect } from '@playwright/test';

/**
 * The sidebar must be pinned to the viewport: the document itself never
 * scrolls, only the main content pane does, so the sign-out button stays
 * visible on every page for both roles.
 *
 * Prerequisites:
 *   docker compose up -d && pnpm --filter api db:migrate && pnpm --filter api db:seed
 *   doppler run -- pnpm dev
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /login|התחבר|כניסה/i }).click();
  await expect(page).toHaveURL(/\/queue/);
}

// Normal desktop height: the sidebar itself fits, so any document scroll
// comes from the content pane — that is the behavior under test.
const DESKTOP = { width: 1280, height: 720 };
// Below the admin sidebar's own natural height, to exercise inner nav scroll.
const NARROW = { width: 1280, height: 480 };

for (const path of ['/queue', '/admin/checklists', '/admin/navigation-routes']) {
  test(`sign-out stays in viewport on ${path}`, async ({ page }) => {
    await login(page);
    await page.setViewportSize(DESKTOP);
    await page.goto(path);

    const logout = page.getByRole('button', { name: 'יציאה' });
    await expect(logout).toBeInViewport();

    // The document must not scroll — only <main> may.
    const docScrolls = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return el.scrollHeight > el.clientHeight + 1;
    });
    expect(docScrolls).toBe(false);

    // Scrolling the main pane must not move the sign-out button.
    // (Post-fix guard only — before the fix `main` is not a scroller,
    // so this assertion passes vacuously. `docScrolls` is the red signal.)
    const before = await logout.boundingBox();
    await page.locator('main').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const after = await logout.boundingBox();
    expect(after?.y).toBeCloseTo(before!.y, 0);
    await expect(logout).toBeInViewport();
  });
}

test('sidebar nav scrolls internally while the footer stays pinned', async ({ page }) => {
  await login(page);
  await page.setViewportSize(NARROW);
  await page.goto('/admin/checklists');

  const logout = page.getByRole('button', { name: 'יציאה' });
  await expect(logout).toBeInViewport();

  const docScrolls = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollHeight > el.clientHeight + 1;
  });
  expect(docScrolls).toBe(false);
});

test('navigating from a scrolled queue lands at the top of the new page', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto('/queue');

  const main = page.locator('main');
  await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));

  // Guard: if the queue cannot actually scroll, the assertion below would
  // pass vacuously. Seed more appointments rather than weakening this.
  expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('button', { name: /פרטים/ }).first().click();
  await expect(page).toHaveURL(/\/patients\//);

  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
});
