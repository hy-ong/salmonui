import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// Row selection options through <DataGrid> on a mounted grid: `checkboxOnly`,
// `checkboxRowClick`, `toggle`, `additive`,
// and the before / after selection events.
// `window.__setExtra` re-renders the grid with a new `selection` object
// (the option is reactive).

const SMALL = `${DEV_URL}?rows=200&cols=10`;
const selectedRows = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-row[aria-selected="true"]')].map((e) => (e as HTMLElement).dataset['rowId']));
const cell = (page: Page, row: number, field = 's1') => page.locator(`.salmon-data-grid-row[data-row-id="r${row}"] .salmon-data-grid-cell[data-column-id="${field}"]`);
const box = (page: Page, row: number) => page.locator(`.salmon-data-grid-row[data-row-id="r${row}"] .salmon-data-grid-cell[data-selection-column]`);
const apiSelected = (page: Page) => page.evaluate(() => [...(window.__gridApi.getSelectedRowIds() as string[])]);
const setExtra = (page: Page, patch: string) => page.evaluate((p) => (window as unknown as { __setExtra(x: unknown): void }).__setExtra(new Function(`return (${p});`)()), patch);

test.describe('row selection options', () => {
  test('checkboxOnly: a row click does not select, the checkbox does', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&sel=checkbox&checkboxOnly`);
    await cell(page, 2).click();
    await cell(page, 4, 's2').click();
    expect(await selectedRows(page)).toEqual([]);
    expect(await apiSelected(page)).toEqual([]);
    await box(page, 2).click();
    await expect(box(page, 2).locator('[role="checkbox"]')).toHaveAttribute('aria-checked', 'true');
    expect(await selectedRows(page)).toEqual(['r2']);
    // Still no row-click selection once something is selected, and the checkbox adds.
    await cell(page, 4).click();
    expect(await selectedRows(page)).toEqual(['r2']);
    await box(page, 4).click();
    expect(await selectedRows(page)).toEqual(['r2', 'r4']);
    await box(page, 2).click();
    expect(await selectedRows(page)).toEqual(['r4']);
    expect(problems).toEqual([]);
  });

  test("checkboxRowClick: 'replace' resets the checkbox selection on a plain row click; 'add' keeps it", async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&sel=checkbox`);
    // Default 'add': a row click toggles the row into the checkbox selection.
    await box(page, 1).click();
    await box(page, 3).click();
    await cell(page, 5).click();
    expect(await selectedRows(page)).toEqual(['r1', 'r3', 'r5']);
    await page.evaluate(() => window.__gridApi.clearSelection());
    await expect.poll(() => selectedRows(page)).toEqual([]);
    await setExtra(page, `{ selection: { multiple: true, checkboxRowClick: 'replace' } }`);
    await box(page, 1).click();
    await box(page, 3).click();
    expect(await selectedRows(page)).toEqual(['r1', 'r3']);
    // A plain row click selects only that row.
    await cell(page, 5).click();
    expect(await selectedRows(page)).toEqual(['r5']);
    await expect(box(page, 1).locator('[role="checkbox"]')).toHaveAttribute('aria-checked', 'false');
    // The checkbox still adds.
    await box(page, 7).click();
    expect(await selectedRows(page)).toEqual(['r5', 'r7']);
    expect(problems).toEqual([]);
  });

  test('toggle: clicking the only selected row deselects it by default; toggle: false keeps it', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&sel=single`);
    await cell(page, 2).click();
    expect(await selectedRows(page)).toEqual(['r2']);
    await cell(page, 2).click();
    expect(await selectedRows(page)).toEqual([]);
    await setExtra(page, `{ selection: { multiple: false, toggle: false } }`);
    await cell(page, 2).click();
    expect(await selectedRows(page)).toEqual(['r2']);
    await cell(page, 2).click();
    expect(await selectedRows(page)).toEqual(['r2']);
    expect(await apiSelected(page)).toEqual(['r2']);
    // Another row still replaces it.
    await cell(page, 3).click();
    expect(await selectedRows(page)).toEqual(['r3']);
    expect(problems).toEqual([]);
  });

  test('additive: plain clicks toggle rows without Ctrl; without it a plain click replaces', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&sel=multiple`);
    await cell(page, 1).click();
    await cell(page, 3).click();
    expect(await selectedRows(page)).toEqual(['r3']);
    await setExtra(page, `{ selection: { multiple: true, additive: true } }`);
    await cell(page, 1).click();
    await cell(page, 5).click();
    expect(await selectedRows(page)).toEqual(['r1', 'r3', 'r5']);
    // A plain click on a selected row removes it.
    await cell(page, 3).click();
    expect(await selectedRows(page)).toEqual(['r1', 'r5']);
    expect(await apiSelected(page)).toEqual(['r1', 'r5']);
    expect(problems).toEqual([]);
  });
});

type SelectionRecord = { type: string; rowIds: string[]; added: string[]; removed: string[]; cells: { rowId: string; field: string }[]; columns: string[]; target: string | null; source: string; ctrlKey: boolean };
const records = (page: Page) => page.evaluate(() => (window as unknown as { __sel: SelectionRecord[] }).__sel);
const clearRecords = (page: Page) => page.evaluate(() => void ((window as unknown as { __sel: SelectionRecord[] }).__sel.length = 0));

async function recordSelection(page: Page, selection: string): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __sel: SelectionRecord[]; __cancelSelection: boolean; __record(e: any): void };
    w.__sel = [];
    w.__cancelSelection = false;
    w.__record = (e: any) => {
      w.__sel.push({ type: e.type, rowIds: [...e.rowIds], added: [...e.added], removed: [...e.removed], cells: e.cells.map((c: any) => ({ rowId: c.rowId, field: c.field })), columns: [...e.columns], target: e.target, source: e.source, ctrlKey: e.ctrlKey });
      if (e.type === 'beforeSelectionChange' && w.__cancelSelection) e.preventDefault();
    };
  });
  await setExtra(
    page,
    `{ selection: ${selection}, onBeforeSelectionChange: (e) => window.__record(e), onSelectionChange: (e) => window.__record(e) }`,
  );
}

test.describe('selection events through <DataGrid>', () => {
  test('onBeforeSelectionChange + preventDefault() cancels row and checkbox selection; events carry target and modifiers', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&sel=checkbox`);
    await recordSelection(page, `{ multiple: true }`);
    await page.evaluate(() => ((window as unknown as { __cancelSelection: boolean }).__cancelSelection = true));
    await cell(page, 2).click();
    await box(page, 4).click();
    expect(await selectedRows(page)).toEqual([]);
    expect(await apiSelected(page)).toEqual([]);
    let log = await records(page);
    // Before-events ran with the proposed value; no after-event followed.
    expect(log.map((r) => r.type)).toEqual(['beforeSelectionChange', 'beforeSelectionChange']);
    expect(log[0]).toEqual(expect.objectContaining({ rowIds: ['r2'], added: ['r2'], target: 'row', source: 'pointer' }));
    expect(log[1]).toEqual(expect.objectContaining({ rowIds: ['r4'], added: ['r4'], target: 'checkbox', source: 'pointer' }));
    // Not cancelled: the checkbox click applies and the after-event reports target 'checkbox'.
    await page.evaluate(() => ((window as unknown as { __cancelSelection: boolean }).__cancelSelection = false));
    await clearRecords(page);
    await box(page, 4).click();
    expect(await selectedRows(page)).toEqual(['r4']);
    log = await records(page);
    expect(log.map((r) => r.type)).toEqual(['beforeSelectionChange', 'selectionChange']);
    expect(log[1]).toEqual(expect.objectContaining({ rowIds: ['r4'], added: ['r4'], removed: [], target: 'checkbox' }));
    // Ctrl+click on a row reports the modifier and the row target.
    await clearRecords(page);
    await cell(page, 6).click({ modifiers: ['ControlOrMeta'] });
    log = await records(page);
    expect(log.at(-1)).toEqual(expect.objectContaining({ type: 'selectionChange', rowIds: ['r4', 'r6'], added: ['r6'], target: 'row', ctrlKey: true }));
    // Cancelling a deselect keeps the row.
    await page.evaluate(() => ((window as unknown as { __cancelSelection: boolean }).__cancelSelection = true));
    await box(page, 4).click();
    expect(await selectedRows(page)).toEqual(['r4', 'r6']);
    expect(problems).toEqual([]);
  });
});
