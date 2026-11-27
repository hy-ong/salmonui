import { expect, test, type Page } from '@playwright/test';

// Saving to a server: one dataSource.write per batch save; a
// partial or failed write keeps the drafts with the server errors.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/editing-server');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const requests = (page: Page) => page.getByRole('log', { name: 'Server requests' });

async function editCustomer(page: Page, rowId: string, value: string): Promise<void> {
  await cell(page, rowId, 'customer').dblclick();
  const input = cell(page, rowId, 'customer').locator('input');
  await input.fill(value);
  await input.press('Tab');
}

test('one write per save; the server rejects one cell and keeps its draft', async ({ page }) => {
  const problems = await open(page);
  await editCustomer(page, 'ORD-10000', 'Accepted name');
  await page.keyboard.press('Escape');
  await editCustomer(page, 'ORD-10001', 'Please reject me');
  await page.keyboard.press('Escape');
  await page.getByRole('toolbar').getByRole('button', { name: 'Save' }).click();
  // confirmSave defaults on: accept the save prompt.
  await page.locator('dialog.salmon-data-grid-confirm[data-kind="save"] [data-confirm="ok"]').click();
  await expect(cell(page, 'ORD-10001', 'customer')).toHaveAttribute('data-pending', /.*/);
  await expect(requests(page)).toContainText('write (batch): +0 ~2 −0');
  await expect(requests(page)).toContainText('write partial: rejected ORD-10001');
  // Accepted: saved and clean. Rejected: still dirty, invalid, with the server message.
  await expect(cell(page, 'ORD-10000', 'customer')).toHaveText('Accepted name');
  await expect(cell(page, 'ORD-10000', 'customer')).not.toHaveAttribute('data-dirty', /.*/);
  const rejected = cell(page, 'ORD-10001', 'customer');
  await expect(rejected).toHaveAttribute('data-dirty', /.*/);
  await expect(rejected).toHaveAttribute('data-invalid', /.*/);
  await expect(rejected).toContainText('Please reject me');
  // Scoped to the demo: the page's Source tab holds the same literal.
  await expect(page.locator('[data-demo-id]').getByText('The server rejected this customer name.')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('a failed request rolls back to the drafts', async ({ page }) => {
  const problems = await open(page);
  await page.locator('.demo-toolbar').getByRole('combobox', { name: 'server', exact: true }).click();
  await page.getByRole('option', { name: 'offline (request fails)', exact: true }).click();
  await editCustomer(page, 'ORD-10002', 'Offline edit');
  await page.keyboard.press('Escape');
  await page.getByRole('toolbar').getByRole('button', { name: 'Save' }).click();
  // confirmSave defaults on: accept the save prompt.
  await page.locator('dialog.salmon-data-grid-confirm[data-kind="save"] [data-confirm="ok"]').click();
  await expect(requests(page)).toContainText('write failed: server unavailable');
  await expect(cell(page, 'ORD-10002', 'customer')).toHaveAttribute('data-dirty', /.*/);
  await expect(cell(page, 'ORD-10002', 'customer')).not.toHaveAttribute('data-pending', /.*/);
  // Back online: the same drafts save.
  await page.locator('.demo-toolbar').getByRole('combobox', { name: 'server', exact: true }).click();
  await page.getByRole('option', { name: 'accepts everything', exact: true }).click();
  await page.getByRole('toolbar').getByRole('button', { name: 'Save' }).click();
  // confirmSave defaults on: accept the save prompt.
  await page.locator('dialog.salmon-data-grid-confirm[data-kind="save"] [data-confirm="ok"]').click();
  await expect(requests(page)).toContainText('write applied');
  await expect(cell(page, 'ORD-10002', 'customer')).not.toHaveAttribute('data-dirty', /.*/);
  await expect(cell(page, 'ORD-10002', 'customer')).toHaveText('Offline edit');
  // The failed request may log to the console; only page errors count here.
  expect(problems.filter((p) => p.startsWith('pageerror'))).toEqual([]);
});
