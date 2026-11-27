import { expect, test, type Page } from '@playwright/test';

// Behavior of the state, RTL, globalization, template, fill and pinned demos:
// custom format patterns and formatValue, accent and case
// matching, controlled state and restore without recompiling,
// filter, pager and empty templates, range fill over virtualized rows, editing pinned
// columns, and mirrored pins, resize handles and keyboard resize in
// RTL, and the date picker editor.

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

const header = (page: Page, columnId: string) => page.locator(`.salmon-data-grid [role="columnheader"][data-column-id="${columnId}"]`);

const cell = (page: Page, rowId: string | number, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);

test('custom number and date patterns, a skeleton object and formatValue follow the locale', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/format-patterns');
  await expect(cell(page, 1, 'grouped')).toHaveText('1,234,567.89');
  await expect(cell(page, 1, 'optional')).toHaveText('1234567.891');
  await expect(cell(page, 1, 'literal')).toHaveText('USD 1,234,568');
  await expect(cell(page, 1, 'share')).toHaveText('12.3%');
  await expect(cell(page, 1, 'units')).toHaveText('007');
  await expect(cell(page, 1, 'iso')).toHaveText('2026-03-05 14:30');
  await expect(cell(page, 1, 'long')).toHaveText('Thu 5 Mar 2026 at 2:30 PM');
  await expect(cell(page, 1, 'skeleton')).toHaveText('Thu, Mar 5, 2026');
  await expect(cell(page, 1, 'template')).toHaveText('€1,234,568 / ¥1,234,568');
  await page.getByRole('combobox', { name: 'Locale' }).click();
  await page.getByRole('option', { name: 'de-DE', exact: true }).click();
  await expect(cell(page, 1, 'grouped')).toHaveText('1.234.567,89');
  await expect(cell(page, 1, 'literal')).toHaveText('USD 1.234.568');
  await expect(cell(page, 1, 'iso')).toHaveText('2026-03-05 14:30');
  await expect(cell(page, 1, 'skeleton')).toHaveText('Do., 5. März 2026');
  await expect(cell(page, 1, 'template')).toContainText('1.234.568');
  expect(problems).toEqual([]);
});

test('search and filter row fold accents and case per matchCase and ignoreAccents', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/text-matching');
  const names = page.locator('.salmon-data-grid .salmon-data-grid-rows [data-row-id] .salmon-data-grid-cell[data-column-id="name"]');
  await expect(names).toHaveText(['Renée Dubois', 'Rene Martin']);
  await page.getByLabel('ignoreAccents').uncheck();
  await expect(names).toHaveText(['Rene Martin']);
  await page.getByLabel('Search text').fill('zoe');
  await expect(names).toHaveText(['ZOE Novak']);
  await page.getByLabel('ignoreAccents').check();
  await expect(names).toHaveText(['Zoë Müller', 'ZOE Novak']);
  await page.getByLabel('matchCase').check();
  await expect(names).toHaveText([]);
  await page.getByLabel('Search text').fill('Zoe');
  await expect(names).toHaveText(['Zoë Müller']);
  // Filter row: accent folding applies to filter conditions too.
  await page.getByLabel('matchCase').uncheck();
  await page.getByLabel('Search text').fill('');
  const city = page.locator('.salmon-data-grid-filter-bar__cell[data-column-id="city"] input.salmon-data-grid-filter-bar__input');
  await city.fill('malaga');
  await city.press('Enter');
  await expect(names).toHaveText(['José Álvarez']);
  await page.getByLabel('ignoreAccents').uncheck();
  await expect(names).toHaveText([]);
  expect(problems).toEqual([]);
});

test('controlled state: props drive the grid, events write back, restoreState keeps compiled columns', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/controlled-state');
  const state = page.getByLabel('Application view state');
  const readState = async () => JSON.parse((await state.textContent()) ?? '{}');
  const countries = page.locator('.salmon-data-grid .salmon-data-grid-rows [data-row-id] .salmon-data-grid-cell[data-column-id="country"]');

  // Application -> grid.
  await page.getByRole('button', { name: 'Only Japan' }).click();
  await expect(countries.first()).toHaveText('Japan');
  expect(new Set(await countries.allTextContents())).toEqual(new Set(['Japan']));
  await page.getByRole('button', { name: 'Toggle Product' }).click();
  await expect(page.locator('.salmon-data-grid [role="columnheader"][data-column-id="product"]')).toHaveCount(0);

  // DataGrid -> application.
  await page.locator('.salmon-data-grid [role="columnheader"][data-column-id="customer"]').click();
  await expect.poll(async () => (await readState()).sortBy).toEqual([{ field: 'customer', direction: 'asc' }]);
  const firstRow = page.locator('.salmon-data-grid .salmon-data-grid-rows [data-row-id]').first();
  const firstId = await firstRow.getAttribute('data-row-id');
  await firstRow.locator('.salmon-data-grid-cell[data-column-id="customer"]').click();
  await expect.poll(async () => (await readState()).selected).toEqual([firstId]);

  // Snapshot, change, restore: one batch, same compiled columns.
  await page.getByRole('button', { name: 'Take snapshot' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.locator('.salmon-data-grid [role="columnheader"][data-column-id="product"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restore snapshot' }).click();
  await expect(page.locator('.demo-status')).toHaveText('restoreState: applied; columns recompiled: no.');
  await expect(page.locator('.salmon-data-grid [role="columnheader"][data-column-id="product"]')).toHaveCount(0);
  await expect(countries.first()).toHaveText('Japan');
  // The restore raises the change events, so the application state follows.
  await expect.poll(async () => (await readState()).filters.length).toBe(1);
  await expect.poll(async () => (await readState()).hidden).toEqual(['product']);
  await expect.poll(async () => (await readState()).sortBy).toEqual([{ field: 'customer', direction: 'asc' }]);
  expect(problems).toEqual([]);
});

test('filter menu, pager and empty templates', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/slot-templates');
  const status = page.locator('.demo-pager__status');
  await expect(status).toHaveText('Page 1 of 20 (200 orders)');
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next' }).click();
  await expect(status).toHaveText('Page 2 of 20 (200 orders)');

  // renderEmpty without rows and without a query: `noData`.
  await page.getByLabel('No data').check();
  await expect(page.locator('.demo-empty')).toHaveText('There are no orders yet.');
  await page.getByLabel('No data').uncheck();
  await expect(page.locator('.demo-empty')).toHaveCount(0);

  // renderFilter replaces the value editor of the filter menu.
  await page.locator('.salmon-data-grid [role="columnheader"][data-column-id="category"] .salmon-data-grid-filter-button').click();
  const group = page.getByRole('group', { name: 'Category' });
  await expect(group).toBeVisible();
  await group.getByRole('button', { name: 'Tea' }).click();
  const categories = page.locator('.salmon-data-grid .salmon-data-grid-rows [data-row-id] .salmon-data-grid-cell[data-column-id="category"]');
  await expect(categories.first()).toHaveText('Tea');
  expect(new Set(await categories.allTextContents())).toEqual(new Set(['Tea']));
  await expect(status).toContainText('Page 1 of ');

  // A search or filter that matches nothing: `noMatch`.
  await page.getByLabel('Search orders').fill('no such order');
  await expect(page.locator('.demo-empty')).toHaveText('No order matches the search or filters.');
  expect(problems).toEqual([]);
});

test('fillSelection tiles the range, also over virtualized rows that are not rendered', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/fill-range');
  const first = [await cell(page, 'ORD-10000', 'customer').textContent(), await cell(page, 'ORD-10000', 'product').textContent()];
  const second = [await cell(page, 'ORD-10001', 'customer').textContent(), await cell(page, 'ORD-10001', 'product').textContent()];
  await page.getByRole('button', { name: 'Select the first two rows' }).click();
  await page.getByRole('button', { name: 'Fill down to row 6' }).click();
  await expect(page.locator('.demo-status')).toHaveText('fillSelection(ORD-10005, product): applied');
  for (const [rowId, expected] of [['ORD-10002', first], ['ORD-10003', second], ['ORD-10004', first], ['ORD-10005', second]] as const) {
    await expect(cell(page, rowId, 'customer')).toHaveText(expected[0] ?? '');
    await expect(cell(page, rowId, 'product')).toHaveText(expected[1] ?? '');
  }
  await expect(cell(page, 'ORD-10006', 'customer')).not.toHaveText('');

  await page.getByRole('button', { name: 'Fill down to row 4,000' }).click();
  await expect(page.locator('.demo-status')).toHaveText('fillSelection(ORD-13999, product): applied');
  await page.getByRole('button', { name: 'Scroll to row 4,000' }).click();
  // Row index 3999 is the second row of the two-row pattern.
  await expect(cell(page, 'ORD-13999', 'customer')).toHaveText(second[0] ?? '');
  await expect(cell(page, 'ORD-13998', 'product')).toHaveText(first[1] ?? '');
  expect(problems).toEqual([]);
});

test('fill-range: the fill handle drags from a start-pinned column into the center and from the center into an end-pinned column', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/fill-range');
  const pinZone = (rowId: string, columnId: string) =>
    cell(page, rowId, columnId).evaluate((el) => (el.closest('.salmon-data-grid-pin--left') ? 'start' : el.closest('.salmon-data-grid-pin--right') ? 'end' : 'center'));
  expect([await pinZone('ORD-10000', 'customer'), await pinZone('ORD-10000', 'product'), await pinZone('ORD-10000', 'note')]).toEqual(['start', 'center', 'end']);
  const drag = async (from: [string, string], to: [string, string]) => {
    await cell(page, from[0], from[1]).click();
    const handle = page.locator('.salmon-data-grid .salmon-data-grid-fill-handle');
    await expect(handle).toHaveCount(1);
    const h = (await handle.boundingBox())!;
    const target = (await cell(page, to[0], to[1]).boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
    await page.mouse.up();
  };
  // Customer (pinned start) of ORD-10002 into Product (center).
  const customer = await cell(page, 'ORD-10002', 'customer').textContent();
  await drag(['ORD-10002', 'customer'], ['ORD-10002', 'product']);
  await expect(cell(page, 'ORD-10002', 'product')).toHaveText(customer ?? '');
  await expect(page.locator('.demo-status')).toContainText('onBeforeFill: ORD-10002..ORD-10002 extended to ORD-10002 / product (pointer)');
  // Product (center) of ORD-10003 into Note (pinned end).
  const product = await cell(page, 'ORD-10003', 'product').textContent();
  await drag(['ORD-10003', 'product'], ['ORD-10003', 'note']);
  await expect(cell(page, 'ORD-10003', 'note')).toHaveText(product ?? '');
  expect(problems).toEqual([]);
});

test('cells of pinned columns edit in place, also after pinning at runtime', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/pinned-columns');
  const rows = page.locator('.salmon-data-grid .salmon-data-grid-rows [data-row-id]');
  const rowId = (await rows.first().getAttribute('data-row-id'))!;
  const amount = cell(page, rowId, 'amount');
  await expect(amount.locator('xpath=ancestor::*[contains(@class,"salmon-data-grid-pin--right")]')).toHaveCount(1);
  await amount.dblclick();
  const input = amount.locator('input');
  await expect(input).toBeFocused();
  await input.fill('1234.5');
  await input.press('Enter');
  await expect(page.locator('.salmon-data-grid-editor')).toHaveCount(0);
  await expect(amount).toHaveText('$1,234.50');
  // Pin Customer at runtime, then edit it in the pinned zone.
  await page.getByRole('button', { name: 'Pin Customer to the start' }).click();
  const customer = cell(page, rowId, 'customer');
  await expect(customer.locator('xpath=ancestor::*[contains(@class,"salmon-data-grid-pin--left")]')).toHaveCount(1);
  await customer.click();
  await page.keyboard.press('F2');
  await expect(customer.locator('input')).toBeFocused();
  await customer.locator('input').fill('Pinned edit');
  await customer.locator('input').press('Enter');
  await expect(customer).toHaveText('Pinned edit');
  expect(problems).toEqual([]);
});

test('RTL: pinned zones mirror, the resize handle and keyboard resize follow the visual direction', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/rtl');
  const grid = page.locator('[role="grid"]').first();
  const gridBox = (await grid.boundingBox())!;
  const start = (await header(page, 'row').boundingBox())!;
  const end = (await header(page, 'n29').boundingBox())!;
  // Start pin on the right edge, end pin on the left edge.
  expect(start.x + start.width).toBeGreaterThan(gridBox.x + gridBox.width - 40);
  expect(end.x).toBeLessThan(gridBox.x + 40);

  // The resize handle sits on the left (end) edge; dragging it left widens the column.
  const target = header(page, 'n2');
  const before = (await target.boundingBox())!;
  const handle = target.locator('.salmon-data-grid-resize-handle');
  const handleBox = (await handle.boundingBox())!;
  expect(handleBox.x).toBeLessThan(before.x + before.width / 2);
  const x = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 40, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await target.boundingBox())!.width)).toBe(Math.round(before.width) + 40);
  await expect(page.getByRole('log')).toContainText('resize (pointer): n2 110 → 150');

  // Keyboard: Ctrl+Alt+ArrowLeft widens in RTL.
  await target.focus();
  const widthBefore = (await target.boundingBox())!.width;
  await page.keyboard.press('Control+Alt+ArrowLeft');
  await expect.poll(async () => (await target.boundingBox())!.width).toBeGreaterThan(widthBefore);
  expect(problems).toEqual([]);
});

test('date picker: locale week start, firstDayOfWeek override, keyboard choose', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/date-picker');
  const arrival = page.locator('.salmon-data-grid [data-row-id="1"] .salmon-data-grid-cell[data-column-id="arrival"]');
  await arrival.dblclick();
  await expect(arrival.locator('input')).toHaveValue('11/02/2026');
  await page.keyboard.press('Alt+ArrowDown');
  const dialog = page.getByRole('dialog', { name: 'Choose a date' });
  await expect(dialog.getByRole('columnheader').first()).toHaveAttribute('abbr', 'Sunday');
  await expect(dialog.getByRole('heading')).toHaveText('November 2026');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(arrival.locator('input')).toHaveValue('11/09/2026');
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Locale' }).click();
  await page.getByRole('option', { name: 'de-DE', exact: true }).click();
  await arrival.dblclick();
  await page.keyboard.press('Alt+ArrowDown');
  const german = page.getByRole('dialog', { name: 'Datum auswählen' });
  await expect(german.getByRole('columnheader').first()).toHaveAttribute('abbr', 'Montag');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'First day of week', exact: true }).click();
  await page.getByRole('option', { name: 'Saturday', exact: true }).click();
  await arrival.dblclick();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(german.getByRole('columnheader').first()).toHaveAttribute('abbr', 'Samstag');
  expect(problems).toEqual([]);
});
