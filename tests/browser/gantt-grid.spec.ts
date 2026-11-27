import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Gantt grid pane gates (examples/vite-spa/gantt.html?set=grid; checklist
// "Gantt Grid Pane"): the Data Grid props passed through `Gantt` work in the
// grid pane, and the chart pane draws the same rows (sorting, filtering,
// search, selection, column menu, reorder, resize, pinning, hiding, grid
// lines, row drag through the engine, lazy children, remote and reactive
// data).

declare global {
  interface Window {
    __ganttApi: Record<string, any>;
    __ganttEvents: { id: string; type: string; value: any }[];
    __mountMs?: number;
  }
}

async function open(page: Page): Promise<void> {
  await page.goto(`${DEV_URL}gantt.html?set=grid`);
  await page.waitForFunction(() => window.__mountMs !== undefined && Object.keys(window.__ganttApi).length >= 6 && !document.querySelector('[data-salmon-pending]'));
  await page.locator('[data-scenario="g-query"] .salmon-gantt__row').first().waitFor();
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const api = <T,>(page: Page, id: string, fn: string, ...args: unknown[]) =>
  page.evaluate(([i, f, a]) => {
    const r = window.__ganttApi[i as string][f as string](...(a as unknown[]));
    return r && typeof r === 'object' && 'status' in r ? { status: r.status } : Array.isArray(r) ? JSON.parse(JSON.stringify(r)) : r;
  }, [id, fn, args] as const) as Promise<T>;
const events = (page: Page, id: string, type: string) => page.evaluate(([i, t]) => window.__ganttEvents.filter((e) => e.id === i && e.type === t), [id, type] as const);
/** Row ids in view order: grid pane and chart pane. */
const order = (page: Page, id: string) =>
  scope(page, id).evaluate((s) => {
    const read = (sel: string, attr: string) =>
      [...s.querySelectorAll<HTMLElement>(sel)].sort((a, b) => Number(a.dataset['rowIndex']) - Number(b.dataset['rowIndex'])).map((e) => e.getAttribute(attr));
    return { grid: read('.salmon-data-grid-row[data-row-id]', 'data-row-id'), chart: read('.salmon-gantt__row', 'data-task-id') };
  });
const info = (page: Page, id: string, task: string) =>
  page.evaluate(([i, t]) => {
    const x = window.__ganttApi[i as string].getTaskInfo(t);
    return x ? { start: x.start?.toISOString(), end: x.end?.toISOString(), parentId: x.parentId, parent: x.parent } : null;
  }, [id, task] as const);
const header = (page: Page, id: string, column: string): Locator => scope(page, id).locator(`.salmon-data-grid-header-cell[data-column-id="${column}"]`);

test.describe('query', () => {
  test('sorting reorders siblings within their parent in both panes; clearSorting restores', async ({ page }) => {
    await open(page);
    const before = await order(page, 'g-query');
    expect(before.grid).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    await api(page, 'g-query', 'sortColumn', 'title', 'desc');
    const expected = ['1', '9', '2', '3', '4', '5', '8', '7', '6'];
    await expect.poll(async () => (await order(page, 'g-query')).grid).toEqual(expected);
    expect((await order(page, 'g-query')).chart).toEqual(expected);
    // Pointer: a header click sorts too (ascending) and fires the Data Grid event.
    await api(page, 'g-query', 'clearSorting');
    await expect.poll(async () => (await order(page, 'g-query')).chart).toEqual(before.chart);
    await header(page, 'g-query', 'title').locator('.salmon-data-grid-header-cell__text').click();
    const asc = ['1', '5', '6', '7', '8', '2', '4', '3', '9'];
    await expect.poll(async () => (await order(page, 'g-query')).chart).toEqual(asc);
    expect((await events(page, 'g-query', 'sortChange')).length).toBeGreaterThan(0);
  });

  test('filtering hides rows in both panes; treeFilterMode keeps ancestors or only the matches', async ({ page }) => {
    await open(page);
    await api(page, 'g-query', 'filterColumn', 'title', 'contains', 'end');
    await expect.poll(async () => (await order(page, 'g-query')).grid).toEqual(['1', '5', '6', '7']);
    expect((await order(page, 'g-query')).chart).toEqual(['1', '5', '6', '7']);
    expect((await events(page, 'g-query', 'filterChange')).length).toBeGreaterThan(0);
    // `treeFilterMode: 'none'`: the matches without their ancestors.
    await api(page, 'g-filter', 'filterColumn', 'title', 'contains', 'end');
    await expect.poll(async () => (await order(page, 'g-filter')).grid).toEqual(['6', '7']);
    expect((await order(page, 'g-filter')).chart).toEqual(['6', '7']);
    await api(page, 'g-query', 'clearFiltering');
    await expect.poll(async () => (await order(page, 'g-query')).chart).toHaveLength(9);
  });

  test("the toolbar 'search' item and api.search filter both panes", async ({ page }) => {
    await open(page);
    const box = scope(page, 'g-query').getByRole('searchbox', { name: 'Search' });
    await box.fill('Integrate');
    await expect.poll(async () => (await order(page, 'g-query')).chart).toEqual(['1', '5', '8']);
    expect((await order(page, 'g-query')).grid).toEqual(['1', '5', '8']);
    expect((await events(page, 'g-query', 'searchChange')).length).toBeGreaterThan(0);
    await api(page, 'g-query', 'search', 'Scope');
    await expect.poll(async () => (await order(page, 'g-query')).chart).toEqual(['1', '2', '3']);
    await api(page, 'g-query', 'clearSearch');
    await expect.poll(async () => (await order(page, 'g-query')).chart).toHaveLength(9);
  });
});

test.describe('selection', () => {
  test('a taskbar click selects its row, Ctrl+click adds; api.selectRows and clearSelection mark both panes', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-query');
    const bar = (task: number) => s.locator(`.salmon-gantt__row[data-task-id="${task}"] [data-part]`).last();
    await bar(4).click();
    await expect(s.locator('.salmon-data-grid-row[data-row-id="4"]')).toHaveAttribute('aria-selected', 'true');
    await expect(s.locator('.salmon-gantt__row[data-task-id="4"] [data-part="taskbar"]')).toHaveAttribute('data-selected', 'true');
    await bar(6).click({ modifiers: ['ControlOrMeta'] });
    await expect.poll(() => api<string[]>(page, 'g-query', 'getSelectedRowIds')).toEqual(['4', '6']);
    expect((await events(page, 'g-query', 'selectionChange')).length).toBeGreaterThan(0);
    await api(page, 'g-query', 'selectRows', ['7']);
    await expect(s.locator('.salmon-gantt__row[data-task-id="7"] [data-part="taskbar"]')).toHaveAttribute('data-selected', 'true');
    await expect(s.locator('.salmon-gantt__row[data-task-id="4"] [data-part="taskbar"]')).not.toHaveAttribute('data-selected', 'true');
    // A grid row click selects the row and marks its taskbar.
    await s.locator('.salmon-data-grid-row[data-row-id="3"] .salmon-data-grid-cell').nth(1).click();
    await expect(s.locator('.salmon-gantt__row[data-task-id="3"] [data-part="taskbar"]')).toHaveAttribute('data-selected', 'true');
    await api(page, 'g-query', 'clearSelection');
    await expect(s.locator('.salmon-gantt__row [data-selected]')).toHaveCount(0);
  });
});

test.describe('columns', () => {
  test('the column menu opens from the header and its sort item sorts both panes', async ({ page }) => {
    await open(page);
    const h = header(page, 'g-query', 'title');
    await h.hover();
    await h.locator('.salmon-data-grid-column-menu-button').click();
    const menu = page.getByRole('menu', { name: 'Task name column menu' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: /Sort descending/ }).click();
    await expect.poll(async () => (await order(page, 'g-query')).chart).toEqual(['1', '9', '2', '3', '4', '5', '8', '7', '6']);
  });

  test('column reorder by pointer and through the API fires onColumnReorder', async ({ page }) => {
    await open(page);
    const ids = () => scope(page, 'g-query').locator('.salmon-data-grid-header-cell').evaluateAll((els) => els.map((e) => e.getAttribute('data-column-id')));
    expect((await ids()).slice(0, 5)).toEqual(['owner', 'id', 'title', 'start', 'end']);
    // Pointer drag of a header onto the inline-end half of another moves it after that column.
    const from = (await header(page, 'g-query', 'id').boundingBox())!;
    const to = (await header(page, 'g-query', 'start').boundingBox())!;
    await page.mouse.move(from.x + 30, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 2 });
    await page.mouse.move(to.x + to.width * 0.75, to.y + to.height / 2, { steps: 12 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await expect.poll(async () => (await ids()).slice(0, 5)).toEqual(['owner', 'title', 'start', 'id', 'end']);
    expect((await events(page, 'g-query', 'columnReorder')).length).toBeGreaterThan(0);
    // The body cells follow; the chart keeps its rows.
    await expect(scope(page, 'g-query').locator('.salmon-data-grid-row[data-row-id="3"] .salmon-data-grid-cell').nth(3)).toHaveText('3');
    await expect(scope(page, 'g-query').locator('.salmon-gantt__row')).toHaveCount(9);
    await api(page, 'g-query', 'moveColumn', 'end', 1);
    await expect.poll(async () => (await ids()).slice(0, 5)).toEqual(['owner', 'end', 'title', 'start', 'id']);
  });

  test('a pointer resize changes the width and fires onColumnResizeEnd; autoSizeColumns fits the content', async ({ page }) => {
    await open(page);
    await header(page, 'g-query', 'title').scrollIntoViewIfNeeded();
    const width = () => header(page, 'g-query', 'title').evaluate((e) => Math.round(e.getBoundingClientRect().width));
    const w0 = await width();
    const handle = header(page, 'g-query', 'title').locator('.salmon-data-grid-resize-handle');
    const b = (await handle.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 3 });
    await page.mouse.move(b.x + 60, b.y + b.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect.poll(width).toBeGreaterThan(w0 + 40);
    expect((await events(page, 'g-query', 'columnResizeEnd')).length).toBe(1);
    await api(page, 'g-query', 'autoSizeColumns', 'title');
    await expect.poll(width).toBeLessThan(w0 + 40);
    // Chart rows still line up with the grid rows after the resize (shared row model).
    const s = scope(page, 'g-query');
    const gridTop = await s.locator('.salmon-data-grid-row[data-row-id="6"]').evaluate((e) => e.getBoundingClientRect().top);
    const chartTop = await s.locator('.salmon-gantt__row[data-task-id="6"]').evaluate((e) => e.getBoundingClientRect().top);
    expect(Math.abs(gridTop - chartTop)).toBeLessThanOrEqual(1);
  });

  test('a pinned column stays at the inline start while the grid pane scrolls', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-query');
    const owner = s.locator('.salmon-data-grid-row[data-row-id="3"] [data-column-id="owner"]');
    await expect(owner).toHaveText('Owner 3');
    const x0 = await owner.evaluate((e) => e.getBoundingClientRect().left);
    await s.locator('.salmon-data-grid-viewport').evaluate((e) => (e.scrollLeft = 200));
    await expect.poll(() => s.locator('.salmon-data-grid-viewport').evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    expect(Math.abs((await owner.evaluate((e) => e.getBoundingClientRect().left)) - x0)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.__ganttApi['g-query'].getColumns().find((c: any) => c.columnId === 'owner')?.freeze)).toBe('left');
  });

  test('a hidden column is listed by getColumns; showColumns / hideColumns toggle it', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-query');
    await expect(header(page, 'g-query', 'notes')).toHaveCount(0);
    const cols = await page.evaluate(() => window.__ganttApi['g-query'].getColumns().map((c: any) => ({ id: c.columnId, hidden: c.def.hidden === true })));
    expect(cols).toContainEqual({ id: 'notes', hidden: true });
    const visible = () => page.evaluate(() => window.__ganttApi['g-query'].getVisibleColumns().map((c: any) => c.columnId));
    expect(await visible()).not.toContain('notes');
    await api(page, 'g-query', 'showColumns', 'notes');
    await expect(header(page, 'g-query', 'notes')).toHaveCount(1);
    expect(await visible()).toContain('notes');
    await expect(s.locator('.salmon-data-grid-row[data-row-id="3"] [data-column-id="notes"]')).toHaveText('Agree on the scope');
    await api(page, 'g-query', 'hideColumns', ['notes', 'end']);
    await expect(header(page, 'g-query', 'notes')).toHaveCount(0);
    await expect(header(page, 'g-query', 'end')).toHaveCount(0);
    expect((await events(page, 'g-query', 'columnVisibilityChange')).length).toBeGreaterThan(0);
  });
});

test.describe('grid lines', () => {
  test('chart rows follow the grid lines; highlightOnHover false turns the grid row hover off', async ({ page }) => {
    await open(page);
    const line = (id: string) => scope(page, id).locator('.salmon-gantt__row').first().evaluate((e) => getComputedStyle(e).borderBottomColor);
    expect(await line('g-lines')).toBe('rgba(0, 0, 0, 0)');
    expect(await line('g-query')).not.toBe('rgba(0, 0, 0, 0)');
    await expect(scope(page, 'g-lines').locator('.salmon-data-grid')).toHaveAttribute('data-grid-lines', 'none');
    await expect(scope(page, 'g-lines').locator('.salmon-data-grid')).not.toHaveAttribute('data-hover', '');
    await expect(scope(page, 'g-query').locator('.salmon-data-grid')).toHaveAttribute('data-hover', '');
  });
});

test.describe('row drag', () => {
  test('a row dropped into another parent moves in the engine and reschedules; api.moveRows does the same', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-drag');
    await s.scrollIntoViewIfNeeded();
    const handle = (await s.locator('.salmon-data-grid-row[data-row-id="3"] .salmon-data-grid-row-drag-handle').boundingBox())!;
    const target = (await s.locator('.salmon-data-grid-row[data-row-id="6"]').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 4, handle.y + 10, { steps: 4 });
    // Lower half of the Backend row: below it, as a sibling under Build.
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.8, { steps: 15 });
    await page.mouse.up();
    await expect.poll(async () => (await info(page, 'g-drag', '3'))?.parentId).toBe('5');
    expect((await events(page, 'g-drag', 'rowDrop')).length).toBe(1);
    await expect.poll(async () => (await order(page, 'g-drag')).chart).toEqual(['1', '2', '4', '5', '6', '3', '7', '8', '9']);
    expect((await order(page, 'g-drag')).grid).toEqual(['1', '2', '4', '5', '6', '3', '7', '8', '9']);
    // The Plan summary now spans Estimate only.
    const plan = await info(page, 'g-drag', '2');
    const estimate = await info(page, 'g-drag', '4');
    expect(plan?.start).toBe(estimate?.start);
    // `into`: Integrate becomes a child of Release (a milestone turns into a summary).
    expect(await api(page, 'g-drag', 'moveRows', ['8'], { targetRowId: '9', position: 'into' })).toEqual({ status: 'applied' });
    await expect.poll(async () => (await info(page, 'g-drag', '8'))?.parentId).toBe('9');
    expect((await info(page, 'g-drag', '9'))?.parent).toBe(true);
    await expect.poll(async () => (await order(page, 'g-drag')).chart).toEqual((await order(page, 'g-drag')).grid);
  });
});

test.describe('data', () => {
  test('a lazy parent loads its children on expand; both panes show them and the parent becomes a summary', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-lazy');
    await s.scrollIntoViewIfNeeded();
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(2);
    // Before the load the parent bar uses its own dates.
    const own = await info(page, 'g-lazy', '1');
    expect(own?.parent).toBe(false);
    await s.locator('.salmon-data-grid-row[data-row-id="1"] button.salmon-data-grid-tree-toggle').click();
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(4);
    await expect(s.locator('.salmon-data-grid-row')).toHaveCount(4);
    expect(await events(page, 'g-lazy', 'loadChildren')).toEqual([{ id: 'g-lazy', type: 'loadChildren', value: '1' }]);
    expect((await order(page, 'g-lazy')).chart).toEqual(['1', '11', '12', '2']);
    // The loaded tasks are scheduled (A2 follows A1) and roll up into the parent.
    const a1 = await info(page, 'g-lazy', '11');
    const a2 = await info(page, 'g-lazy', '12');
    expect(new Date(a2!.start!).getTime()).toBeGreaterThanOrEqual(new Date(a1!.end!).getTime() - 1);
    await expect.poll(async () => (await info(page, 'g-lazy', '1'))?.parent).toBe(true);
    // Collapse hides them in both panes; expanding again does not reload.
    await api(page, 'g-lazy', 'collapseRows', ['1']);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(2);
    await api(page, 'g-lazy', 'expandRows', ['1']);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(4);
    expect((await events(page, 'g-lazy', 'loadChildren')).length).toBe(1);
  });

  test('onBeforeTreeToggle cancels a toggle in both panes; onTreeToggle reports the applied one', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-lazy');
    await s.scrollIntoViewIfNeeded();
    const toggle = s.locator('.salmon-data-grid-row[data-row-id="1"] button.salmon-data-grid-tree-toggle');
    await page.evaluate(() => ((window as unknown as { __ganttVetoToggle: boolean }).__ganttVetoToggle = true));
    await toggle.click();
    await expect.poll(async () => (await events(page, 'g-lazy', 'beforeTreeToggle')).map((e) => e.value)).toEqual([{ rowId: '1', expanded: true }]);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(2);
    expect(await events(page, 'g-lazy', 'treeToggle')).toEqual([]);
    expect(await events(page, 'g-lazy', 'loadChildren')).toEqual([]);
    await page.evaluate(() => ((window as unknown as { __ganttVetoToggle: boolean }).__ganttVetoToggle = false));
    await toggle.click();
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(4);
    await expect.poll(async () => (await events(page, 'g-lazy', 'treeToggle')).map((e) => e.value)).toEqual([{ rowId: '1', expanded: true }]);
    await toggle.click();
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(2);
    await expect.poll(async () => (await events(page, 'g-lazy', 'treeToggle')).map((e) => e.value)).toEqual([{ rowId: '1', expanded: true }, { rowId: '1', expanded: false }]);
    expect((await events(page, 'g-lazy', 'beforeTreeToggle')).map((e) => e.value)).toEqual([{ rowId: '1', expanded: true }, { rowId: '1', expanded: true }, { rowId: '1', expanded: false }]);
  });

  test('a remote source: the grid reads the rows and the chart draws and schedules them', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-remote');
    await expect(s.locator('.salmon-data-grid-row')).toHaveCount(9);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
    await expect(s.locator('.salmon-gantt__summary')).toHaveCount(3);
    expect((await events(page, 'g-remote', 'query')).length).toBeGreaterThan(0);
    const estimate = await info(page, 'g-remote', '4');
    const scope3 = await info(page, 'g-remote', '3');
    expect(new Date(estimate!.start!).getTime()).toBeGreaterThanOrEqual(new Date(scope3!.end!).getTime() - 1);
    expect((await info(page, 'g-remote', '6'))?.parentId).toBe('5');
  });

  test('replacing data re-renders both panes; onViewChange fires for view changes', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-reactive');
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
    await page.getByTestId('replace-data').click();
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(2);
    await expect(s.locator('.salmon-data-grid-row')).toHaveCount(2);
    expect((await info(page, 'g-reactive', '2'))?.start).toBe('2026-04-06T08:00:00.000Z');
    const before = (await events(page, 'g-reactive', 'viewChange')).length;
    await api(page, 'g-reactive', 'sortColumn', 'title', 'asc');
    await expect.poll(async () => (await events(page, 'g-reactive', 'viewChange')).length).toBeGreaterThan(before);
  });
});
