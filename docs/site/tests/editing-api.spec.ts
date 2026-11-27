import { expect, test, type Page } from '@playwright/test';

// Edit methods and events demo: capability flags, newRowPosition,
// the DataGrid edit methods, column
// defaults, the primary key and read-only policies, the edit events and Tab to the next row.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/editing-api');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('.salmon-data-grid');
const cell = (page: Page, rowId: string, columnId: string) => grid(page).locator(`[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const log = (page: Page) => page.getByRole('log', { name: 'Edit events' });
const method = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('methods: updateCell, getPendingChanges, save, applyChanges', async ({ page }) => {
  const problems = await open(page);
  await method(page, 'updateCell(first row, priority)').click();
  await expect(log(page)).toContainText('updateCell: applied');
  await expect(cell(page, 'ORD-10000', 'priority')).toHaveText('High');
  await expect(cell(page, 'ORD-10000', 'priority')).toHaveAttribute('data-dirty', /.*/);
  await method(page, 'getPendingChanges()').click();
  await expect(log(page)).toContainText('getPendingChanges: added 0, changed 1, deleted 0');
  await method(page, 'save()').click();
  await expect(log(page)).toContainText('onSave (batch): +0 ~1 −0');
  await expect(cell(page, 'ORD-10000', 'priority')).not.toHaveAttribute('data-dirty', /.*/);
  await method(page, 'applyChanges(5 rows → Low)').click();
  await expect(log(page)).toContainText('applyChanges: applied');
  for (let i = 0; i < 5; i++) await expect(cell(page, `ORD-1000${i}`, 'priority')).toHaveText('Low');
  expect(problems).toEqual([]);
});

test('addRow uses the column defaults and newRowPosition; add: false refuses', async ({ page }) => {
  const problems = await open(page);
  await method(page, 'addRow()').click();
  await expect(log(page)).toContainText('onAdd at top');
  const added = grid(page).locator('[data-new]');
  await expect(added).toHaveCount(1);
  await expect(added.locator('[data-column-id="quantity"]')).toContainText('1');
  await expect(added.locator('[data-column-id="unitPrice"]')).toContainText('$10.00');
  await expect(added.locator('[data-column-id="priority"]')).toContainText('Normal');

  await page.getByRole('combobox', { name: 'newRowPosition' }).click();
  await page.getByRole('option', { name: 'bottom', exact: true }).click();
  await method(page, 'addRow()').click();
  await expect(log(page)).toContainText('onAdd at bottom');

  await page.getByRole('checkbox', { name: 'add', exact: true }).uncheck();
  await method(page, 'addRow()').click();
  await expect(log(page)).toContainText('addRow: rejected');
  expect(problems).toEqual([]);
});

test('read-only cells, isCellEditable and onBeforeEditStart cancel', async ({ page }) => {
  const problems = await open(page);
  // Primary key and editable: false columns never open an editor.
  await cell(page, 'ORD-10001', 'id').dblclick();
  await expect(grid(page).locator('.salmon-data-grid-editor')).toHaveCount(0);
  await cell(page, 'ORD-10001', 'country').dblclick();
  await expect(grid(page).locator('.salmon-data-grid-editor')).toHaveCount(0);
  await cell(page, 'ORD-10001', 'customer').dblclick();
  await expect(cell(page, 'ORD-10001', 'customer').locator('input')).toBeFocused();
  await expect(log(page)).toContainText('onEditStart: ORD-10001 / customer');
  await page.keyboard.press('Escape');

  // isCellEditable: the quantity of a shipped order is locked.
  const shippedRow = grid(page).locator('[data-row-id]').filter({ has: page.locator('[data-column-id="shipped"] [aria-checked="true"], [data-column-id="shipped"] input:checked') }).first();
  await shippedRow.locator('[data-column-id="quantity"]').dblclick();
  await expect(grid(page).locator('.salmon-data-grid-editor')).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'onBeforeEditStart: block the first row' }).check();
  await cell(page, 'ORD-10000', 'customer').dblclick();
  await expect(log(page)).toContainText('onBeforeEditStart: prevented ORD-10000');
  await expect(grid(page).locator('.salmon-data-grid-editor')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Tab from the last editable cell continues on the next row (tabToNextRow)', async ({ page }) => {
  const problems = await open(page);
  await cell(page, 'ORD-10001', 'priority').dblclick();
  await expect(cell(page, 'ORD-10001', 'priority').locator('select')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cell(page, 'ORD-10002', 'customer').locator('input')).toBeFocused();
  expect(problems).toEqual([]);
});
