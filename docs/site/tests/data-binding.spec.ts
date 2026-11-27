import { expect, test, type Page } from '@playwright/test';

// Data Binding demos: data source request hooks, a custom OData
// transport, remote batch
// writes, silent cell and row updates, the empty state,
// controlled writes, and the loading indicator with
// setLoading and refresh.

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
const cell = (page: Page, rowId: string, columnId: string) => grid(page).locator(`[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const log = (page: Page, label = 'Event log') => page.getByRole('log', { name: label });

test('odata-bridge: the transport maps sorting and paging to OData parameters', async ({ page }) => {
  const problems = await open(page, 'odata-bridge');
  const requests = log(page, 'OData requests');
  await expect(requests).toContainText('$skip=0&$top=10&$count=true');
  await expect(grid(page).locator('.salmon-data-grid-rows [data-row-id]')).toHaveCount(10);
  await grid(page).getByRole('columnheader', { name: /Amount/ }).click();
  await expect(requests.locator('li').first()).toContainText('$orderby=amount asc&$skip=0&$top=10');
  await page.getByRole('button', { name: /page 2/i }).first().click();
  await expect(requests.locator('li').first()).toContainText('$orderby=amount asc&$skip=10&$top=10');
  expect(problems).toEqual([]);
});

test('remote-json: onRequest and onResponse (beforeDataBound) fire for each read', async ({ page }) => {
  const problems = await open(page, 'remote-json');
  const requests = log(page, 'Requests');
  await expect(requests.locator('li').filter({ hasText: /^read: 200 rows in \d+ ms$/ })).toHaveCount(1);
  // onRequest runs for every send, including one a newer read supersedes or joins.
  const sent = await requests.locator('li').filter({ hasText: /^request read$/ }).count();
  expect(sent).toBeGreaterThanOrEqual(1);
  await grid(page).getByRole('columnheader', { name: /Customer/ }).click();
  await expect(requests.locator('li').filter({ hasText: /^request read$/ })).toHaveCount(sent + 1);
  await expect(requests.locator('li').filter({ hasText: /^read: 200 rows in \d+ ms$/ })).toHaveCount(2);
  await expect(requests.locator('li').first()).toHaveText(/^read: 200 rows in \d+ ms$/);
  expect(problems).toEqual([]);
});

test('remote-editing: batch changes go to the server as one write request', async ({ page }) => {
  const problems = await open(page, 'remote-editing');
  const target = cell(page, 'ORD-10001', 'customer');
  await expect(target).toBeVisible();
  await target.dblclick();
  const input = target.locator('input');
  await input.fill('Remote Buyer');
  await input.press('Enter');
  await page.getByRole('toolbar').getByRole('button', { name: 'Save' }).click();
  // confirmSave defaults on: accept the save prompt.
  await page.locator('dialog.salmon-data-grid-confirm[data-kind="save"] [data-confirm="ok"]').click();
  const requests = log(page, 'Server requests');
  await expect(requests).toContainText('write: 0 added, 1 changed (ORD-10001 customer), 0 removed');
  await expect(requests).toContainText('save: +0 ~1 −0, applied');
  await expect(target).toHaveText('Remote Buyer');

  // A rejected write keeps the pending change.
  await page.getByRole('button', { name: 'Fail the next save' }).click();
  await target.dblclick();
  await target.locator('input').fill('Lost Buyer');
  await target.locator('input').press('Enter');
  await page.getByRole('toolbar').getByRole('button', { name: 'Save' }).click();
  // confirmSave defaults on: accept the save prompt.
  await page.locator('dialog.salmon-data-grid-confirm[data-kind="save"] [data-confirm="ok"]').click();
  await expect(requests).toContainText('write rejected by the server');
  await expect(target).toHaveText('Lost Buyer');
  expect(problems).toEqual([]);
});

test('cell-updates: setCellValue and setRowData update in place', async ({ page }) => {
  const problems = await open(page, 'cell-updates');
  await expect(cell(page, 'ORD-10002', 'amount')).toBeVisible();
  const before = await cell(page, 'ORD-10002', 'amount').textContent();
  await page.getByRole('button', { name: 'Add 100 to ORD-10002 amount' }).click();
  await expect(log(page)).toContainText('setCellValue(ORD-10002, amount): applied');
  await expect(cell(page, 'ORD-10002', 'amount')).not.toHaveText(before ?? '');
  await page.getByRole('button', { name: 'Replace ORD-10003' }).click();
  await expect(log(page)).toContainText('setRowData(ORD-10003): applied');
  await expect(cell(page, 'ORD-10003', 'customer')).toHaveText('Updated customer');
  await expect(cell(page, 'ORD-10003', 'quantity')).toHaveText('99');
  expect(problems).toEqual([]);
});

test('empty-state: renderEmpty tells noData from noMatch; localeText.noRows is the default', async ({ page }) => {
  const problems = await open(page, 'empty-state');
  const empty = grid(page).locator('.salmon-data-grid-empty__cell');
  await page.getByRole('button', { name: 'Filter to no match' }).click();
  await expect(empty).toHaveText('No order matches the filter. Clear it to see every order.');
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(empty).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove every row' }).click();
  await expect(empty).toHaveText('The order book is empty.');
  await page.getByLabel('renderEmpty').uncheck();
  await expect(empty).toHaveText('No orders yet');
  expect(problems).toEqual([]);
});

test('controlled-data: a cell save reaches onDataChange', async ({ page }) => {
  const problems = await open(page, 'controlled-data');
  const target = cell(page, 'ORD-10001', 'customer');
  await expect(target).toBeVisible();
  await target.dblclick();
  const input = target.locator('input');
  await input.fill('Controlled Buyer');
  await input.press('Enter');
  await expect(log(page, 'Writes')).toContainText('onDataChange (cell): ORD-10001 customer');
  await expect(target).toHaveText('Controlled Buyer');
  expect(problems).toEqual([]);
});


test('loading-indicator: setLoading, skeleton, renderLoading phases and refresh', async ({ page }) => {
  const problems = await open(page, 'loading-indicator');
  const overlay = grid(page).locator('.salmon-data-grid-loading');
  const first = cell(page, 'ORD-10001', 'customer');
  await expect(first).toBeVisible();
  await expect(overlay).toHaveCount(0);
  await expect(grid(page)).not.toHaveAttribute('aria-busy', 'true');

  // The imperative loading indicator.
  await page.getByRole('button', { name: 'setLoading(true)' }).click();
  await expect(overlay).toHaveAttribute('data-indicator', 'spinner');
  await expect(overlay).toHaveAttribute('data-phase', 'refresh');
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  await expect(grid(page)).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('combobox', { name: 'loadingIndicator' }).click();
  await page.getByRole('option', { name: 'skeleton', exact: true }).click();
  await expect(overlay).toHaveAttribute('data-indicator', 'skeleton');
  await expect(overlay.locator('.salmon-data-grid-loading__bar').first()).toBeAttached();
  await page.getByRole('button', { name: 'setLoading(false)' }).click();
  await expect(overlay).toHaveCount(0);
  await expect(grid(page)).not.toHaveAttribute('aria-busy', 'true');

  // refresh() re-reads the current page; the slow read shows phase "refresh".
  await page.getByLabel('renderLoading').check();
  const before = (await first.textContent()) ?? '';
  await page.getByRole('button', { name: 'Change ORD-10001 on the server' }).click();
  await expect(first).toHaveText(before);
  await page.getByRole('button', { name: 'refresh()' }).click();
  await expect(overlay).toHaveText('Loading (refresh)…');
  await expect(first).toHaveText(`${before} (changed)`);
  await expect(overlay).toHaveCount(0);
  await expect(log(page)).toContainText('onViewChange: refresh, 10 of 300 rows');

  // A page change shows phase "page".
  await page.getByRole('button', { name: /page 2/i }).first().click();
  await expect(overlay).toHaveText('Loading (page)…');
  await expect(cell(page, 'ORD-10011', 'customer')).toBeVisible();
  await expect(overlay).toHaveCount(0);
  await expect(log(page)).toContainText('onViewChange: page, 10 of 300 rows');
  expect(problems).toEqual([]);
});
