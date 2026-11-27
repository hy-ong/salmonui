import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Pivot Table behaviour on examples/vite-spa/pivot.html: the deterministic sales
// fixture (2,000 rows, pivot-fixture.ts) shared through `usePivot()` by
// PivotToolbar, PivotAxisBar, PivotTable and PivotFieldList. Every pivot event
// lands in `window.__pivotLog`; `window.__pivotCancel[type]` cancels matching
// before-events.

declare global {
  interface Window {
    __pivot: any;
    __pivotApi: any;
    __pivotLog: { type: string; [k: string]: any }[];
    __pivotCancel: Record<string, true | string>;
    __pivotBusy: { busy: boolean; loading: boolean; custom: boolean }[];
    __pivotCellClicks: { rowKey: string; columnKey: string | null; value: number | null }[];
    __pivotData: Record<string, unknown>[];
    __pivotChart: { export(o: object): Promise<void>; print(): Promise<void> } | null;
    __pivotChartClicks: { seriesId: string; index: number; rowKey: string | null; columnKey: string | null }[];
    __pivotChartImage: () => Promise<{ data: Uint8Array; type: string; width: number; height: number }>;
  }
}

test.use({ locale: 'en-US', timezoneId: 'UTC' });

const URL = `${DEV_URL}pivot.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => window.__pivot?.status === 'ready' && document.querySelector('.salmon-data-grid-rows [role="row"]') !== null && document.querySelector('[role="treegrid"], .salmon-pivot-table [role="grid"]') !== null);
}

/** Data Grid column id of a pivot header key (grid-model.ts `safeId`). */
function colId(key: string): string {
  let out = 'c';
  for (const ch of key) out += /[A-Za-z0-9-]/.test(ch) ? ch : `_${ch.charCodeAt(0).toString(16)}_`;
  return out;
}
const rowSel = (key: readonly unknown[] | '') => (key === '' ? '[data-row-id="pivot-grand-total"]' : `[data-row-id='r${JSON.stringify(key)}']`);
const row = (page: Page, key: readonly unknown[] | '') => page.locator(`.salmon-pivot-table .salmon-data-grid-rows [role="row"]${rowSel(key)}`);
const rowHeader = (page: Page, key: readonly unknown[] | '') => row(page, key).locator('.salmon-data-grid-cell[data-column-id="pivot-row-header"]');
const cell = (page: Page, key: readonly unknown[] | '', columnKey: string) => row(page, key).locator(`.salmon-data-grid-cell[data-column-id="${colId(columnKey)}"]`);
const events = (page: Page, type: string) => page.evaluate((t) => window.__pivotLog.filter((e) => e.type === t), type);
const clearLog = (page: Page) => page.evaluate(() => (window.__pivotLog.length = 0));
const cancel = (page: Page, type: string, value: true | string | null) =>
  page.evaluate(([t, v]) => {
    if (v === null) delete window.__pivotCancel[t as string];
    else window.__pivotCancel[t as string] = v as true | string;
  }, [type, value] as const);
const model = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__pivot.model)));
const axisFields = async (page: Page, axis: 'rows' | 'columns' | 'filters' | 'values') => ((await model(page))[axis] as { field: string }[]).map((f) => f.field);
/** Sum of `amount` over the fixture rows matching `where` (the source of truth for cell values). */
const sumWhere = (page: Page, where: Record<string, unknown>, field = 'amount') =>
  page.evaluate(([w, f]) => window.__pivotData.filter((r) => Object.entries(w).every(([k, v]) => r[k] === v)).reduce((s, r) => s + (r[f] as number), 0), [where, field] as const);
const fmt = (n: number) => n.toLocaleString('en-US');
const dialog = (page: Page) => page.locator('.salmon-pivot-table-dialog[role="dialog"]');
const menu = (page: Page) => page.locator('[role="menu"]').last();

// ---------------------------------------------------------------------------
// Table (PWP2)
// ---------------------------------------------------------------------------

test.describe('PivotTable', () => {
  test('the header sort button and keyboard reorder rows by value, with cancellable sort events', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'case=drill&valueSorting');
    const key = await page.evaluate(() => {
      const r = window.__pivot.result;
      for (let c = 0; c < r.columnCount; c++) {
        const node = r.memberAt('columns', c);
        if (node.kind !== 'grandTotal') return node.key as string;
      }
      throw new Error('no column');
    });
    const header = page.locator(`[role="columnheader"][data-column-id="${colId(key)}"]`);
    const button = header.locator('.salmon-pivot-table-value-sort');
    const values = () =>
      page.evaluate((k) => {
        const r = window.__pivot.result;
        let c = 0;
        while (r.memberAt('columns', c).key !== k) c++;
        const out: number[] = [];
        for (let i = 0; i < r.rowCount; i++) if (r.memberAt('rows', i).kind !== 'grandTotal') out.push(r.valueAt(i, c) as number);
        return out;
      }, key);
    await expect(header).toHaveAttribute('aria-sort', 'none');
    // A cancelled before-event leaves the model alone and fires no change event.
    await cancel(page, 'beforeSortChange', true);
    await button.click();
    expect((await model(page)).valueSort).toBeNull();
    expect((await events(page, 'beforeSortChange')).at(-1)).toMatchObject({ field: null, source: 'pointer', valueSort: { columnKey: key, direction: 'asc' } });
    expect(await events(page, 'sortChange')).toHaveLength(0);
    await cancel(page, 'beforeSortChange', null);
    // Ascending, then descending, then cleared.
    await button.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect((await events(page, 'sortChange')).at(-1)).toMatchObject({ field: null, sort: null, source: 'pointer', valueSort: { columnKey: key, measure: 'amount', direction: 'asc', multipleAxis: true } });
    await expect.poll(async () => { const v = await values(); return v.every((x, i) => i === 0 || (v[i - 1] as number) <= x); }).toBe(true);
    await button.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(async () => { const v = await values(); return v.every((x, i) => i === 0 || (v[i - 1] as number) >= x); }).toBe(true);
    await button.click();
    await expect(header).toHaveAttribute('aria-sort', 'none');
    expect((await model(page)).valueSort).toBeNull();
    expect((await events(page, 'sortChange')).at(-1)).toMatchObject({ valueSort: null });
    // Keyboard: Enter on the focused header cell.
    await header.focus();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect((await events(page, 'sortChange')).at(-1)).toMatchObject({ source: 'keyboard', valueSort: { direction: 'asc' } });
    expect(problems).toEqual([]);
  });

  test('compact drill down and up by click, Enter and Space on the row header, Ctrl+ArrowDown expand all, onBeforeExpandedChange cancel', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await expect(page.locator('.salmon-pivot-table [role="treegrid"]')).toHaveCount(1);
    await expect(row(page, ['Asia'])).toHaveAttribute('aria-level', '1');
    await expect(row(page, ['Asia'])).toHaveAttribute('aria-expanded', 'false');
    await expect(rowHeader(page, ['Asia'])).toHaveAttribute('role', 'rowheader');
    // Values match the fixture.
    await expect(cell(page, ['Asia'], '[2024]|amount')).toHaveText(fmt(await sumWhere(page, { region: 'Asia', year: 2024 })));

    // Click the toggle: drill down, then up.
    await page.getByRole('button', { name: 'Expand Asia' }).click();
    await expect(row(page, ['Asia', 'Japan'])).toHaveCount(1);
    await expect(row(page, ['Asia', 'Japan'])).toHaveAttribute('aria-level', '2');
    await expect(row(page, ['Asia'])).toHaveAttribute('aria-expanded', 'true');
    await expect(cell(page, ['Asia', 'Japan'], '[2024]|amount')).toHaveText(fmt(await sumWhere(page, { country: 'Japan', year: 2024 })));
    const expanded = await events(page, 'expandedChange');
    expect(expanded.at(-1)).toMatchObject({ action: 'expand', path: ['rows', 'Asia'], axis: 'rows', expanded: true, source: 'pointer' });
    await page.getByRole('button', { name: 'Collapse Asia' }).click();
    await expect(row(page, ['Asia', 'Japan'])).toHaveCount(0);
    await expect(row(page, ['Asia'])).toHaveAttribute('aria-expanded', 'false');

    // Keyboard: Enter and Space on the focused row header cell.
    await rowHeader(page, ['Europe']).click();
    await expect(rowHeader(page, ['Europe'])).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(row(page, ['Europe', 'France'])).toHaveCount(1);
    expect((await events(page, 'expandedChange')).at(-1)).toMatchObject({ action: 'expand', source: 'keyboard' });
    await page.keyboard.press(' ');
    await expect(row(page, ['Europe', 'France'])).toHaveCount(0);

    // Ctrl+ArrowDown expands every row level; Ctrl+ArrowUp collapses them.
    await page.keyboard.press('Control+ArrowDown');
    await expect(row(page, ['Asia', 'Japan', 'Tokyo'])).toHaveCount(1);
    await expect(row(page, ['Asia', 'Japan', 'Tokyo'])).toHaveAttribute('aria-level', '3');
    expect((await events(page, 'expandedChange')).at(-1)).toMatchObject({ action: 'expandAll', axis: 'rows' });
    await page.keyboard.press('Control+ArrowUp');
    await expect(row(page, ['Asia', 'Japan'])).toHaveCount(0);

    // onBeforeExpandedChange cancels the drill.
    await clearLog(page);
    await cancel(page, 'beforeExpandedChange', 'expand');
    await page.getByRole('button', { name: 'Expand Americas' }).click();
    await page.waitForTimeout(100);
    await expect(row(page, ['Americas', 'Canada'])).toHaveCount(0);
    expect(await events(page, 'beforeExpandedChange')).toHaveLength(1);
    expect(await events(page, 'expandedChange')).toHaveLength(0);
    await cancel(page, 'beforeExpandedChange', null);

    // Column drill through the column header toggle.
    await page.evaluate(() => window.__pivot.setModel((m: any) => ({ ...m, columns: [{ field: 'year' }, { field: 'quarter' }] })));
    await page.getByRole('button', { name: 'Expand 2024' }).click();
    await expect(page.locator(`.salmon-data-grid-header-cell[data-column-id="${colId('[2024,"Q1"]|amount')}"]`)).toHaveCount(1);
    await page.getByRole('button', { name: 'Collapse 2024' }).click();
    await expect(page.locator(`.salmon-data-grid-header-cell[data-column-id="${colId('[2024,"Q1"]|amount')}"]`)).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('tabular layout puts one pinned row header column per row field, labelled by the field captions', async ({ page }) => {
    await open(page, 'case=tabular');
    await expect(page.locator('.salmon-pivot-table')).toHaveAttribute('data-layout', 'tabular');
    await expect(page.locator('.salmon-pivot-table [role="grid"]')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="pivot-row-0"]')).toHaveText('Region');
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="pivot-row-1"]')).toHaveText('Country');
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="pivot-row-header"]')).toHaveCount(0);
    const india = row(page, ['Asia', 'India']);
    await expect(india.locator('[data-column-id="pivot-row-1"]')).toHaveText('India');
    await expect(india.locator('[data-column-id="pivot-row-1"]')).toHaveAttribute('role', 'rowheader');
    // The ancestor label stays in the row for assistive tech (marked as a repeat after the block's first row).
    await expect(india.locator('[data-column-id="pivot-row-0"]')).toHaveText('Asia');
    await expect(row(page, ['Asia']).locator('[data-column-id="pivot-row-0"]')).toContainText('Asia');
    // Both row field columns are pinned at the start.
    expect(await india.locator('[data-column-id="pivot-row-0"]').evaluate((el) => el.closest('.salmon-data-grid-pin--left') !== null)).toBe(true);
    expect(await india.locator('[data-column-id="pivot-row-1"]').evaluate((el) => el.closest('.salmon-data-grid-pin--left') !== null)).toBe(true);
    // Values and the grand total row.
    await expect(india.locator(`[data-column-id="${colId('[2025]|amount')}"]`)).toHaveText(fmt(await sumWhere(page, { country: 'India', year: 2025 })));
    await expect(row(page, '').locator('[data-column-id="pivot-row-0"]')).toHaveText('Grand total');
  });

  test('rows and columns are virtualized (only a window of a 2,000 x 366 result is in the DOM)', async ({ page }) => {
    await open(page, 'case=virtual');
    const size = await page.evaluate(() => ({ rows: window.__pivot.result.rowCount, columns: window.__pivot.result.columnCount }));
    expect(size.rows).toBeGreaterThan(1000);
    expect(size.columns).toBeGreaterThan(300);
    const dom = () => page.evaluate(() => ({ rows: document.querySelectorAll('.salmon-pivot-table .salmon-data-grid-rows [role="row"]').length, cells: document.querySelectorAll('.salmon-pivot-table .salmon-data-grid-rows .salmon-data-grid-cell').length }));
    const first = await dom();
    expect(first.rows).toBeLessThan(60);
    expect(first.cells).toBeLessThan(first.rows * 30);
    // Scrolling far renders the rows there.
    await page.evaluate(() => {
      const vp = document.querySelector('.salmon-pivot-table .salmon-data-grid-viewport') as HTMLElement;
      vp.scrollTop = 36 * 1500;
      vp.scrollLeft = 120 * 200;
    });
    const key = await page.evaluate(() => window.__pivot.result.memberAt('rows', 1505).key);
    await expect(page.locator(`.salmon-pivot-table [data-row-id='r${key}']`)).toHaveCount(1);
    const after = await dom();
    expect(after.rows).toBeLessThan(60);
    expect(after.cells).toBeLessThan(after.rows * 30);
  });

  test('rows page through the Data Grid pager, columns through the column pager', async ({ page }) => {
    await open(page, 'case=paging');
    await expect(page.locator('.salmon-pivot-table .salmon-data-grid-rows [role="row"]')).toHaveCount(5);
    const pager = page.locator('.salmon-pivot-table .salmon-data-grid-pager');
    await expect(pager).toBeVisible();
    const firstPage = await page.locator('.salmon-pivot-table .salmon-data-grid-rows [role="row"]').first().getAttribute('data-row-id');
    await pager.getByRole('button', { name: 'Page 2' }).click();
    await expect(pager.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    const secondPage = await page.locator('.salmon-pivot-table .salmon-data-grid-rows [role="row"]').first().getAttribute('data-row-id');
    expect(secondPage).not.toBe(firstPage);
    // Column pager: 3 leaf columns per page.
    const colPager = page.locator('.salmon-pivot-table-column-pager');
    await expect(colPager).toContainText('Column page 1 of');
    const leafHeaders = page.locator('.salmon-pivot-table .salmon-data-grid-header-cell:not(.salmon-data-grid-header-group)[data-column-id^="c"]');
    await expect(leafHeaders).toHaveCount(3);
    await expect(leafHeaders.first()).toHaveAttribute('data-column-id', colId('[2023,"Q1"]|amount'));
    await colPager.getByRole('button', { name: 'Next columns' }).click();
    await expect(colPager).toContainText('Column page 2 of');
    await expect(leafHeaders.first()).toHaveAttribute('data-column-id', colId('[2023,"Q4"]|amount'));
    await expect(colPager.getByRole('button', { name: 'Previous columns' })).toBeEnabled();
  });

  test('rowHeight, gridLines and resizable are forwarded to the renderer', async ({ page }) => {
    await open(page, 'rowHeight=48&gridLines=horizontal&resizable');
    const height = await row(page, ['Asia']).evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.round(height)).toBe(48);
    await expect(page.locator('.salmon-pivot-table .salmon-data-grid')).toHaveAttribute('data-grid-lines', 'horizontal');
    const header = page.locator(`.salmon-data-grid-header-cell[data-column-id="${colId('[2023]|amount')}"]`);
    const handle = header.getByRole('button', { name: /Resize/ });
    await expect(handle).toHaveCount(1);
    const before = (await header.boundingBox())!.width;
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await header.boundingBox())!.width)).toBeGreaterThan(before + 40);
  });

  test('renderCell link, getCellClassName, renderTooltip and onCellClick', async ({ page }) => {
    await open(page, 'case=templates');
    const asia2024 = cell(page, ['Asia'], '[2024]|amount');
    const link = asia2024.locator('a.pivot-link');
    await expect(link).toHaveText(fmt(await sumWhere(page, { region: 'Asia', year: 2024 })));
    // getCellClassName: totals above 100,000 get the class.
    const grand = cell(page, ['Asia'], '|amount');
    await expect(grand).toHaveClass(/pivot-high/);
    await expect(asia2024).not.toHaveClass(/pivot-high/);
    // renderTooltip: a role="tooltip" child with the row and column labels.
    await expect(asia2024.locator('[role="tooltip"]')).toHaveText(/^Asia \/ 2024: /);
    // onCellClick (hyperlink click) reports the cell keys and value.
    await link.click();
    const clicks = await page.evaluate(() => window.__pivotCellClicks);
    expect(clicks.at(-1)).toEqual({ rowKey: '["Asia"]', columnKey: '[2024]|amount', value: await sumWhere(page, { region: 'Asia', year: 2024 }) });
    await expect(page).toHaveURL(/#cell-/);
    // renderHeader-free row header click reports a null columnKey.
    await rowHeader(page, ['Europe']).click();
    expect((await page.evaluate(() => window.__pivotCellClicks)).at(-1)).toMatchObject({ rowKey: '["Europe"]', columnKey: null });
  });

  test('cell selection reports rowKey|columnKey keys through onSelectionChange', async ({ page }) => {
    await open(page, 'case=selection');
    await cell(page, ['Asia'], '[2023]|amount').click();
    await expect(cell(page, ['Asia'], '[2023]|amount')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => (await events(page, 'selectionChange')).at(-1)?.keys).toEqual(['["Asia"]|[2023]|amount']);
    await cell(page, ['Europe'], '[2024]|amount').click({ modifiers: ['Shift'] });
    const keys: string[] = (await events(page, 'selectionChange')).at(-1)!.keys;
    expect([...keys].sort()).toEqual(['["Asia"]|[2023]|amount', '["Asia"]|[2024]|amount', '["Europe"]|[2023]|amount', '["Europe"]|[2024]|amount'].sort());
    expect(await page.evaluate(() => [...window.__pivot.getSnapshot().selection].sort())).toEqual([...keys].sort());
    // A cancelled before-event keeps the selection.
    await cancel(page, 'beforeSelectionChange', true);
    await cell(page, ['Americas'], '[2025]|amount').click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__pivot.getSnapshot().selection.length)).toBe(4);
  });

  test('className and style pass through to the root', async ({ page }) => {
    await open(page);
    const root = page.locator('#pivot');
    await expect(root).toHaveClass('salmon-pivot-table sales-report');
    await expect(root).toHaveCSS('max-width', '1100px');
  });

  test('renderLoading and aria-busy while computing; onComputeStart and onComputeEnd fire', async ({ page }) => {
    await open(page, 'case=templates');
    const samples = await page.evaluate(() => window.__pivotBusy);
    // The deferred first compute rendered the custom loading content with aria-busy, then cleared both.
    expect(samples[0]).toEqual(expect.objectContaining({ busy: true, loading: true, custom: true }));
    expect(samples.at(-1)).toEqual(expect.objectContaining({ busy: false, loading: false, custom: false }));
    await expect(page.locator('.salmon-pivot-table')).not.toHaveAttribute('aria-busy', /.*/);
    const start = await events(page, 'computeStart');
    const end = await events(page, 'computeEnd');
    expect(start[0]).toMatchObject({ phase: 'initial' });
    expect(end[0]).toMatchObject({ phase: 'initial', status: 'ready' });
    expect(end[0]!.duration).toBeGreaterThanOrEqual(0);
    await clearLog(page);
    await page.evaluate(() => window.__pivot.setSort('region', 'desc'));
    expect((await events(page, 'computeStart'))[0]).toMatchObject({ phase: 'update' });
    expect((await events(page, 'computeEnd'))[0]).toMatchObject({ phase: 'update', status: 'ready' });
    await expect(page.locator('.salmon-pivot-table .salmon-data-grid-rows [role="row"]').first()).toHaveAttribute('data-row-id', 'r["Europe"]');
  });

  test('onBeforePivotModelChange carries the action and cancels the change', async ({ page }) => {
    await open(page);
    await clearLog(page);
    await page.evaluate(() => window.__pivot.moveField('product', 'columns', 0));
    const changes = await events(page, 'pivotModelChange');
    expect(changes.at(-1)).toMatchObject({ action: 'moveField', field: 'product' });
    expect(await events(page, 'beforePivotModelChange')).toEqual([expect.objectContaining({ action: 'moveField', field: 'product' })]);
    expect(await axisFields(page, 'columns')).toEqual(['product', 'year']);
    await cancel(page, 'beforePivotModelChange', 'aggregate');
    const done = await page.evaluate(() => window.__pivot.setAggregate(0, 'max'));
    expect(done).toBe(false);
    expect((await model(page)).values[0].aggregate).toBe('sum');
    await cancel(page, 'beforePivotModelChange', null);
    expect(await page.evaluate(() => window.__pivot.setAggregate(0, 'max'))).toBe(true);
    expect((await events(page, 'pivotModelChange')).at(-1)).toMatchObject({ action: 'aggregate', field: 'amount' });
  });

  test('onBeforeFilterChange and onBeforeMemberEditorOpen cancel; onFilterChange reports the filter', async ({ page }) => {
    await open(page);
    await cancel(page, 'beforeMemberEditorOpen', 'region');
    expect(await page.evaluate(() => window.__pivot.openDialog({ kind: 'memberEditor', field: 'region' }))).toBe(false);
    await expect(dialog(page)).toHaveCount(0);
    expect(await events(page, 'beforeMemberEditorOpen')).toEqual([expect.objectContaining({ field: 'region' })]);
    await cancel(page, 'beforeMemberEditorOpen', null);
    await cancel(page, 'beforeFilterChange', 'region');
    expect(await page.evaluate(() => window.__pivot.setFilter('region', { exclude: ['Asia'] }))).toBe(false);
    await expect(row(page, ['Asia'])).toHaveCount(1);
    await cancel(page, 'beforeFilterChange', null);
    expect(await page.evaluate(() => window.__pivot.setFilter('region', { exclude: ['Asia'] }))).toBe(true);
    await expect(row(page, ['Asia'])).toHaveCount(0);
    expect((await events(page, 'filterChange')).at(-1)).toMatchObject({ field: 'region', filter: { exclude: ['Asia'] }, previousFilter: null });
  });

  test('getState / restoreState round trip and persistState restores the saved report', async ({ page }) => {
    await open(page);
    const state = await page.evaluate(() => JSON.stringify(window.__pivotApi.getState()));
    expect(JSON.parse(state)).toMatchObject({ version: 1, layout: 'compact', pivotModel: { rows: [{ field: 'region' }, { field: 'country' }, { field: 'city' }] } });
    await page.evaluate(() => window.__pivot.moveField('city', null));
    expect(await axisFields(page, 'rows')).toEqual(['region', 'country']);
    expect(await page.evaluate((s) => window.__pivotApi.restoreState(s), state)).toBe(true);
    expect(await axisFields(page, 'rows')).toEqual(['region', 'country', 'city']);
    expect((await events(page, 'pivotModelChange')).at(-1)).toMatchObject({ action: 'restore' });
    // A state of an unknown version is rejected with onError.
    expect(await page.evaluate(() => window.__pivotApi.restoreState({ version: 9, pivotModel: {} }))).toBe(false);
    expect((await events(page, 'error')).at(-1)).toMatchObject({ action: 'restore' });

    // persistState: saved on change, restored on the next load.
    await open(page, 'case=persist');
    await page.evaluate(() => localStorage.removeItem('salmon-pivot-table:pivot-test'));
    await page.evaluate(() => window.__pivot.moveField('product', 'rows', 0));
    const saved = await page.evaluate(() => localStorage.getItem('salmon-pivot-table:pivot-test'));
    expect(JSON.parse(saved!)).toMatchObject({ app: '1', state: { version: 1 } });
    await page.reload();
    await page.waitForFunction(() => window.__pivot?.status === 'ready');
    await expect.poll(() => axisFields(page, 'rows')).toEqual(['product', 'region', 'country', 'city']);
    await expect(row(page, ['Laptop'])).toHaveCount(1);
    await page.evaluate(() => localStorage.removeItem('salmon-pivot-table:pivot-test'));
  });
});

// ---------------------------------------------------------------------------
// Field list and axis bar (PWP3)
// ---------------------------------------------------------------------------

const fieldList = (page: Page) => page.locator('section .salmon-pivot-table-field-list');
const axisList = (scope: Locator, axis: string) => scope.locator(`[role="listbox"][data-axis="${axis}"]`);
const chip = (scope: Locator, axis: string, field: string) => scope.locator(`[data-axis="${axis}"] [data-pivot-field="${field}"]`).first();
const barAxis = (page: Page, axis: string) => page.locator(`.salmon-pivot-table-axis-bar [role="toolbar"][data-axis="${axis}"]`);
const barChip = (page: Page, axis: string, field: string) => barAxis(page, axis).locator(`[data-pivot-field="${field}"]`);

/** HTML drag and drop with a shared DataTransfer (Playwright's mouse drag does not carry dataTransfer data). */
async function dragTo(page: Page, source: Locator, target: Locator, position: 'start' | 'end' = 'end'): Promise<void> {
  const box = (await target.boundingBox())!;
  const x = position === 'start' ? box.x + 4 : box.x + box.width - 4;
  const y = position === 'start' ? box.y + 4 : box.y + box.height - 4;
  const dt = await page.evaluateHandle(() => new DataTransfer());
  // Handles, not locators: the dragged item may re-render elsewhere after the drop (dragend goes to the original node).
  const src = (await source.elementHandle())!;
  const dst = (await target.elementHandle())!;
  await src.dispatchEvent('dragstart', { dataTransfer: dt });
  await dst.dispatchEvent('dragenter', { dataTransfer: dt, clientX: x, clientY: y });
  await dst.dispatchEvent('dragover', { dataTransfer: dt, clientX: x, clientY: y });
  await dst.dispatchEvent('drop', { dataTransfer: dt, clientX: x, clientY: y });
  await src.dispatchEvent('dragend', { dataTransfer: dt });
}

test.describe('PivotFieldList', () => {
  test('the popup field list opens from the toolbar and from api.openFieldList()', async ({ page }) => {
    await open(page, 'case=toolbar');
    await page.locator('.salmon-pivot-table-toolbar').getByRole('button', { name: 'Field list' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('heading', { name: 'Field list' })).toBeVisible();
    await expect(dialog(page).getByRole('listbox', { name: 'Rows' })).toBeVisible();
    // Field list edits apply to the table at once (no deferUpdate in the popup by default).
    await dialog(page).locator('[role="option"][data-pivot-field="product"]').click();
    await expect.poll(() => axisFields(page, 'rows')).toContain('product');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await page.evaluate(() => window.__pivotApi.openFieldList());
    await expect(dialog(page)).toBeVisible();
    // Visual consistency: the close button is a square icon button with a 16px SVG glyph (no font ×),
    // controls use the md radius and the dialog the lg radius.
    const close = dialog(page).getByRole('button', { name: 'Close' });
    const metrics = await close.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const glyph = getComputedStyle(el, '::before');
      return { w: box.width, h: box.height, text: el.textContent, glyph: glyph.width, mask: glyph.maskImage, radius: getComputedStyle(el).borderRadius, dialog: getComputedStyle(el.closest('[role=dialog]')!).borderRadius };
    });
    expect(metrics).toMatchObject({ text: '', glyph: '16px', radius: '6px', dialog: '10px' });
    expect(metrics.w).toBe(metrics.h);
    expect(metrics.mask).toContain('svg');
    await close.click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('a standalone field list stays in sync with the table both ways', async ({ page }) => {
    await open(page, 'case=fieldlist');
    // A narrow field list wraps its parts instead of overflowing into its neighbours.
    const list = fieldList(page);
    expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(axisList(list, 'rows').locator('[data-pivot-field]')).toHaveText(['Region', 'Country', 'City']);
    // Table → field list.
    await page.evaluate(() => window.__pivot.moveField('quarter', 'columns'));
    await expect(axisList(list, 'columns').locator('[data-pivot-field]')).toHaveText(['Year', 'Values', 'Quarter']);
    await expect(list.locator('[role="option"][data-pivot-field="quarter"]').first()).toHaveAttribute('aria-selected', 'true');
    // Field list → table.
    await list.locator('[role="listbox"][aria-label="Fields"] [data-pivot-field="city"]').click();
    await expect.poll(() => axisFields(page, 'rows')).toEqual(['region', 'country']);
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="pivot-row-header"]')).toHaveText('Region / Country');
  });

  test('field search, fieldOrder and folders', async ({ page }) => {
    await open(page, 'case=fieldlist&order=asc');
    const list = fieldList(page);
    const fields = list.locator('[role="listbox"][aria-label="Fields"]');
    // Folders are option groups; fields without a folder come first; ascending inside each group.
    await expect(fields.locator(':scope > [role="option"]')).toHaveText(['Amount', 'Customer', 'Units']);
    await expect(fields.getByRole('group', { name: 'Geography' }).getByRole('option')).toHaveText(['City', 'Country', 'Region']);
    await expect(fields.getByRole('group', { name: 'Time' }).getByRole('option')).toHaveText(['Date', 'Quarter', 'Year']);
    // Hidden fields are not listed.
    await expect(fields.locator('[data-pivot-field="id"]')).toHaveCount(0);
    await list.getByRole('searchbox', { name: 'Search fields' }).fill('co');
    await expect(fields.getByRole('option')).toHaveText(['Country']);
    await list.getByRole('searchbox', { name: 'Search fields' }).fill('');
    await open(page, 'case=fieldlist&order=custom');
    await expect(fieldList(page).locator('[role="listbox"][aria-label="Fields"] > [role="option"]').first()).toHaveText('Units');
  });

  test('drag and drop between axes and the keyboard Move-to menu, Alt+Arrow reorder, Delete remove; onBeforeFieldMove / onFieldMove', async ({ page }) => {
    await open(page, 'case=fieldlist');
    const list = fieldList(page);
    // Drag Product from the field list to Columns (end).
    await dragTo(page, list.locator('[role="listbox"][aria-label="Fields"] [data-pivot-field="product"]'), axisList(list, 'columns'));
    await expect.poll(() => axisFields(page, 'columns')).toEqual(['year', 'product']);
    expect((await events(page, 'fieldMove')).at(-1)).toMatchObject({ field: 'product', from: null, to: 'columns', source: 'pointer' });
    // Drag City from Rows to the start of Filters.
    await dragTo(page, chip(list, 'rows', 'city'), axisList(list, 'filters'), 'start');
    await expect.poll(() => axisFields(page, 'filters')).toEqual(['city', 'category']);
    expect(await axisFields(page, 'rows')).toEqual(['region', 'country']);

    // Keyboard: Enter opens the field menu; "Move to Columns".
    await chip(list, 'rows', 'country').focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    await menu(page).getByRole('menuitem', { name: 'Move to Columns' }).click();
    await expect.poll(() => axisFields(page, 'columns')).toEqual(['year', 'product', 'country']);
    // Alt+ArrowUp reorders inside the axis and keeps focus on the moved item.
    await chip(list, 'columns', 'country').focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => axisFields(page, 'columns')).toEqual(['year', 'country', 'product']);
    await expect(chip(list, 'columns', 'country')).toBeFocused();
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(() => axisFields(page, 'columns')).toEqual(['year', 'product', 'country']);
    // Delete removes the field from the report.
    await page.keyboard.press('Delete');
    await expect.poll(() => axisFields(page, 'columns')).toEqual(['year', 'product']);
    expect((await events(page, 'fieldMove')).at(-1)).toMatchObject({ field: 'country', to: null, source: 'keyboard' });

    // onBeforeFieldMove cancels a move.
    await clearLog(page);
    await cancel(page, 'beforeFieldMove', 'product');
    await dragTo(page, chip(list, 'columns', 'product'), axisList(list, 'rows'));
    await page.waitForTimeout(100);
    expect(await axisFields(page, 'columns')).toEqual(['year', 'product']);
    expect(await events(page, 'beforeFieldMove')).toEqual([expect.objectContaining({ field: 'product', from: 'columns', to: 'rows' })]);
    expect(await events(page, 'fieldMove')).toEqual([]);
  });

  test('closing a field menu and at once opening the next keeps focus in the new menu', async ({ page }) => {
    await open(page, 'case=fieldlist');
    const list = fieldList(page);
    // Load the lazy menu once, then close it.
    await chip(list, 'rows', 'region').focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    await expect(chip(list, 'rows', 'region')).toBeFocused();
    await chip(list, 'rows', 'region').press('Enter');
    await expect(menu(page)).toBeVisible();
    await expect.poll(() => menu(page).evaluate((m) => m.contains(document.activeElement))).toBe(true);
    // Escape, then Enter on the next chip before the deferred focus of the closed menu ran.
    await page.evaluate(() => {
      const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      key(document.activeElement as Element, 'Escape');
      const next = document.querySelector<HTMLElement>('section .salmon-pivot-table-field-list [data-axis="rows"] [data-pivot-field="country"]');
      next?.focus();
      key(next as Element, 'Enter');
    });
    await expect(menu(page)).toBeVisible();
    await page.waitForTimeout(100);
    expect(await menu(page).evaluate((m) => m.contains(document.activeElement))).toBe(true);
  });

  test('field menus sort, filter and change the aggregate; aggregateOptions and onBeforeAggregateMenuOpen edit the offered aggregates', async ({ page }) => {
    await open(page, 'case=fieldlist&aggregates');
    const list = fieldList(page);
    // Sort descending from the Region menu.
    await chip(list, 'rows', 'region').click();
    await menu(page).getByRole('menuitem', { name: 'Sort descending' }).click();
    await expect(page.locator('.salmon-pivot-table .salmon-data-grid-rows [role="row"]').first()).toHaveAttribute('data-row-id', 'r["Europe"]');
    expect((await events(page, 'sortChange')).at(-1)).toMatchObject({ field: 'region', sort: 'desc' });
    // Filter… opens the member editor.
    await chip(list, 'rows', 'region').click();
    await menu(page).getByRole('menuitem', { name: 'Filter…' }).click();
    await expect(dialog(page).getByRole('heading', { name: 'Filter Region' })).toBeVisible();
    await page.keyboard.press('Escape');
    // Aggregate submenu: the four `aggregateOptions`.
    await chip(list, 'values', 'amount').click();
    await menu(page).getByRole('menuitem', { name: 'Summarize values by' }).click();
    const sub = page.locator('[role="menu"]').last();
    await expect(sub.getByRole('menuitem')).toHaveText(['✓ Sum', 'Count', 'Average', 'Max']);
    await sub.getByRole('menuitem', { name: 'Max' }).click();
    await expect.poll(async () => (await model(page)).values[0].aggregate).toBe('max');
    await expect(chip(list, 'values', 'amount')).toHaveText('Max of Amount');
    expect((await events(page, 'beforeAggregateMenuOpen')).at(-1)).toMatchObject({ field: 'amount', index: 0, items: ['sum', 'count', 'average', 'max'] });
    // onBeforeAggregateMenuOpen trims the items.
    await cancel(page, 'aggregateItems', 'trim');
    await chip(list, 'values', 'units').click();
    await menu(page).getByRole('menuitem', { name: 'Summarize values by' }).click();
    await expect(page.locator('[role="menu"]').last().getByRole('menuitem')).toHaveCount(2);
  });

  test('deferUpdate edits a draft that Apply commits and Cancel drops', async ({ page }) => {
    await open(page, 'case=fieldlist&defer');
    const list = fieldList(page);
    await list.locator('[role="listbox"][aria-label="Fields"] [data-pivot-field="product"]').click();
    await expect(axisList(list, 'rows').locator('[data-pivot-field="product"]')).toHaveCount(1);
    // The table keeps the applied model.
    expect(await axisFields(page, 'rows')).toEqual(['region', 'country', 'city']);
    await list.getByRole('button', { name: 'Cancel' }).click();
    await expect(axisList(list, 'rows').locator('[data-pivot-field="product"]')).toHaveCount(0);
    await list.locator('[role="listbox"][aria-label="Fields"] [data-pivot-field="city"]').click();
    expect(await axisFields(page, 'rows')).toEqual(['region', 'country', 'city']);
    await list.getByRole('button', { name: 'Apply' }).click();
    await expect.poll(() => axisFields(page, 'rows')).toEqual(['region', 'country']);
    expect((await events(page, 'pivotModelChange')).at(-1)).toMatchObject({ action: 'apply' });
    await expect(list.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  test('the Values item moves between the column and row axes', async ({ page }) => {
    await open(page, 'case=fieldlist');
    const list = fieldList(page);
    const values = chip(list, 'columns', '__values__').or(axisList(list, 'columns').locator('[data-pivot-field]', { hasText: 'Values' })).first();
    await expect(values).toHaveText('Values');
    await values.focus();
    await page.keyboard.press('Enter');
    await menu(page).getByRole('menuitem', { name: 'Move to Rows' }).click();
    await expect.poll(async () => (await model(page)).valuesPlacement.axis).toBe('rows');
    await expect(axisList(list, 'rows').locator('[data-pivot-field]', { hasText: 'Values' })).toHaveCount(1);
    // Measures now head rows: the Units measure appears as a row header.
    await expect(page.locator('.salmon-pivot-table .salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="pivot-row-header"]', { hasText: 'Units' }).first()).toBeVisible();
  });
});

test.describe('PivotAxisBar', () => {
  test('one toolbar per axis plus the fields panel; buttons show sort and filter state', async ({ page }) => {
    await open(page, 'case=axisbar');
    for (const name of ['Fields', 'Filters', 'Columns', 'Rows', 'Values']) await expect(page.getByRole('toolbar', { name })).toHaveCount(1);
    await expect(barAxis(page, 'rows').getByRole('button')).toHaveText(['Region', 'Country', 'City']);
    await expect(barAxis(page, 'values').getByRole('button')).toHaveText(['Sum of Amount', 'Sum of Units']);
    await expect(barAxis(page, 'fields').getByRole('button')).toHaveText(['Product', 'Quarter', 'Date', 'Customer']);
    await page.evaluate(() => window.__pivot.setFilter('region', { include: ['Asia'] }));
    await expect(barChip(page, 'rows', 'region')).toHaveAttribute('data-filtered', '');
    // Roving focus: ArrowRight moves between the buttons of one toolbar.
    await barChip(page, 'rows', 'region').focus();
    await page.keyboard.press('ArrowRight');
    await expect(barChip(page, 'rows', 'country')).toBeFocused();
  });

  test('value field aggregate menu with onBeforeAggregateMenuOpen; drag between axes and Alt+Arrow reorder', async ({ page }) => {
    await open(page, 'case=axisbar');
    await barChip(page, 'values', 'units').click();
    await menu(page).getByRole('menuitem', { name: 'Summarize values by' }).click();
    await page.locator('[role="menu"]').last().getByRole('menuitem', { name: 'Average' }).click();
    await expect(barChip(page, 'values', 'units')).toHaveText('Average of Units');
    expect((await events(page, 'beforeAggregateMenuOpen')).at(-1)).toMatchObject({ field: 'units', index: 1 });
    // Cancelling onBeforeAggregateMenuOpen hides the aggregate submenu.
    await cancel(page, 'beforeAggregateMenuOpen', 'amount');
    await barChip(page, 'values', 'amount').click();
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole('menuitem', { name: 'Summarize values by' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Drag Quarter from the fields panel to Columns; drag Year to Rows.
    await dragTo(page, barChip(page, 'fields', 'quarter'), barAxis(page, 'columns'));
    await expect.poll(() => axisFields(page, 'columns')).toEqual(['year', 'quarter']);
    await dragTo(page, barChip(page, 'columns', 'year'), barAxis(page, 'rows'), 'start');
    await expect.poll(() => axisFields(page, 'rows')).toEqual(['year', 'region', 'country', 'city']);
    expect((await events(page, 'fieldMove')).at(-1)).toMatchObject({ field: 'year', from: 'columns', to: 'rows', index: 0 });
    await barChip(page, 'rows', 'year').focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(() => axisFields(page, 'rows')).toEqual(['region', 'year', 'country', 'city']);
    await page.keyboard.press('Delete');
    await expect.poll(() => axisFields(page, 'rows')).toEqual(['region', 'country', 'city']);
  });

  test('on a phone the dialogs are full-screen sheets and touch "Move to" moves a field', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, locale: 'en-US' });
    const page = await context.newPage();
    await open(page, 'case=all');
    await page.evaluate(() => window.__pivotApi.openFieldList());
    // Full-screen sheet: the dialog covers the whole (fixed) backdrop, i.e. the layout viewport.
    const box = (await dialog(page).boundingBox())!;
    const screen = (await page.locator('.salmon-pivot-table-backdrop').boundingBox())!;
    const viewport = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: window.innerHeight }));
    expect(Math.round(screen.width)).toBe(viewport.w);
    expect(Math.round(box.x)).toBe(Math.round(screen.x));
    expect(Math.round(box.y)).toBe(Math.round(screen.y));
    expect(Math.round(box.width)).toBe(Math.round(screen.width));
    expect(Math.round(box.height)).toBe(Math.round(screen.height));
    await page.keyboard.press('Escape');
    await barChip(page, 'rows', 'city').tap();
    await menu(page).getByRole('menuitem', { name: 'Move to Columns' }).tap();
    await expect.poll(() => axisFields(page, 'columns')).toEqual(['year', 'city']);
    expect((await events(page, 'fieldMove')).at(-1)).toMatchObject({ field: 'city', to: 'columns' });
    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Dialogs (PWP4)
// ---------------------------------------------------------------------------

test.describe('pivot dialogs', () => {
  test('member editor include / exclude, search, select all', async ({ page }) => {
    await open(page, 'case=axisbar');
    await barChip(page, 'rows', 'country').click();
    await menu(page).getByRole('menuitem', { name: 'Filter…' }).click();
    const d = dialog(page);
    await expect(d.getByRole('heading', { name: 'Filter Country' })).toBeVisible();
    const list = d.getByRole('listbox', { name: 'Filter Country' });
    await expect(list.getByRole('option')).toHaveCount(9);
    // Uncheck Japan and India: an exclude filter.
    await list.getByRole('option', { name: /Japan/ }).click();
    await list.getByRole('option', { name: /India/ }).click();
    await expect(list.getByRole('option', { name: /Japan/ })).toHaveAttribute('aria-selected', 'false');
    await d.getByRole('button', { name: 'OK' }).click();
    await expect(d).toHaveCount(0);
    expect((await model(page)).filterBy.country).toEqual({ exclude: expect.arrayContaining(['Japan', 'India']) });
    await expect(cell(page, ['Asia'], '|amount')).toHaveText(fmt(await sumWhere(page, { country: 'Singapore' })));
    // Search, then select all of the shown members only → an include filter.
    await barChip(page, 'rows', 'country').click();
    await menu(page).getByRole('menuitem', { name: 'Filter…' }).click();
    const all = d.getByRole('checkbox', { name: /Select all/ });
    // The saved exclude filter leaves Select all unchecked (mixed): check it, then clear every member.
    await expect(all).not.toBeChecked();
    await all.check();
    await expect(list.getByRole('option', { name: /Japan/ })).toHaveAttribute('aria-selected', 'true');
    await all.uncheck();
    await expect(list.getByRole('option', { name: /Japan/ })).toHaveAttribute('aria-selected', 'false');
    await expect(d.getByRole('button', { name: 'OK' })).toBeDisabled();
    await d.getByRole('searchbox', { name: 'Search members' }).fill('an');
    const shown = await list.getByRole('option').count();
    expect(shown).toBeGreaterThan(0);
    await all.check();
    await d.getByRole('button', { name: 'OK' }).click();
    const filter = (await model(page)).filterBy.country;
    expect(Object.keys(filter)).toEqual(['include']);
    expect(filter.include.every((c: string) => /an/i.test(c))).toBe(true);
    expect(filter.include).toHaveLength(shown);
    expect((await events(page, 'filterChange')).at(-1)).toMatchObject({ field: 'country', source: 'pointer' });
  });

  test('grouping dialog groups a number field into ranges', async ({ page }) => {
    await open(page, 'case=axisbar');
    await page.evaluate(() => window.__pivot.setModel((m: any) => ({ ...m, rows: [{ field: 'units' }], columns: [] })));
    await barChip(page, 'rows', 'units').click();
    await menu(page).getByRole('menuitem', { name: 'Group…' }).click();
    const d = dialog(page);
    await expect(d.getByRole('heading', { name: 'Grouping: Units' })).toBeVisible();
    await d.getByLabel('Starting at').fill('1');
    await d.getByLabel('Ending at').fill('20');
    await d.getByLabel('Interval').fill('5');
    await d.getByRole('button', { name: 'OK' }).click();
    expect((await model(page)).groups.units).toEqual({ kind: 'number', interval: 5, start: 1, end: 20 });
    const labels = await page.evaluate(() => {
      const r = window.__pivot.result;
      const out: string[] = [];
      for (let i = 0; i < r.rowCount; i++) if (r.memberAt('rows', i).kind === 'member') out.push(r.memberAt('rows', i).label);
      return out;
    });
    // 1-5, 6-10, 11-15, 16-20.
    expect(labels.length).toBe(4);
    expect(labels[0]).toMatch(/^1\D+5$/);
    expect((await events(page, 'pivotModelChange')).at(-1)).toMatchObject({ action: 'group', field: 'units' });
  });

  test('grouping dialog groups string members into a custom group from the field menu', async ({ page }) => {
    await open(page, 'case=axisbar');
    await page.evaluate(() => window.__pivot.setModel((m: any) => ({ ...m, rows: [{ field: 'country' }], columns: [] })));
    await barChip(page, 'rows', 'country').click();
    await menu(page).getByRole('menuitem', { name: 'Group…' }).click();
    const d = dialog(page);
    await expect(d.getByRole('heading', { name: 'Grouping: Country' })).toBeVisible();
    await d.getByLabel('Group', { exact: true }).fill('First two');
    const options = d.getByRole('option');
    const picked = [await options.nth(0).getAttribute('aria-posinset'), await options.nth(1).getAttribute('aria-posinset')];
    expect(picked).toEqual(['1', '2']);
    await options.nth(0).click();
    await options.nth(1).click();
    await d.getByRole('button', { name: 'OK' }).click();
    const grouping = (await model(page)).groups.country;
    expect(grouping.kind).toBe('custom');
    expect(grouping.groups).toHaveLength(1);
    expect(grouping.groups[0].caption).toBe('First two');
    expect(grouping.groups[0].members).toHaveLength(2);
    const labels = await page.evaluate(() => {
      const r = window.__pivot.result;
      const out: string[] = [];
      for (let i = 0; i < r.rowCount; i++) out.push(r.memberAt('rows', i).label);
      return out;
    });
    expect(labels).toContain('First two');
    expect((await events(page, 'pivotModelChange')).at(-1)).toMatchObject({ action: 'group', field: 'country' });
  });

  test('calculated field editor reports formula errors and adds the field', async ({ page }) => {
    await open(page, 'case=toolbar');
    await page.locator('.salmon-pivot-table-toolbar').getByRole('button', { name: 'Calculated field' }).click();
    const d = dialog(page);
    await expect(d.getByRole('heading', { name: 'Calculated field' })).toBeVisible();
    await d.getByLabel('Name').fill('avgPrice');
    await d.getByLabel('Formula').fill('"Sum(amount)" / ');
    await expect(d.getByRole('alert')).toBeVisible();
    await expect(d.getByLabel('Formula')).toHaveAttribute('aria-invalid', 'true');
    await expect(d.getByRole('button', { name: 'OK' })).toBeDisabled();
    await d.getByLabel('Formula').fill('"Sum(amount)" / "Sum(units)"');
    await expect(d.getByRole('alert')).toHaveCount(0);
    await d.getByRole('button', { name: 'OK' }).click();
    await expect(d).toHaveCount(0);
    const m = await model(page);
    expect(m.calculatedFields).toEqual([{ name: 'avgPrice', formula: '"Sum(amount)" / "Sum(units)"' }]);
    expect(m.values.map((v: { field: string }) => v.field)).toContain('avgPrice');
    expect((await events(page, 'calculatedFieldChange')).at(-1)).toMatchObject({ name: 'avgPrice', previous: null });
    const ratio = await page.evaluate(() => {
      const r = window.__pivot.result;
      let c = 0;
      while (r.memberAt('columns', c).key !== '|avgPrice') c++;
      const a = r.memberAt('columns', 0).key === '|amount' ? 0 : null;
      return { value: r.valueAt(r.rowCount - 1, c), amount: a };
    });
    const amount = await sumWhere(page, {});
    const units = await sumWhere(page, {}, 'units');
    expect(ratio.value).toBeCloseTo(amount / units, 6);
  });

  test('conditional format dialog adds a rule that styles matching cells', async ({ page }) => {
    await open(page, 'case=toolbar');
    await page.locator('.salmon-pivot-table-toolbar').getByRole('button', { name: 'Conditional formatting' }).click();
    const d = dialog(page);
    await d.getByRole('button', { name: 'Add condition' }).click();
    await d.getByLabel('Measure').selectOption('amount');
    await d.getByLabel('Condition').selectOption('greaterThan');
    await d.getByLabel('Value', { exact: true }).fill('300000');
    await d.getByLabel('Style').selectOption('danger');
    await d.getByRole('button', { name: 'OK' }).click();
    expect((await model(page)).conditionalFormats).toEqual([{ operator: 'greaterThan', value: 300000, tone: 'danger', measure: 'amount' }]);
    await expect(cell(page, ['Europe'], '|amount')).toHaveClass(/salmon-pivot-table-tone-danger/);
    await expect(cell(page, ['Europe'], '[2024]|amount')).not.toHaveClass(/salmon-pivot-table-tone-danger/);
    await expect(cell(page, ['Europe'], '|units')).not.toHaveClass(/salmon-pivot-table-tone-danger/);
  });

  test('number format dialog formats a measure', async ({ page }) => {
    await open(page, 'case=toolbar');
    await page.locator('.salmon-pivot-table-toolbar').getByRole('button', { name: 'Number formatting' }).click();
    const d = dialog(page);
    await d.getByLabel('Measure').selectOption('amount');
    await d.getByLabel('Style').selectOption('currency');
    await d.getByLabel('Decimal places').fill('2');
    await d.getByRole('textbox', { name: 'Currency' }).fill('EUR');
    await d.getByRole('button', { name: 'OK' }).click();
    const value = await sumWhere(page, { region: 'Asia', year: 2024 });
    await expect(cell(page, ['Asia'], '[2024]|amount')).toHaveText(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value));
    expect((await events(page, 'pivotModelChange')).at(-1)).toMatchObject({ action: 'format', field: 'amount' });
  });

  test('drill through opens on double click and on Enter; maxRows truncates', async ({ page }) => {
    await open(page, 'case=drill');
    const target = cell(page, ['Asia', 'Japan'], '[2024]|amount');
    await page.getByRole('button', { name: 'Expand Asia' }).click();
    await target.dblclick();
    const d = dialog(page);
    await expect(d.getByRole('heading', { name: 'Details: Japan, 2024' })).toBeVisible();
    const count = (await page.evaluate(() => window.__pivotData)).filter((r) => r['country'] === 'Japan' && r['year'] === 2024).length;
    await expect(d.getByText(`${count} rows`)).toBeVisible();
    await expect(d.locator('.salmon-data-grid')).toHaveAttribute('aria-rowcount', String(count + 1));
    expect((await events(page, 'drillThrough')).at(-1)).toMatchObject({ rowKey: '["Asia","Japan"]', columnKey: '[2024]|amount', source: 'pointer' });
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    // Enter on a focused value cell.
    await cell(page, ['Europe'], '[2025]|amount').click();
    await page.keyboard.press('Enter');
    await expect(d.getByRole('heading', { name: 'Details: Europe, 2025' })).toBeVisible();
    expect((await events(page, 'drillThrough')).at(-1)).toMatchObject({ source: 'keyboard' });
    await page.keyboard.press('Escape');
    // onBeforeDrillThrough cancels.
    await cancel(page, 'beforeDrillThrough', true);
    await cell(page, ['Americas'], '[2025]|amount').dblclick();
    await page.waitForTimeout(150);
    await expect(d).toHaveCount(0);
    // maxRows.
    await open(page, 'case=drill&maxRows=5');
    await cell(page, ['Asia'], '[2024]|amount').dblclick();
    await expect(d.getByText('Showing the first 5 rows')).toBeVisible();
    await expect(d.locator('.salmon-data-grid')).toHaveAttribute('aria-rowcount', '6');
  });

  test('editing a drill-through row writes through and re-aggregates the table', async ({ page }) => {
    await open(page, 'case=drill');
    const before = await sumWhere(page, { region: 'Asia', year: 2024 });
    await cell(page, ['Asia'], '[2024]|amount').dblclick();
    const d = dialog(page);
    await expect(d).toBeVisible();
    const grid = d.locator('.salmon-data-grid');
    const firstRow = grid.locator('.salmon-data-grid-rows [role="row"]').first();
    const id = Number(await firstRow.getAttribute('data-row-id'));
    // The amount column is right of the dialog's viewport (column virtualization).
    await grid.locator('.salmon-data-grid-viewport').evaluate((el) => (el.scrollLeft = el.scrollWidth));
    const old = (await page.evaluate((i) => window.__pivotData[i], id))!['amount'] as number;
    await firstRow.locator('.salmon-data-grid-cell[data-column-id="amount"]').dblclick();
    const editor = grid.locator('input:focus');
    await expect(editor).toBeVisible();
    await editor.fill(String(old + 1000));
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await events(page, 'dataChange')).length).toBeGreaterThan(0);
    expect((await events(page, 'dataChange')).at(-1)).toMatchObject({ action: 'update', changes: 1 });
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    await expect(cell(page, ['Asia'], '[2024]|amount')).toHaveText(fmt(before + 1000));
    expect(await page.evaluate((i) => window.__pivot.getData()[i].amount, id)).toBe(old + 1000);
  });
});

// ---------------------------------------------------------------------------
// Toolbar and output (PWP6)
// ---------------------------------------------------------------------------

test.describe('PivotToolbar and export', () => {
  test('toolbar totals, grand totals, expand and collapse all', async ({ page }) => {
    await open(page, 'case=toolbar');
    const toolbar = page.getByRole('toolbar', { name: 'Pivot table toolbar' });
    await toolbar.getByRole('button', { name: 'Expand all' }).click();
    await expect(row(page, ['Asia', 'Japan', 'Tokyo'])).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Collapse Asia' })).toHaveCount(1);
    const subtotals = toolbar.getByRole('button', { name: 'Subtotals' });
    await expect(subtotals).toHaveAttribute('aria-pressed', 'true');
    await subtotals.click();
    await expect(subtotals).toHaveAttribute('aria-pressed', 'false');
    expect((await model(page)).totals.sub).toBe(false);
    await toolbar.getByRole('button', { name: 'Grand totals' }).click();
    await menu(page).getByRole('menuitem', { name: 'Do not show' }).click();
    await expect(row(page, '')).toHaveCount(0);
    expect((await model(page)).totals.grand).toBe('none');
    await toolbar.getByRole('button', { name: 'Collapse all' }).click();
    await expect(row(page, ['Asia', 'Japan'])).toHaveCount(0);
    // Roving focus across the toolbar.
    await toolbar.getByRole('button', { name: 'Field list' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(subtotals).toBeFocused();
  });

  test('CSV, Excel and PDF downloads through the export menu and the api; onBeforeExport / onExport', async ({ page }) => {
    await open(page, 'case=toolbar');
    const toolbar = page.getByRole('toolbar', { name: 'Pivot table toolbar' });
    // CSV from the toolbar menu.
    await toolbar.getByRole('button', { name: 'Export' }).click();
    const [csv] = await Promise.all([page.waitForEvent('download'), menu(page).getByRole('menuitem', { name: 'CSV' }).click()]);
    expect(csv.suggestedFilename()).toBe('pivot.csv');
    const text = readFileSync((await csv.path())!, 'utf8');
    expect(text).toContain('Asia');
    // Column paths in the header, raw numbers in the cells.
    expect(text.split(/\r?\n/)[0]).toMatch(/2024 \/ /);
    expect(text).toContain(`,${await sumWhere(page, { region: 'Asia', year: 2024 })}`);
    expect((await events(page, 'export')).at(-1)).toMatchObject({ format: 'csv', fileName: 'pivot' });
    // Excel: an XLSX zip.
    await toolbar.getByRole('button', { name: 'Export' }).click();
    const [xlsx] = await Promise.all([page.waitForEvent('download'), menu(page).getByRole('menuitem', { name: 'Excel' }).click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
    expect(readFileSync((await xlsx.path())!).subarray(0, 2).toString('latin1')).toBe('PK');
    // PDF through the api.
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.__pivotApi.exportToPdf({ fileName: 'sales' }))]);
    expect(pdf.suggestedFilename()).toBe('sales.pdf');
    expect(readFileSync((await pdf.path())!).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((await events(page, 'export')).map((e) => e.format)).toEqual(['csv', 'xlsx', 'pdf']);
    // onBeforeExport cancels.
    await cancel(page, 'beforeExport', true);
    await page.evaluate(() => window.__pivotApi.exportToCsv());
    expect(await events(page, 'export')).toHaveLength(3);
  });

  test('api.print() prints the result as a plain table in a hidden frame; onExport reports it', async ({ page }) => {
    await open(page, 'case=toolbar');
    const printed = await page.evaluate(async () => {
      await window.__pivotApi.print();
      // The frame stays for a second after the print dialog call.
      const doc = document.querySelector<HTMLIFrameElement>('body > iframe[aria-hidden="true"]')?.contentDocument;
      return { rows: doc?.querySelectorAll('tbody tr').length ?? 0, columns: doc?.querySelectorAll('thead th[scope="col"]').length ?? 0, text: doc?.body.textContent ?? '', result: { rows: window.__pivot.result.rowCount, columns: window.__pivot.result.columnCount } };
    });
    expect(printed.rows).toBe(printed.result.rows);
    expect(printed.columns).toBe(printed.result.columns);
    expect(printed.text).toContain('Asia');
    expect((await events(page, 'export')).at(-1)).toMatchObject({ format: 'print' });
  });
});

// ---------------------------------------------------------------------------
// Pivot Chart: `Chart` composed beside the table from `usePivotChartProps()`
// ---------------------------------------------------------------------------

test.describe('Pivot Chart', () => {
  const chart = (page: Page) => page.locator('.pivot-chart');
  const point = (page: Page, series: string, index: number) => chart(page).locator(`[data-series="${series}"] path[data-index="${index}"]`).first();
  /** Clicks the middle of a point's mark (the plot's interaction layer above the marks receives it, as for a user). */
  const clickPoint = async (page: Page, series: string, index: number) => {
    const box = await point(page, series, index).boundingBox();
    if (!box) throw new Error(`no mark for ${series}:${index}`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };

  test('Chart beside the table; point clicks drill down the rows, then open drill through with editing', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'case=chart');
    // (`displayOption: 'Both'`): the table and the chart side by side, one store.
    await expect(chart(page)).toBeVisible();
    await expect(page.locator('.salmon-pivot-table')).toBeVisible();
    const info = await page.evaluate(() => {
      const r = window.__pivot.result;
      const columns: string[] = [];
      for (let c = 0; c < r.columnCount; c++) if (r.memberAt('columns', c).kind !== 'grandTotal') columns.push(r.memberAt('columns', c).key);
      return { region: r.memberAt('rows', 0).label as string, columns };
    });
    // One series per year (grand total excluded); the category axis shows the row members.
    await expect(chart(page).locator('.salmon-chart-series-group')).toHaveCount(info.columns.length);
    await expect(chart(page).locator('svg text', { hasText: info.region }).first()).toBeVisible();
    // drill down from the chart (region, then country); the table follows.
    await clickPoint(page, 's0', 0);
    await expect.poll(async () => (await model(page)).expanded).toEqual([['rows', info.region]]);
    expect((await events(page, 'expandedChange')).at(-1)).toMatchObject({ action: 'expand', source: 'pointer' });
    await expect(page.getByRole('button', { name: `Collapse ${info.region}` })).toHaveCount(1);
    const country = await page.evaluate(() => window.__pivot.result.memberAt('rows', 1).label as string);
    await expect(chart(page).locator('svg text', { hasText: `${info.region} / ${country}` }).first()).toBeAttached();
    await clickPoint(page, 's0', 0);
    await expect.poll(async () => (await model(page)).expanded.length).toBe(2);
    const city = await page.evaluate(() => window.__pivot.result.memberAt('rows', 2).label as string);
    // a leaf point opens drill through for its cell; the dialog edits like the table's.
    await clickPoint(page, 's0', 0);
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole('heading', { name: new RegExp(`Details: ${city}`) })).toBeVisible();
    expect((await events(page, 'drillThrough')).at(-1)).toMatchObject({ rowKey: JSON.stringify([info.region, country, city]), columnKey: info.columns[0], source: 'pointer' });
    const clicks = await page.evaluate(() => window.__pivotChartClicks);
    expect(clicks).toHaveLength(3);
    expect(clicks[2]).toMatchObject({ seriesId: 's0', index: 0, rowKey: JSON.stringify([info.region, country, city]), columnKey: info.columns[0] });
    // Editing a raw record from the chart's drill through writes through; the chart value follows.
    const before = await page.evaluate(() => window.__pivot.result.valueAt(2, 0) as number);
    const grid = d.locator('.salmon-data-grid');
    const firstRow = grid.locator('.salmon-data-grid-rows [role="row"]').first();
    const id = Number(await firstRow.getAttribute('data-row-id'));
    await grid.locator('.salmon-data-grid-viewport').evaluate((el) => (el.scrollLeft = el.scrollWidth));
    const old = (await page.evaluate((i) => window.__pivotData[i], id))!['amount'] as number;
    await firstRow.locator('.salmon-data-grid-cell[data-column-id="amount"]').dblclick();
    const editor = grid.locator('input:focus');
    await expect(editor).toBeVisible();
    await editor.fill(String(old + 1000));
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await events(page, 'dataChange')).length).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    expect(await page.evaluate(() => window.__pivot.result.valueAt(2, 0) as number)).toBe(before + 1000);
    // The drill-through grid addresses rows by `getRowId`; the core's dev warning only looks for a primaryKey column.
    expect(problems.filter((p) => !p.includes('edit-no-primary-key'))).toEqual([]);
  });

  test('view=chart shows the chart only; the series type follows the pivot chart type', async ({ page }) => {
    await page.goto(`${URL}?case=chart&view=chart&type=stackingColumn`);
    await page.waitForFunction(() => window.__pivot?.status === 'ready');
    await expect(chart(page)).toBeVisible();
    await expect(page.locator('.salmon-pivot-table')).toBeHidden();
    await expect(chart(page).locator('.salmon-chart-series-group').first()).toHaveAttribute('data-type', 'column');
  });

  test('PivotChart draws polar and radar with Chart polar coordinates', async ({ page }) => {
    const problems = collectProblems(page);
    for (const type of ['polar', 'radar']) {
      await page.goto(`${URL}?case=chart&view=chart&family&type=${type}`);
      await page.waitForFunction(() => window.__pivot?.status === 'ready');
      await expect(chart(page).locator('[data-axis="polar"]').first()).toBeAttached();
      await expect(chart(page).locator('.salmon-chart-series-group').first()).toHaveAttribute('data-type', 'line');
      await expect(chart(page).locator('.salmon-accumulation-point')).toHaveCount(0);
    }
    expect(problems).toEqual([]);
  });

  test('PivotChart draws pie, doughnut, funnel and pyramid with the accumulation family; a slice drills the pivot', async ({ page }) => {
    const problems = collectProblems(page);
    const paths: Record<string, string> = {};
    for (const [type, root] of [['pie', 'salmon-pie-chart'], ['doughnut', 'salmon-pie-chart'], ['funnel', 'salmon-funnel-chart'], ['pyramid', 'salmon-funnel-chart']] as const) {
      await page.goto(`${URL}?case=chart&view=chart&family&type=${type}`);
      await page.waitForFunction(() => window.__pivot?.status === 'ready');
      await expect(page.locator(`.pivot-chart.${root}`)).toBeVisible();
      const slices = chart(page).locator('.salmon-accumulation-point');
      await expect(slices.first()).toBeVisible();
      await expect(chart(page).locator('.salmon-chart-series-group')).toHaveCount(0);
      const regions = await page.evaluate(() => {
        const r = window.__pivot.result;
        let n = 0;
        for (let i = 0; i < r.rowCount; i++) if (r.memberAt('rows', i).kind !== 'grandTotal') n++;
        return n;
      });
      // Funnel and pyramid draw one series; pie and doughnut one ring per year.
      const rings = await slices.evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-series'))).size);
      if (type === 'funnel' || type === 'pyramid') {
        expect(rings).toBe(1);
        await expect(slices).toHaveCount(regions);
      } else expect(rings).toBeGreaterThan(1);
      paths[type] = (await slices.first().getAttribute('d')) ?? '';
    }
    // A doughnut slice has an inner arc; a pie slice closes at the center.
    expect(paths.doughnut!.match(/A/g)?.length).toBeGreaterThan(paths.pie!.match(/A/g)?.length ?? 0);
    expect(paths.pyramid).not.toBe(paths.funnel);
    await page.goto(`${URL}?case=chart&view=chart&family&type=pie`);
    await page.waitForFunction(() => window.__pivot?.status === 'ready');
    const region = await page.evaluate(() => window.__pivot.result.memberAt('rows', 0).label as string);
    // The chart's interaction layer covers the marks: click a point inside the slice.
    const at = await chart(page).locator('.salmon-accumulation-point[data-series="0"][data-index="0"]').evaluate((el) => {
      const path = el as unknown as SVGGeometryElement;
      const box = path.getBBox();
      const m = path.getScreenCTM()!;
      const probe = path.ownerSVGElement!.createSVGPoint();
      const inside: { x: number; y: number }[] = [];
      for (let i = 1; i < 40; i++) {
        for (let j = 1; j < 40; j++) {
          probe.x = box.x + (box.width * i) / 40;
          probe.y = box.y + (box.height * j) / 40;
          if (path.isPointInFill(probe)) inside.push({ x: probe.x, y: probe.y });
        }
      }
      if (!inside.length) throw new Error('no point inside the slice');
      // The inside point nearest the slice's center of mass, away from the ring edges.
      const cx = inside.reduce((s, p) => s + p.x, 0) / inside.length;
      const cy = inside.reduce((s, p) => s + p.y, 0) / inside.length;
      const best = inside.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? b : a));
      probe.x = best.x;
      probe.y = best.y;
      const p = probe.matrixTransform(m);
      return { x: p.x, y: p.y };
    });
    await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    await expect.poll(async () => (await model(page)).expanded).toEqual([['rows', region]]);
    expect(await page.evaluate(() => window.__pivotChartClicks)).toMatchObject([{ seriesId: 's0', index: 0 }]);
    expect(problems).toEqual([]);
  });

  test('chart export and print, and the table plus the chart in one PDF', async ({ page }) => {
    await open(page, 'case=chart');
    await expect(point(page, 's0', 0)).toBeVisible();
    // Chart export.
    const [png] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.__pivotChart!.export({ format: 'png', fileName: 'chart.png' }))]);
    expect(png.suggestedFilename()).toBe('chart.png');
    expect(readFileSync((await png.path())!).subarray(1, 4).toString('latin1')).toBe('PNG');
    // Chart print: the chart SVG in a print frame.
    const printed = await page.evaluate(async () => {
      // Records what the print frame's document is written with.
      let svg = false;
      const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentDocument')!;
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
        configurable: true,
        get(this: HTMLIFrameElement) {
          const doc = desc.get!.call(this) as Document | null;
          if (doc && !(doc as unknown as { __spy?: boolean }).__spy) {
            const write = doc.write.bind(doc);
            Object.assign(doc, { __spy: true, write: (markup: string) => ((svg ||= markup.includes('<svg')), write(markup)) });
          }
          return doc;
        },
      });
      try {
        await window.__pivotChart!.print();
      } finally {
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', desc);
      }
      return svg;
    });
    expect(printed).toBe(true);
    // Table and chart in one PDF: `api.exportToPdf({ chart: await pivotChartImage(chartApi) })`.
    const pdf = await page.evaluate(async () => {
      const count = (data: Uint8Array) => Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(new TextDecoder('latin1').decode(data))?.[1]);
      const image = await window.__pivotChartImage();
      const plain = await window.__pivotApi.exportToPdf({ download: false });
      const file = await window.__pivotApi.exportToPdf({ download: false, chart: image });
      const text = new TextDecoder('latin1').decode(file.data);
      return { plain: count(plain.data), pages: count(file.data), image: /\/Subtype \/Image/.test(text), type: image.type, width: image.width, height: image.height };
    });
    expect(pdf.pages).toBe(pdf.plain + 1);
    expect(pdf.image).toBe(true);
    expect(pdf.type).toBe('png');
    expect(pdf.width).toBeGreaterThan(100);
    expect(pdf.height).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// Keyboard map, localization and RTL (PWP8)
// ---------------------------------------------------------------------------

test.describe('pivot keyboard map and RTL', () => {
  const toolbarButton = (page: Page, item: string) => page.locator(`.salmon-pivot-table-toolbar [data-item="${item}"]`).first();

  test('keyboard map: roving toolbars, field menus by Enter and Shift+F10, dialogs that contain and return focus, drill by Enter and Space', async ({ page }) => {
    await open(page, 'case=all');
    // Toolbar: one tab stop, arrows rove, Home / End jump.
    const first = toolbarButton(page, 'fieldList');
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(first).not.toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await page.keyboard.press('End');
    await expect(first).not.toBeFocused();
    await page.keyboard.press('Home');
    // Enter opens the field list dialog; focus moves in and Tab stays inside; Escape returns focus.
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.salmon-pivot-table-dialog'))).toBe(true);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.salmon-pivot-table-dialog'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(first).toBeFocused();

    // Axis bar: arrows rove inside an axis; Enter and Shift+F10 open the field menu; Escape returns focus.
    const region = barChip(page, 'rows', 'region');
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect(barChip(page, 'rows', 'country')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(region).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    await expect(region).toBeFocused();
    // Closing the menu also re-focuses the chip from a setTimeout(0) (field-item.tsx requestFocus); let it
    // run first (timers of one delay run in order), or it takes focus back from the next menu.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
    await page.keyboard.press('Shift+F10');
    await expect(menu(page)).toBeVisible();
    // The menu takes focus once it mounted; arrows before that stay on the chip.
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="menu"]'))).toBe(true);
    // Arrow to "Filter…" and open the member editor from the keyboard.
    const filterItem = menu(page).getByRole('menuitem', { name: 'Filter…' });
    for (let i = 0; i < 10 && !(await filterItem.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown');
    await expect(filterItem).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByRole('heading', { name: 'Filter Region' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.salmon-pivot-table-dialog'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(region).toBeFocused();

    // Table: Enter drills down a member header, Space drills up.
    const asia = rowHeader(page, ['Asia']);
    await asia.click();
    await page.keyboard.press('Enter');
    await expect(row(page, ['Asia'])).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(row(page, ['Asia'])).toHaveAttribute('aria-expanded', 'false');
  });

  test('RTL mirrors the table, the axis bar arrows and the dialogs (dir="rtl", logical properties)', async ({ page }) => {
    await open(page, 'case=all&dir=rtl');
    expect(await page.locator('.salmon-pivot-table').first().evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    // The row header column sits on the inline start (right) of the value cells.
    const header = await rowHeader(page, ['Asia']).boundingBox();
    const value = await row(page, ['Asia']).locator('.salmon-data-grid-cell[data-column-id^="c"]').first().boundingBox();
    expect(header && value && header.x > value.x).toBe(true);
    // ArrowLeft is "next" in RTL.
    await barChip(page, 'rows', 'region').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(barChip(page, 'rows', 'country')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(barChip(page, 'rows', 'region')).toBeFocused();
    // Dialogs inherit the direction.
    await page.evaluate(() => window.__pivotApi.openFieldList());
    await expect(dialog(page)).toBeVisible();
    expect(await dialog(page).evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    await page.keyboard.press('Escape');
  });
});
