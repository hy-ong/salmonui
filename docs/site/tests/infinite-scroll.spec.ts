import { expect, test, type Page } from '@playwright/test';

// Infinite Scroll demo over the 50,000-order endpoint: seeded first blocks
// rendered on the server (initialResult), loading rows for unloaded rows of a
// known total, range reads as the viewport moves,
// the reset to the top on a sort, and the load-next command.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/infinite-scroll');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('[role="grid"]').first();
const viewport = (page: Page) => grid(page).locator('.salmon-data-grid-viewport');
const dataRows = (page: Page) => grid(page).locator('.salmon-data-grid-rows [role="row"][data-row-id^="ORD-"]');
const loadingRows = (page: Page) => grid(page).locator('.salmon-data-grid-loading-row');
const log = (page: Page) => page.getByRole('log', { name: 'Requests' });
const status = (page: Page) => page.getByTestId('infinite-status');

test('infinite-scroll: the seeded first blocks are in the server HTML', async ({ request }) => {
  const html = await (await request.get('/demos/data-grid/infinite-scroll')).text();
  expect(html).toContain('data-row-id="ORD-10000"');
  expect(html).toContain('data-row-id="ORD-10005"');
  // The known total sizes the scroll range: 50,000 rows plus the header row.
  expect(html).toContain('aria-rowcount="50001"');
});

test('infinite-scroll: scrolling far loads blocks; a sort resets to the top; load next reads the next block', async ({ page }) => {
  const problems = await open(page);
  await expect(dataRows(page).first()).toHaveAttribute('data-row-id', 'ORD-10000');
  await expect(loadingRows(page)).toHaveCount(0);

  // Jump to the middle: unloaded rows show loading rows, then the block lands.
  await viewport(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  await expect(loadingRows(page).first()).toBeVisible();
  await expect(loadingRows(page)).toHaveCount(0);
  const middle = Number(await dataRows(page).first().getAttribute('data-row-index'));
  expect(middle).toBeGreaterThan(10_000);
  await expect(log(page)).toContainText(/(read|prefetch) rows \[\d+, \d+\)/);
  await expect(status(page)).toContainText(/[1-9]\d* requests/);

  // A server-side sort drops the blocks and scrolls back to the top.
  await grid(page).getByRole('columnheader', { name: /Amount/ }).click();
  await expect(log(page)).toContainText(/(read|prefetch) rows \[0, 300\) sorted by amount asc/);
  await expect.poll(() => viewport(page).evaluate((el) => el.scrollTop)).toBe(0);
  await expect(dataRows(page).first()).toHaveAttribute('data-row-index', '0');
  await expect(loadingRows(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Load next block' }).click();
  await expect(log(page)).toContainText(/(read|prefetch) rows \[300, 400\) sorted by amount asc/);
  await expect(status(page)).toContainText('400 of 50,000 rows in memory');
  expect(problems).toEqual([]);
});

test('infinite-scroll: an order added at the bottom lands after the last row and the count grows', async ({ page }) => {
  const problems = await open(page);
  await expect(dataRows(page).first()).toHaveAttribute('data-row-id', 'ORD-10000');
  await page.getByRole('button', { name: 'Add order at the bottom' }).click();
  // The unsaved row opens in the band at the bottom edge of the body.
  const band = grid(page).locator('.salmon-data-grid-added-rows--bottom .salmon-data-grid-added-row');
  await expect(band).toHaveCount(1);
  // The viewport moved to the end: the last server rows load.
  await expect(grid(page).locator('.salmon-data-grid-row[data-row-index="49999"]')).toHaveAttribute('data-row-id', /^ORD-/);
  await band.locator('input').first().focus();
  await page.keyboard.press('Enter');
  const added = grid(page).locator('.salmon-data-grid-rows .salmon-data-grid-row[data-row-id="NEW-1"]');
  await expect(added).toHaveAttribute('data-row-index', '50000');
  await expect(added).toContainText('New customer');
  await expect(band).toHaveCount(0);
  await expect(grid(page)).toHaveAttribute('aria-rowcount', '50002');
  await expect(status(page)).toContainText('of 50,001 rows in memory');
  await expect(loadingRows(page)).toHaveCount(0);
  expect(problems).toEqual([]);
});
