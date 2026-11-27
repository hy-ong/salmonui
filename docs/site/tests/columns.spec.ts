import { expect, test, type Locator, type Page } from '@playwright/test';

// Behavior of the column demos: resize and drag events, keyboard resize and
// clamping, reactive widths and `moveColumn`, column reading
// methods, type inference and id resolution, escaped text and function templates, capability
// flags, locked and identity columns, the cancellable
// pointer reorder and its drag preview, the column
// menu auto-size-all item and the command column.

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

const header = (page: Page, columnId: string): Locator => page.locator(`.salmon-data-grid [role="columnheader"][data-column-id="${columnId}"]`);
const width = async (locator: Locator): Promise<number> => Math.round((await locator.boundingBox())?.width ?? 0);
const headerOrder = (page: Page): Promise<string[]> =>
  page.locator('.salmon-data-grid [role="columnheader"][data-column-id]').evaluateAll((cells) => cells.map((c) => c.getAttribute('data-column-id') ?? ''));
const log = (page: Page): Locator => page.getByRole('log');

/** Drags the resize handle of a header by `dx` px with the mouse. */
async function dragResize(page: Page, columnId: string, dx: number): Promise<void> {
  const handle = header(page, columnId).locator('.salmon-data-grid-resize-handle');
  const box = await handle.boundingBox();
  if (!box) throw new Error(`no resize handle on ${columnId}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x + (dx * i) / 5, y);
  await page.mouse.up();
}

test.describe('column layout demo', () => {
  test('pointer resize raises start, per-frame and end events and writes the reactive width back', async ({ page }) => {
    const problems = await open(page, '/demos/data-grid/column-layout');
    await dragResize(page, 'customer', 60);
    await expect(log(page)).toContainText('resize start: customer at 150');
    await expect(log(page)).toContainText(/resize \(pointer\): customer 150 → 210 after [1-9]\d* frames/);
    await expect(page.locator('[data-demo="customer-width"]')).toHaveValue('210');
    expect(await width(header(page, 'customer'))).toBe(210);
    expect(problems).toEqual([]);
  });

  test('onColumnResizeStart preventDefault cancels the resize', async ({ page }) => {
    const problems = await open(page, '/demos/data-grid/column-layout');
    const before = await width(header(page, 'country'));
    await dragResize(page, 'country', 80);
    await expect(log(page)).toContainText('resize start: country (prevented)');
    expect(await width(header(page, 'country'))).toBe(before);
    await expect(log(page)).not.toContainText('resize (pointer): country');
    expect(problems).toEqual([]);
  });

  test('keyboard resize steps 10 px and every width clamps to minWidth / maxWidth', async ({ page }) => {
    const problems = await open(page, '/demos/data-grid/column-layout');
    const customer = header(page, 'customer');
    await customer.click();
    await expect(customer).toBeFocused();
    await page.keyboard.press('Control+Alt+ArrowRight');
    await expect.poll(() => width(customer)).toBe(160);
    // keyboard resizes raise the resize events, so the reactive width follows.
    await expect(log(page)).toContainText('resize (keyboard): customer 150 → 160');
    await expect(page.locator('[data-demo="customer-width"]')).toHaveValue('160');
    await page.keyboard.press('Control+Alt+ArrowLeft');
    await page.keyboard.press('Control+Alt+ArrowLeft');
    await expect.poll(() => width(customer)).toBe(140);
    // Reactive `column.width` beyond the bounds is clamped (maxWidth 280, minWidth 100).
    await page.locator('[data-demo="customer-width"]').fill('400');
    await expect.poll(() => width(customer)).toBe(280);
    await page.locator('[data-demo="customer-width"]').fill('60');
    await expect.poll(() => width(customer)).toBe(100);
    expect(problems).toEqual([]);
  });

  test('header drag raises drag start and drop; moveColumn moves by visible index', async ({ page }) => {
    const problems = await open(page, '/demos/data-grid/column-layout');
    expect((await headerOrder(page)).slice(0, 4)).toEqual(['id', 'customer', 'city', 'country']);
    const source = await header(page, 'country').boundingBox();
    const target = await header(page, 'customer').boundingBox();
    if (!source || !target) throw new Error('headers not rendered');
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(source.x + source.width / 2 - ((source.x - target.x) * i) / 8, source.y + source.height / 2);
    await page.mouse.up();
    await expect(log(page)).toContainText('drag start: country from 3');
    await expect(log(page)).toContainText(/drop: country 3 → 1 after [1-9]\d* frames/);
    expect((await headerOrder(page)).slice(0, 4)).toEqual(['id', 'country', 'customer', 'city']);

    await page.getByRole('button', { name: 'Move Amount to position 1' }).click();
    await expect(log(page)).toContainText('moveColumn amount → 1: applied');
    expect((await headerOrder(page)).slice(0, 3)).toEqual(['id', 'amount', 'country']);
    expect(problems).toEqual([]);
  });

  test('onBeforeColumnReorder preventDefault cancels a pointer move; the drag preview follows the pointer', async ({ page }) => {
    const problems = await open(page, '/demos/data-grid/column-layout');
    const order = (await headerOrder(page)).slice(0, 6);
    expect(order).toEqual(['id', 'customer', 'city', 'country', 'product', 'amount']);
    const preview = page.locator('.salmon-data-grid-drag-preview');
    const indicator = page.locator('.salmon-data-grid-drop-indicator');
    await expect(preview).toBeHidden();
    const source = await header(page, 'product').boundingBox();
    const target = await header(page, 'customer').boundingBox();
    if (!source || !target) throw new Error('headers not rendered');
    const y = source.y + source.height / 2;
    const startX = source.x + source.width / 2;
    const endX = target.x + 10;
    const drag = async (): Promise<void> => {
      await page.mouse.move(startX, y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(startX - ((startX - endX) * i) / 8, y);
      // Mid-drag: the preview shows the header text next to the pointer and moves with it.
      await expect(preview).toBeVisible();
      await expect(preview).toHaveText('Product');
      await expect(indicator).toBeVisible();
      const x1 = startX - ((startX - endX) * 6) / 8;
      const box1 = await preview.boundingBox();
      expect(Math.abs((box1?.x ?? 0) - (x1 + 12))).toBeLessThanOrEqual(3);
      expect(Math.abs((box1?.y ?? 0) - (y + 8))).toBeLessThanOrEqual(3);
      for (let i = 7; i <= 8; i++) await page.mouse.move(startX - ((startX - endX) * i) / 8, y + 6);
      const box2 = await preview.boundingBox();
      expect(Math.abs((box2?.x ?? 0) - (endX + 12))).toBeLessThanOrEqual(3);
      expect(Math.abs((box2?.y ?? 0) - (y + 6 + 8))).toBeLessThanOrEqual(3);
      await page.mouse.up();
      await expect(preview).toBeHidden();
      await expect(indicator).toBeHidden();
    };

    // Cancelled in onBeforeColumnReorder: the drop is reported, the order stays and onColumnReorder does not fire.
    await drag();
    await expect(log(page)).toContainText(/drop: product 4 → 1 after [1-9]\d* frames/);
    await expect(log(page)).toContainText('reorder (pointer): product 4 → 1 (prevented)');
    await expect(log(page).locator('li', { hasText: /^reorder \(pointer\): product 4 → 1$/ })).toHaveCount(0);
    expect((await headerOrder(page)).slice(0, 6)).toEqual(order);

    // A cancelled pointer drops nothing and removes the preview.
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(startX - ((startX - endX) * i) / 8, y);
    await expect(preview).toBeVisible();
    await page.locator('.salmon-data-grid').first().dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
    await expect(preview).toBeHidden();
    await page.mouse.up();
    await expect(log(page)).toContainText(/drop: product 4 → -1 after/);
    expect((await headerOrder(page)).slice(0, 6)).toEqual(order);

    // Allowed again: the same drag moves the column and raises onColumnReorder.
    await page.getByLabel('Cancel moving Product in onBeforeColumnReorder').uncheck();
    await drag();
    await expect(log(page).locator('li', { hasText: /^reorder \(pointer\): product 4 → 1$/ })).toHaveCount(1);
    expect((await headerOrder(page)).slice(0, 6)).toEqual(['id', 'product', 'customer', 'city', 'country', 'amount']);
    expect(problems).toEqual([]);
  });
});

const cell = (page: Page, rowId: string, columnId: string): Locator => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const firstRowId = async (page: Page): Promise<string> => (await page.locator('.salmon-data-grid .salmon-data-grid-rows [data-row-id]').first().getAttribute('data-row-id')) ?? '';

test.describe('column types, ids and reading methods', () => {
  test('inferred types, generated id, escaped text and the function template, in both column forms', async ({ page }) => {
    const problems = await open(page, '/demos/data-grid/column-api');
    const table = page.locator('[data-demo="columns"]');
    const expectColumns = async () => {
      await page.getByRole('button', { name: 'Read columns' }).click();
      const types = await table.locator('tbody tr').evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent).join(' ')));
      expect(types).toEqual([
        'id id string inferred 0',
        'customer customer string inferred 1',
        'quantity quantity number inferred 2',
        'placed placed date inferred 3',
        'shipped shipped boolean inferred 4',
        expect.stringMatching(/^markup - string \w+ 5$/),
        expect.stringMatching(/^__col_\S+ - string \w+ 6$/),
      ]);
      await expect(page.locator('[data-demo="summary"]')).toContainText("getColumn('customer'): Customer; getColumnAt(2): Qty; visible 7 of 7");
    };
    await expectColumns();
    // Development builds (not production or export) report the generated id through onWarning.
    if (process.env.SITE_MODE !== 'production' && process.env.SITE_MODE !== 'export') await expect(page.locator('[data-demo="summary"]')).toContainText('column-id-generated');

    const rowId = await firstRowId(page);
    // markup-like text is escaped, not parsed.
    await expect(cell(page, rowId, 'markup')).toHaveText(/^<b>.+<\/b>$/);
    await expect(cell(page, rowId, 'markup').locator('b')).toHaveCount(0);
    // the function template renders elements.
    await expect(page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .demo-badge strong`)).toHaveText(/^(Shipped|Open)$/);

    // children compile to the same columns.
    await page.getByRole('combobox', { name: 'Columns as' }).click();
    await page.getByRole('option', { name: 'DataGridColumn children' }).click();
    await expectColumns();

    // hidden columns leave the visible index.
    await page.getByRole('button', { name: 'Hide Qty' }).click();
    await page.getByRole('button', { name: 'Read columns' }).click();
    await expect(table.locator('tr[data-column="quantity"] td').last()).toHaveText('-1');
    await expect(table.locator('tr[data-column="placed"] td').last()).toHaveText('2');
    await expect(page.locator('[data-demo="summary"]')).toContainText('getColumnAt(2): Placed; visible 6 of 7');
    expect(problems).toEqual([]);
  });
});

test('column menu Auto-size all fits every column', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/column-menu');
  const ids = ['customer', 'country', 'category', 'priority', 'amount', 'placed'];
  const before = await Promise.all(ids.map((id) => width(header(page, id))));
  await header(page, 'customer').hover();
  await header(page, 'customer').locator('.salmon-data-grid-column-menu-button').click();
  await page.locator('.salmon-data-grid-menu [data-item-id="autoSizeAll"]').click();
  await expect(page.locator('.salmon-data-grid-menu')).toHaveCount(0);
  await expect.poll(async () => (await Promise.all(ids.map((id) => width(header(page, id))))).filter((w, i) => w !== before[i]).length).toBeGreaterThan(2);
  expect(problems).toEqual([]);
});

test('lookup column shows the display value of its key', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/lookup-columns');
  const rowId = await firstRowId(page);
  await expect(cell(page, rowId, 'customerId')).toHaveText(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  await expect(cell(page, rowId, 'department')).toHaveText(/^(Operations|Finance|Marketing|Engineering|Human resources)$/);
  expect(problems).toEqual([]);
});

test('command column: built-in Edit / Cancel and a custom command through onCommandClick', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/editing');
  const rowId = await firstRowId(page);
  const commands = cell(page, rowId, 'commands');
  await expect(commands.locator('[data-command]')).toHaveText(['Edit', 'Delete']);
  await commands.locator('[data-command="edit"]').click();
  await expect(log(page)).toContainText(`command edit ${rowId}`);
  await expect(commands.locator('[data-command]')).toHaveText(['Save', 'Cancel']);
  await commands.locator('[data-command="cancel"]').click();
  await expect(commands.locator('[data-command]')).toHaveText(['Edit', 'Delete']);
  // The custom command sits in the last column: scroll it into the rendered window.
  await page.locator('.salmon-data-grid-viewport').evaluate((vp) => {
    vp.scrollLeft = vp.scrollWidth;
  });
  const custom = cell(page, rowId, 'more').locator('[data-command="custom"]');
  await expect(custom).toHaveText('Details');
  await custom.click();
  await expect(log(page)).toContainText(new RegExp(`details ${rowId}: .+, \\d+ items`));
  expect(problems).toEqual([]);
});

test.describe('column capabilities', () => {
  test('per-column flags turn off sorting, filtering, search, grouping, editing, resizing and reordering', async ({ page }) => {
    const problems = await open(page, '/demos/data-grid/column-capabilities');
    await expect(header(page, 'customer')).not.toHaveAttribute('data-sortable', '');
    await expect(header(page, 'country')).toHaveAttribute('data-sortable', '');
    await header(page, 'customer').click();
    await expect(header(page, 'customer')).not.toHaveAttribute('data-sorted');
    // Filter bar: no input under the non-filterable column.
    await expect(page.locator('.salmon-data-grid-filter-bar__cell[data-column-id="country"] input')).toHaveCount(0);
    await expect(page.locator('.salmon-data-grid-filter-bar__cell[data-column-id="city"] input')).toHaveCount(1);
    // Resize and reorder affordances.
    await expect(header(page, 'amount').locator('.salmon-data-grid-resize-handle')).toHaveCount(0);
    await expect(header(page, 'city').locator('.salmon-data-grid-resize-handle')).toHaveCount(1);
    await expect(header(page, 'amount')).not.toHaveAttribute('data-reorderable', '');
    await expect(header(page, 'id')).not.toHaveAttribute('data-reorderable', '');
    // Grouping: the column menu of a non-groupable column has no Group item.
    await header(page, 'category').hover();
    await header(page, 'category').locator('.salmon-data-grid-column-menu-button').click();
    await expect(page.locator('.salmon-data-grid-menu [data-item-id="autoSizeAll"]')).toBeVisible();
    await expect(page.locator('.salmon-data-grid-menu [data-item-id="group"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await header(page, 'city').hover();
    await header(page, 'city').locator('.salmon-data-grid-column-menu-button').click();
    await expect(page.locator('.salmon-data-grid-menu [data-item-id="group"]')).toBeVisible();
    await page.keyboard.press('Escape');

    // nothing moves before the locked Order column.
    await header(page, 'country').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect.poll(async () => (await headerOrder(page)).slice(0, 3)).toEqual(['id', 'country', 'customer']);

    // editable: identity and read-only columns get no editor.
    const rowId = await firstRowId(page);
    await cell(page, rowId, 'city').dblclick();
    await expect(cell(page, rowId, 'city').locator('input')).toBeVisible();
    await expect(cell(page, rowId, 'id').locator('input')).toHaveCount(0);
    await expect(cell(page, rowId, 'product').locator('input')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Search skips the non-searchable Customer column.
    const customer = (await cell(page, rowId, 'customer').textContent()) ?? '';
    await page.locator('.salmon-data-grid-search__input').fill(customer);
    await expect(page.locator('.salmon-data-grid-empty')).toBeVisible();
    expect(problems).toEqual([]);
  });
});
