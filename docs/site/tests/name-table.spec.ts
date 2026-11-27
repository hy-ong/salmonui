import { expect, test, type Page } from '@playwright/test';

// Behavior of the demos for the name-table features added after the code
// rename: the column chooser options and templates, URL-synced remote paging with `paging.totalRowCount`,
// `onViewChange`, `renderError` with retry, and the row
// number column.

async function open(page: Page, path: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(path);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  // Let deferred effects and data loads settle (dev compiles on demand).
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  return problems;
}

test('column chooser: accent-insensitive debounced search, header and footer templates, OK applies', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/column-chooser-templates');
  await page.locator('[data-toolbar-item="columnChooser"]').click();
  const dialog = page.locator('.salmon-data-grid-column-chooser');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.demo-chooser__summary')).toHaveText('7 of 10 columns shown');
  const search = dialog.locator('input[type="search"]');
  await expect(search).toBeFocused();
  await search.fill('categorie');
  // Debounced: the list still shows every column right after typing.
  await expect(dialog.locator('.salmon-data-grid-column-chooser__item[data-column-id="customer"]')).toBeVisible();
  await expect(dialog.locator('.salmon-data-grid-column-chooser__item[data-column-id="customer"]')).toBeHidden();
  await expect(dialog.locator('.salmon-data-grid-column-chooser__item[data-column-id="category"]')).toBeVisible();
  await search.fill('');
  await search.press('Enter');
  await dialog.getByRole('button', { name: 'Show all' }).click();
  await expect(dialog.locator('.demo-chooser__summary')).toHaveText('10 of 10 columns shown');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="category"]')).toBeVisible();
  await expect(page.getByRole('log', { name: 'Column visibility' })).toContainText('chooser opened: 10 columns');
  expect(problems).toEqual([]);
});

test('url paging: reads ?page= after mount, writes page changes, total from paging.totalRowCount', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/url-paging?page=3');
  const grid = page.locator('[role="grid"]');
  const firstNumber = () => grid.locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-row-number]').first().textContent();
  await expect.poll(firstNumber).toBe('41');
  const pager = page.locator('.salmon-data-grid-pager[role="navigation"]');
  await expect(pager).toHaveAttribute('data-page', '3');
  await expect(pager).toHaveAttribute('data-page-count', '50');
  await pager.locator('.salmon-data-grid-pager__next').click();
  await expect.poll(firstNumber).toBe('61');
  await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('4');
  await pager.locator('.salmon-data-grid-pager__first').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe(null);
  const log = page.getByRole('log', { name: 'View changes and errors' });
  await expect(log).toContainText('view: page, 20 of 1000 rows (pointer)');
  expect(problems).toEqual([]);
});

test('renderError replaces the rows after a failed read; retry reads the same page again', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/url-paging');
  const grid = page.locator('[role="grid"]');
  await expect(grid.locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-row-number]').first()).toHaveText('1');
  await page.getByRole('button', { name: 'Fail the next request' }).click();
  await page.locator('.salmon-data-grid-pager__next').click();
  const error = grid.locator('.salmon-data-grid-error .demo-error');
  await expect(error).toContainText('The orders service timed out');
  await expect(grid.locator('.salmon-data-grid-rows [data-row-number]')).toHaveCount(0);
  await expect(page.getByRole('log', { name: 'View changes and errors' })).toContainText('error (data): The orders service timed out');
  await error.getByRole('button', { name: 'Try again' }).click();
  await expect(grid.locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-row-number]').first()).toHaveText('21');
  await expect(grid.locator('.salmon-data-grid-error')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('row number column: numbers continue across pages and skip group captions', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/row-number');
  const grid = page.locator('[role="grid"]');
  const numbers = grid.locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-row-number]');
  await expect(numbers.first()).toHaveText('1');
  await page.locator('.salmon-data-grid-pager__next').click();
  await expect(numbers.first()).toHaveText('26');
  await grid.locator('.salmon-data-grid-header-cell[data-column-id="country"] .salmon-data-grid-group-toggle-button').click();
  await expect(grid.locator('.salmon-data-grid-group-caption').first()).toBeVisible();
  // The first data row after the page's first caption.
  await expect(numbers.first()).toHaveText('26');
  expect(problems).toEqual([]);
});
