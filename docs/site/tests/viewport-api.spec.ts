import { expect, test, type Page } from '@playwright/test';

// Viewport demos: skeleton rows while remote blocks load,
// api.scrollTo on the DataGrid API demo, and getPageSizeForHeight
// on the Paging demo.

async function open(page: Page, id: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`/demos/data-grid/${id}`);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('[role="grid"]').first();
const viewport = (page: Page) => grid(page).locator('.salmon-data-grid-viewport');

test('skeleton-rows: unloaded rows shimmer until the block lands; off shows the loading text', async ({ page }) => {
  const problems = await open(page, 'skeleton-rows');
  await expect(grid(page).locator('[data-row-id="ORD-10000"]')).toBeVisible();
  await page.getByRole('button', { name: 'Jump to row 20,000' }).click();
  const skeleton = grid(page).locator('.salmon-data-grid-skeleton-row').first();
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute('aria-busy', 'true');
  await expect(skeleton.locator('.salmon-data-grid-skeleton-bar')).toHaveCount(6);
  // scrollTo({ top: 20,000 x 36 }) puts row 20,000 at the top; its block lands.
  await expect(grid(page).locator('[role="row"][data-row-index="20000"][data-row-id^="ORD-"]')).toBeVisible();
  await expect(grid(page).locator('.salmon-data-grid-skeleton-row')).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Skeleton rows' }).uncheck();
  await expect(grid(page).locator('[data-row-id="ORD-10000"]')).toBeVisible();
  await page.getByRole('button', { name: 'Jump to row 40,000' }).click();
  await expect(grid(page).locator('.salmon-data-grid-loading-row').first()).toHaveText('Loading');
  await expect(grid(page).locator('.salmon-data-grid-skeleton-bar')).toHaveCount(0);
  await expect(grid(page).locator('[role="row"][data-row-index="40000"][data-row-id^="ORD-"]')).toBeVisible();
  expect(problems).toEqual([]);
});

test('grid-api: scrollTo scrolls the body to an offset', async ({ page }) => {
  const problems = await open(page, 'grid-api');
  await page.getByRole('button', { name: 'Scroll to offset 3,600 px' }).click();
  await expect.poll(() => viewport(page).evaluate((el) => el.scrollTop)).toBe(3600);
  await expect(grid(page).locator('[role="row"][data-row-index="100"]')).toBeVisible();
  expect(problems).toEqual([]);
});

test('paging: getPageSizeForHeight fits the page, header and pager in a 480 px box', async ({ page }) => {
  const problems = await open(page, 'paging');
  await page.getByRole('checkbox', { name: 'Fit pages to a 480 px box' }).check();
  await expect(page.getByRole('log')).toContainText(/getPageSizeForHeight\(480\): \d+ rows/);
  const text = await page.getByRole('log').innerText();
  const size = Number(/getPageSizeForHeight\(480\): (\d+) rows/.exec(text)?.[1]);
  expect(size).toBeGreaterThan(5);
  await expect(grid(page).locator('.salmon-data-grid-rows [role="row"][data-row-id]')).toHaveCount(size);
  const box = await page.getByTestId('paging-box').evaluate((el) => {
    const outer = el.getBoundingClientRect();
    const pager = el.querySelector('.salmon-data-grid-pager') as HTMLElement;
    const root = el.querySelector('.salmon-data-grid') as HTMLElement;
    return { top: outer.top, bottom: outer.bottom, gridTop: root.getBoundingClientRect().top, pagerBottom: pager.getBoundingClientRect().bottom };
  });
  // The grid and its pager fill the box: they fit, and one more 36 px row would not.
  expect(box.pagerBottom - box.gridTop).toBeLessThanOrEqual(480.5);
  expect(box.pagerBottom - box.gridTop + 36).toBeGreaterThan(480);
  expect(problems).toEqual([]);
});
