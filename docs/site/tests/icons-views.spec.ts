import { expect, test, type Page } from '@playwright/test';

// Custom icons: the server renders the `icons` nodes, hydration keeps
// them without warnings, and switching back shows the built-in SVG masks.
// Named saved views: save the current layout, apply it after a
// change, delete it.

async function open(page: Page, path: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(path);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  return problems;
}

const sortIndicator = (page: Page) => page.locator('.salmon-data-grid [role="columnheader"][data-column-id="amount"] .salmon-data-grid-sort-indicator');

const beforeStyle = (page: Page) =>
  sortIndicator(page).evaluate((el) => {
    const style = getComputedStyle(el, '::before');
    return { content: style.content, mask: style.maskImage };
  });

test('custom icons render on the server and hydrate; built-ins are SVG masks', async ({ page, request }) => {
  const html = await (await request.get('/demos/data-grid/icons')).text();
  expect(html).toMatch(/class="salmon-data-grid-sort-indicator" data-direction="desc" aria-hidden="true" data-custom-icon=""><svg/);

  const problems = await open(page, '/demos/data-grid/icons');
  await expect(sortIndicator(page).locator('svg')).toHaveCount(1);
  expect((await beforeStyle(page)).content).toBe('none');
  await expect(page.locator('.salmon-data-grid-pager__next svg')).toHaveCount(1);
  await expect(page.locator('.salmon-data-grid-pager__next')).toHaveAccessibleName(/next/i);

  await page.getByRole('checkbox', { name: 'Custom icons' }).uncheck();
  await expect(sortIndicator(page).locator('svg')).toHaveCount(0);
  const builtIn = await beforeStyle(page);
  expect(builtIn.content).toBe('""');
  expect(builtIn.mask).toContain('data:image/svg+xml');
  expect(problems).toEqual([]);
});

test('named saved views save, apply and delete a layout', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/saved-views');
  await page.evaluate(() => localStorage.removeItem('salmonui:grid-views:docs-saved-views'));
  await page.reload();
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  const views = page.getByRole('group', { name: 'Saved views' });
  await expect(views).toContainText('No saved views yet.');

  const customer = page.locator('.salmon-data-grid [role="columnheader"][data-column-id="customer"]');
  await customer.click();
  await expect(customer).toHaveAttribute('aria-sort', 'ascending');
  await page.getByLabel('View name').fill('By customer');
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(views.getByRole('button', { name: 'By customer', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Default layout' }).click();
  await expect(customer).not.toHaveAttribute('aria-sort', 'ascending');
  await views.getByRole('button', { name: 'By customer', exact: true }).click();
  await expect(customer).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('.demo-status')).toContainText('Applied "By customer"');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('salmonui:grid-views:docs-saved-views') ?? 'null') as { views: { name: string }[] } | null);
  expect(stored?.views.map((v) => v.name)).toEqual(['By customer']);

  await views.getByRole('button', { name: 'Delete view By customer' }).click();
  await expect(views).toContainText('No saved views yet.');
  expect(problems).toEqual([]);
});
