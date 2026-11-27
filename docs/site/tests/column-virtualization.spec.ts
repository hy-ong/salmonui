import { expect, test, type Page } from '@playwright/test';

// The column-virtualization demo: 2,000 rows x 81 columns
// under stacked headers with column virtualization on; autofit, copy and
// grouping from the column menu reach columns that were never rendered.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/column-virtualization');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('[role="grid"]').first();
const log = (page: Page) => page.getByRole('log', { name: 'Event log' });
const rendered = (page: Page, columnId: string) => grid(page).locator(`[data-column-id="${columnId}"]`).count();

test('column-virtualization: autofit, copy and column-menu grouping act on unrendered columns', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const problems = await open(page);
  // Column virtualization is on: the far columns and their header group are not in the DOM.
  expect(await rendered(page, 'c80')).toBe(0);
  expect(await rendered(page, 'c75')).toBe(0);
  await expect(grid(page).locator('[data-group-id="block8"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Autofit all columns' }).click();
  await expect(log(page)).toContainText(/autofit all: Text 80 went from 120 px to (?!120 )\d+ px/);
  expect(await rendered(page, 'c80')).toBe(0);

  await page.getByRole('button', { name: 'Copy rows 0-2 over all columns' }).click();
  await expect(log(page)).toContainText('copied 3 rows x 80 columns');
  const lines = (await page.evaluate(() => navigator.clipboard.readText())).split('\n');
  expect(lines).toHaveLength(3);
  expect((lines[0] as string).split('\t')).toHaveLength(80);

  // Scroll to the far columns: the stacked header group renders over its leaves.
  await page.getByRole('button', { name: 'Scroll to column 75' }).click();
  await expect(grid(page).locator('[data-group-id="block8"]')).toHaveCount(1);
  await expect(grid(page).locator('.salmon-data-grid-header-cell[data-column-id="c75"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to the first column' }).click();
  await expect(grid(page).locator('[data-group-id="block8"]')).toHaveCount(0);

  // Group by column 75 from its column menu while it is not rendered (the cell range of the copy is still selected).
  expect(await rendered(page, 'c75')).toBe(0);
  await page.getByRole('button', { name: 'Column menu of column 75' }).click();
  await page.getByRole('menu', { name: 'Value 75 column menu' }).locator('[data-item-id="group"]').click();
  await expect(log(page)).toContainText('grouped by: c75');
  await expect(grid(page).locator('.salmon-data-grid-group-caption').first()).toBeVisible();
  expect(problems).toEqual([]);
});
