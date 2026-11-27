import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Events demos: onReady per mount, cancellable before-events,
// headerProps, selection / resize / column drag / menu
// events, per-row and per-cell hooks, and
// row and cell click events.

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
const header = (page: Page, columnId: string) => grid(page).locator(`[role="columnheader"][data-column-id="${columnId}"]`);
const cell = (page: Page, rowId: string, columnId: string) => grid(page).locator(`[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const log = (page: Page) => page.getByRole('log', { name: 'Event log' });

test('grid-events: onReady fires on every mount', async ({ page }) => {
  const problems = await open(page, 'grid-events');
  const ready = log(page).locator('li', { hasText: 'onReady: 1000 view rows' });
  await expect(ready.first()).toBeVisible();
  await page.waitForTimeout(200);
  // React StrictMode (next dev) mounts every effect twice, so count per mount.
  const perMount = await ready.count();
  await page.getByRole('button', { name: 'Unmount the grid' }).click();
  await expect(page.locator('[role="grid"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount the grid' }).click();
  await expect(ready).toHaveCount(perMount * 2);
  expect(problems).toEqual([]);
});

test('grid-events: before-events cancel; headerProps reach the header', async ({ page }) => {
  const problems = await open(page, 'grid-events');
  await expect(header(page, 'amount')).toHaveAttribute('title', 'Order total in US dollars');
  await expect(header(page, 'amount')).toHaveAttribute('data-unit', 'usd');

  await header(page, 'customer').click();
  await expect(log(page)).toContainText('onSortChange: customer asc');
  await page.getByLabel('Cancel sorting in onBeforeSortChange').check();
  await header(page, 'country').click();
  await expect(log(page).locator('li').first()).toHaveText('onBeforeSortChange: country (prevented)');
  await expect(log(page)).not.toContainText('onSortChange: country');
  await expect(header(page, 'country')).not.toHaveAttribute('aria-sort', /ascending|descending/);
  expect(problems).toEqual([]);
});

test('grid-events: selection, resize, column drag and menu events', async ({ page }) => {
  const problems = await open(page, 'grid-events');
  await expect(log(page)).toContainText('onReady');

  await cell(page, 'ORD-10001', 'customer').click();
  await expect(log(page)).toContainText('onSelectionChange: +1 −0 (pointer)');

  const handle = header(page, 'customer').locator('.salmon-data-grid-resize-handle');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(log(page)).toContainText('onColumnResizeStart: customer');
  await expect(log(page)).toContainText(/onColumnResizeEnd: customer 150 → (19|20|21)\d/);

  const from = (await header(page, 'country').boundingBox())!;
  const to = (await header(page, 'id').boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(log(page)).toContainText('onColumnDragStart: country');
  await expect(log(page)).toContainText(/onColumnDrop: country 2 → 0/);
  await expect(log(page)).toContainText('onColumnReorder: country');

  await header(page, 'amount').hover();
  await header(page, 'amount').locator('.salmon-data-grid-column-menu-button').click();
  await expect(log(page)).toContainText(/onBeforeColumnMenuOpen: amount, \d+ items/);
  await page.getByRole('menu').getByRole('menuitem').first().click();
  await expect(log(page)).toContainText('onColumnMenuItemClick:');

  await cell(page, 'ORD-10002', 'country').click({ button: 'right' });
  await expect(log(page)).toContainText('onBeforeContextMenuOpen: cell ORD-10002');
  await page.getByRole('menu', { name: 'Context menu' }).getByRole('menuitem', { name: 'Log this row' }).click();
  await expect(log(page)).toContainText('onContextMenuItemClick: logRow on ORD-10002');
  expect(problems).toEqual([]);
});

test('row-events: cell events precede row events; preventDefault skips selection and edit start', async ({ page }) => {
  const problems = await open(page, 'row-events');
  const entries = log(page).locator('li');
  await cell(page, 'ORD-10001', 'customer').click();
  await expect(log(page)).toContainText(/onCellClick: ORD-10001 customer = \S/);
  await expect(log(page)).toContainText(/onRowClick: ORD-10001 row \d+ \(customer\)/);
  await expect(log(page)).toContainText('onSelectionChange: +1 −0');
  // Newest first: the row event was logged after the cell event.
  const clicks = await entries.allTextContents();
  expect(clicks.findIndex((t) => t.startsWith('onRowClick'))).toBeLessThan(clicks.findIndex((t) => t.startsWith('onCellClick')));

  const edited = cell(page, 'ORD-10002', 'customer');
  await edited.dblclick();
  await expect(log(page)).toContainText('onCellDoubleClick: ORD-10002 customer');
  await expect(log(page)).toContainText('onRowDoubleClick: ORD-10002 (Customer)');
  await expect(log(page)).toContainText('onEditStart: ORD-10002');
  await expect(edited.locator('input')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(edited.locator('input')).toHaveCount(0);

  await page.getByLabel('Call preventDefault() in onRowClick and onRowDoubleClick').check();
  const selections = await entries.filter({ hasText: 'onSelectionChange' }).count();
  await cell(page, 'ORD-10003', 'country').click();
  await expect(log(page)).toContainText(/onRowClick: ORD-10003 row \d+ \(country\) \(prevented\)/);
  await expect(entries.filter({ hasText: 'onSelectionChange' })).toHaveCount(selections);
  const prevented = cell(page, 'ORD-10004', 'customer');
  await prevented.dblclick();
  await expect(log(page)).toContainText('onRowDoubleClick: ORD-10004 (Customer) (prevented)');
  await expect(prevented.locator('input')).toHaveCount(0);
  await expect(log(page)).not.toContainText('onEditStart: ORD-10004');
  expect(problems).toEqual([]);
});

test('cell-templates: getRowProps and getCellProps hooks render on rows and cells', async ({ page }) => {
  const problems = await open(page, 'cell-templates');
  const flagged = grid(page).locator('.salmon-data-grid-rows [data-row-id][data-priority="high"]');
  await expect(flagged.first()).toBeVisible();
  await expect(flagged.first()).toHaveClass(/demo-row--flagged/);
  await expect(grid(page).locator('.salmon-data-grid-cell[data-column-id="city"][title="Ships from the Osaka warehouse"]').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('export-print: groupCaption and aggregateCell export hooks run and shape the file', async ({ page }) => {
  const problems = await open(page, 'export-print');
  await expect(grid(page).locator('.salmon-data-grid-rows [data-row-id]').first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV with caption and aggregate hooks' }).click();
  const text = await readFile((await (await download).path())!, 'utf8');
  expect(text).toMatch(/France \(\d+ orders\)/);
  expect(text).toContain('Total ');
  await expect(log(page)).toContainText(/hooks: groupCaption [1-9]\d*, aggregateCell [1-9]\d*/);
  expect(problems).toEqual([]);
});
