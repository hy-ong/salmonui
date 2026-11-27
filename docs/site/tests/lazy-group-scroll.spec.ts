import { expect, test, type Page } from '@playwright/test';

// Lazy Load Grouping demo with infinite scrolling: scrolling
// near the end of an expanded group's loaded rows appends its next chunk
// without the Load more button, and the caption keeps the button as the
// keyboard path while more children exist.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/lazy-grouping');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('.salmon-data-grid').first();
const viewport = (page: Page) => grid(page).locator('.salmon-data-grid-viewport');
const rowCount = async (page: Page) => Number(await page.locator('[role="grid"]').first().getAttribute('aria-rowcount'));
const log = (page: Page) => page.locator('[role="log"]');
const childRequests = async (page: Page) => (await log(page).locator('li').allInnerTexts()).filter((t) => /^group \[.+ \/ .+\]/.test(t)).length;

test('lazy-grouping: with infiniteScroll, scrolling to the end of a group appends its next chunk', async ({ page }) => {
  const problems = await open(page);
  await page.getByLabel('Load more on scroll (infiniteScroll)').check();
  const countries = grid(page).locator('.salmon-data-grid-group-caption[data-depth="0"]');
  await expect(countries.first()).toBeVisible();
  await countries.first().locator('button[aria-label^="Expand"]').click();
  const city = grid(page).locator('.salmon-data-grid-group-caption[data-depth="1"]').first();
  await expect(city).toBeVisible();
  await city.locator('button[aria-label^="Expand"]').click();
  // The first chunk (50 rows) loads; the caption offers Load more as the keyboard path.
  await expect(city.getByRole('button', { name: 'Load more' })).toBeVisible();
  const afterFirst = await rowCount(page);
  const requestsAfterFirst = await childRequests(page);

  // Scroll to the bottom: the next chunk is appended without any click.
  await viewport(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => rowCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(afterFirst + 50);
  expect(await childRequests(page)).toBeGreaterThan(requestsAfterFirst);

  // Scrolling again appends again; each request carries the group path.
  const afterSecond = await rowCount(page);
  await viewport(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => rowCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(afterSecond + 1);

  // Without scrolling nothing more loads: the window does not reach the end of the group again.
  await viewport(page).evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(800);
  const settled = await childRequests(page);
  await page.waitForTimeout(800);
  expect(await childRequests(page)).toBe(settled);
  expect(problems).toEqual([]);
});
