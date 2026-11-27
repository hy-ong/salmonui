import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// Column chrome gaps in the browser: column chooser position, search
// operators and tree, column menu actions,
// context menu actions, submenus, targets and virtual / pinned rows, toolbar items and layout, stacked
// headers, column spans, print,
// the adaptive dialog event and lookup filtering.
// Fixture flags: examples/vite-spa/src/main.tsx; window.__setExtra merges props.

const CHROME = `${DEV_URL}?rows=2000&cols=30&chrome`;

type ChromeEvent = { type: string; [k: string]: unknown };
const chromeEvents = (page: Page) => page.evaluate(() => (window as unknown as { __chromeEvents: ChromeEvent[] }).__chromeEvents);
const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid-row[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const popover = (page: Page) => page.locator('[data-salmon-popover]');
const contextMenu = (page: Page) => page.getByRole('menu', { name: 'Context menu' });
const chooser = (page: Page) => page.getByRole('dialog', { name: 'Choose columns' });
const setExtra = (page: Page, patch: string) => page.evaluate((p) => (window as unknown as { __setExtra(x: unknown): void }).__setExtra(new Function(`return (${p})`)()), patch);
const nextFrames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const headerOrder = (page: Page) => page.locator('.salmon-data-grid-header .salmon-data-grid-header-cell[data-column-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['columnId']));
const editEvents = (page: Page) => page.evaluate(() => (window as unknown as { __editEvents: { type: string; rowId?: string }[] }).__editEvents.map((e) => e.type));
const rowValue = (page: Page, rowId: string, field: string) => page.evaluate(([r, f]) => (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.[f], [rowId, field] as const);
const viewValues = (page: Page, field: string) => page.evaluate((f) => (window.__gridApi.getViewRows() as Record<string, unknown>[]).map((r) => r[f]), field);

/** Records the target of every context menu that opens into window.__targets. */
async function recordTargets(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __targets: unknown[]; __setExtra(x: unknown): void };
    w.__targets = [];
    w.__setExtra({ onBeforeContextMenuOpen: (e: { target: unknown }) => w.__targets.push(e.target) });
  });
}
const targets = (page: Page) => page.evaluate(() => (window as unknown as { __targets: unknown[] }).__targets);

/** Replaces window.print: records the print projection, then fires afterprint like a closed dialog. */
async function stubPrint(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __prints: { headers: (string | null)[]; rows: number }[] };
    w.__prints = [];
    window.print = () => {
      const container = document.querySelector('.salmon-data-grid-print');
      w.__prints.push({ rows: container?.querySelectorAll('tbody > tr').length ?? 0, headers: [...(container?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent) });
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0);
    };
  });
}
const prints = (page: Page) => page.evaluate(() => (window as unknown as { __prints: { headers: (string | null)[]; rows: number }[] }).__prints);

/** Header texts of the chooser rows that are not hidden by the search. */
const chooserShown = (page: Page) => chooser(page).locator('.salmon-data-grid-column-chooser__item:not([hidden])').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['columnId'] as string));

// ---------------------------------------------------------------------------
// Column chooser
// ---------------------------------------------------------------------------

test.describe('column chooser', () => {
  test('openColumnChooser({ x, y }) opens the dialog at that point; without a point at the grid corner', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    for (const [x, y] of [
      [200, 200],
      [420, 130],
    ] as const) {
      await page.evaluate(([px, py]) => window.__gridApi.openColumnChooser({ x: px, y: py }), [x, y] as const);
      await expect(chooser(page)).toHaveAttribute('data-placed', '');
      const box = (await chooser(page).boundingBox())!;
      // The point is the dialog's top-left corner (2 px gap below a zero-size anchor).
      expect(Math.abs(box.x - x), `x for ${x},${y}`).toBeLessThanOrEqual(1);
      expect(Math.abs(box.y - (y + 2)), `y for ${x},${y}`).toBeLessThanOrEqual(1);
      await page.keyboard.press('Escape');
      await expect(chooser(page)).toHaveCount(0);
    }
    // No point: the grid's top-left corner.
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    await expect(chooser(page)).toHaveAttribute('data-placed', '');
    const grid = (await page.locator('.salmon-data-grid').boundingBox())!;
    const box = (await chooser(page).boundingBox())!;
    expect(Math.abs(box.x - grid.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - (grid.y + 2))).toBeLessThanOrEqual(1);
    expect(problems).toEqual([]);
  });

  test('searchOperator startsWith / endsWith / equal narrow the list by header text', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    const all = await page.evaluate(() => (window.__gridApi.getColumns() as { columnId: string; headerText: string }[]).map((c) => [c.columnId, c.headerText] as const));
    const expected = (pred: (header: string) => boolean) => all.filter(([, h]) => pred(h.toLowerCase())).map(([f]) => f);
    const search = async (operator: string, query: string) => {
      await setExtra(page, `{ columnChooser: { searchOperator: '${operator}' } }`);
      await page.evaluate(() => window.__gridApi.openColumnChooser());
      await chooser(page).getByRole('searchbox', { name: 'Search columns' }).fill(query);
      const shown = await chooserShown(page);
      await page.keyboard.press('Escape');
      await expect(chooser(page)).toHaveCount(0);
      return shown;
    };
    // contains (default) matches inside the text; startsWith does not.
    expect(await search('contains', 'ext 1')).toEqual(expected((h) => h.includes('ext 1')));
    expect(await search('startsWith', 'ext 1')).toEqual([]);
    const starts = await search('startsWith', 'text 1');
    expect(starts).toEqual(expected((h) => h.startsWith('text 1')));
    expect(starts).toContain('s1');
    expect(starts).toContain('s10');
    expect(starts).not.toContain('n14');
    const ends = await search('endsWith', ' 1');
    expect(ends).toEqual(expected((h) => h.endsWith(' 1')));
    expect(ends).toEqual(['s1']);
    const ends2 = await search('endsWith', '4');
    expect(ends2).toEqual(expected((h) => h.endsWith('4')));
    expect(ends2.length).toBeGreaterThan(1);
    // equal: the whole header text, case-insensitive.
    expect(await search('equal', 'TEXT 1')).toEqual(['s1']);
    expect(await search('equal', 'text')).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('stacked columns show as a tree: group rows, indentation by depth, a group toggles its leaves', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=500&cols=30&stacked&chrome`);
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    const dialog = chooser(page);
    await expect(dialog).toBeVisible();
    const rows = await dialog.locator('.salmon-data-grid-column-chooser__item').evaluateAll((els) =>
      els.map((e) => ({ id: (e as HTMLElement).dataset['columnId'], group: (e as HTMLElement).hasAttribute('data-group'), indent: getComputedStyle(e).paddingInlineStart })),
    );
    // Definition order: id, then each group followed by its parts and their leaves.
    expect(rows.slice(0, 14).map((r) => r.id)).toEqual(['id', 'g0', 'g0a', 's0', 's1', 's2', 's3', 'n4', 'g0b', 'n5', 'n6', 'd7', 'd8', 'b9']);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect([byId.get('g0')?.group, byId.get('g0a')?.group, byId.get('s0')?.group, byId.get('id')?.group]).toEqual([true, true, false, false]);
    // Indentation follows depth (16 px per level).
    expect([byId.get('id')?.indent, byId.get('g0')?.indent, byId.get('g0a')?.indent, byId.get('s0')?.indent]).toEqual(['4px', '4px', '20px', '36px']);
    const box = (id: string) => dialog.locator(`.salmon-data-grid-column-chooser__item[data-column-id="${id}"] input`);
    // Unchecking a part unchecks its leaves; its parent group turns mixed.
    await box('g0a').uncheck();
    for (const id of ['s0', 's1', 's2', 's3', 'n4']) await expect(box(id)).not.toBeChecked();
    await expect(box('n5')).toBeChecked();
    await expect.poll(() => box('g0').evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);
    // A group row checks every leaf under it.
    await box('g0').check();
    for (const id of ['s0', 'n4', 'n5', 'b9']) await expect(box(id)).toBeChecked();
    await expect.poll(() => box('g0').evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(false);
    // Uncheck a whole top-level group and apply: its leaves leave the header.
    await box('g1').uncheck();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);
    for (const id of ['s10', 'n14', 'b19']) await expect(header(page, id)).toHaveCount(0);
    await expect(header(page, 's0')).toHaveCount(1);
    // 31 leaves (id + 30) minus Group 1's ten.
    expect(await page.locator('[role="grid"]').getAttribute('aria-colcount')).toBe('21');
    // The search shows matching leaves with their group rows.
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    await chooser(page).getByRole('searchbox', { name: 'Search columns' }).fill('Text 21');
    expect(await chooserShown(page)).toEqual(['g2', 'g2a', 's21']);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Column menu actions
// ---------------------------------------------------------------------------

test.describe('column menu actions', () => {
  test('group, ungroup, filter and columnChooser clicked from the column menu', async ({ page }) => {
    const problems = collectProblems(page);
    // `group=` turns grouping on with nothing grouped; `filterUi=menu` the filter menu.
    await openGrid(page, `${CHROME}&group=&filterUi=menu`);
    const pick = async (columnId: string, itemId: string) => {
      await header(page, columnId).hover();
      await header(page, columnId).locator('.salmon-data-grid-column-menu-button').click();
      const menu = page.locator('.salmon-data-grid-column-menu');
      await expect(menu).toBeVisible();
      await menu.locator(`[data-item-id="${itemId}"]`).click();
    };
    const grouping = () => page.evaluate(() => (window.__gridApi.engine.getSnapshot().query.grouping as { columnId: string }[]).map((g) => g.columnId));
    await pick('s1', 'group');
    await expect.poll(grouping).toEqual(['s1']);
    await expect(page.locator('.salmon-data-grid-rows [data-row-id^="__g"]').first()).toBeVisible();
    await pick('s1', 'ungroup');
    await expect.poll(grouping).toEqual([]);
    await expect(page.locator('.salmon-data-grid-rows [data-row-id^="__g"]')).toHaveCount(0);
    // filter: the column menu is replaced by that column's filter menu.
    await pick('s2', 'filter');
    const filter = page.getByRole('dialog', { name: 'Filter Text 2' });
    await expect(filter).toBeVisible();
    await expect(page.locator('.salmon-data-grid-column-menu')).toHaveCount(0);
    await filter.getByRole('textbox', { name: 'Value' }).fill('word-1');
    await filter.getByRole('button', { name: 'OK' }).click();
    await expect(filter).toHaveCount(0);
    await expect.poll(async () => (await viewValues(page, 's2')).every((v) => String(v).includes('word-1'))).toBe(true);
    await expect(header(page, 's2')).toHaveAttribute('data-filtered', '');
    // columnChooser: the chooser opens in place of the menu.
    await pick('s3', 'columnChooser');
    await expect(chooser(page)).toBeVisible();
    await expect(page.locator('.salmon-data-grid-column-menu')).toHaveCount(0);
    await chooser(page).locator('.salmon-data-grid-column-chooser__item[data-column-id="s3"] input').uncheck();
    await chooser(page).getByRole('button', { name: 'OK' }).click();
    await expect(header(page, 's3')).toHaveCount(0);
    expect((await chromeEvents(page)).filter((e) => e.type === 'columnMenu').map((e) => `${e.id}:${e.field}`)).toEqual(['group:s1', 'ungroup:s1', 'filter:s2', 'columnChooser:s3']);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

test.describe('context menu actions', () => {
  const choose = async (page: Page, target: ReturnType<Page['locator']>, itemId: string) => {
    await target.click({ button: 'right' });
    await expect(contextMenu(page)).toBeVisible();
    const item = contextMenu(page).locator(`[data-item-id="${itemId}"]`);
    await expect(item).not.toHaveAttribute('aria-disabled', 'true');
    await item.click();
    await expect(popover(page)).toHaveCount(0);
  };

  test('edit, cancel, save and delete from the cell context menu', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=10&chrome&edit=row`);
    // edit opens the row editors at the clicked cell.
    await choose(page, cell(page, 'r1', 's1'), 'edit');
    await expect(page.locator('[data-row-id="r1"]').first()).toHaveAttribute('data-editing', '');
    await expect(cell(page, 'r1', 's1').locator('input')).toBeFocused();
    await cell(page, 'r1', 's1').locator('input').fill('from the menu');
    // cancel discards the draft (the key column has no editor: right-click it).
    await choose(page, cell(page, 'r1', 'id'), 'cancel');
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    expect(await rowValue(page, 'r1', 's1')).not.toBe('from the menu');
    // edit again, then save commits.
    await choose(page, cell(page, 'r1', 's1'), 'edit');
    await cell(page, 'r1', 's1').locator('input').fill('saved from the menu');
    await choose(page, cell(page, 'r1', 'id'), 'save');
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    expect(await rowValue(page, 'r1', 's1')).toBe('saved from the menu');
    // delete removes the target row.
    await choose(page, cell(page, 'r2', 's1'), 'delete');
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r2"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.getRowInfo('r2'))).toBeFalsy();
    expect(await editEvents(page)).toEqual(['editStart', 'editCancel', 'editStart', 'save', 'delete']);
    expect((await chromeEvents(page)).filter((e) => e.type === 'contextMenu').map((e) => e.id)).toEqual(['edit', 'cancel', 'edit', 'save', 'delete']);
    expect(problems).toEqual([]);
  });

  test('sortAscending / sortDescending and group / ungroup from the header context menu', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${CHROME}&qsort&group=`);
    await choose(page, header(page, 's1'), 'sortAscending');
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'ascending');
    const asc = (await viewValues(page, 's1')) as string[];
    expect([...asc].sort()).toEqual(asc);
    await choose(page, header(page, 's1'), 'sortDescending');
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'descending');
    const grouping = () => page.evaluate(() => (window.__gridApi.engine.getSnapshot().query.grouping as { columnId: string }[]).map((g) => g.columnId));
    await choose(page, header(page, 'b9'), 'group');
    await expect.poll(grouping).toEqual(['b9']);
    await expect(page.locator('.salmon-data-grid-rows [data-row-id^="__g"]').first()).toBeVisible();
    await choose(page, header(page, 'b9'), 'ungroup');
    await expect.poll(grouping).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('exportExcel / exportPdf from the cell context menu download the files', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=100&cols=6&chrome&export`);
    for (const [id, file] of [
      ['exportExcel', 'export.xlsx'],
      ['exportPdf', 'export.pdf'],
    ] as const) {
      const download = page.waitForEvent('download');
      await choose(page, cell(page, 'r3', 's1'), id);
      expect((await download).suggestedFilename()).toBe(file);
    }
    const events = (await page.evaluate(() => (window as unknown as { __outputEvents: { type: string; format: string; source: string }[] }).__outputEvents)).map((e) => `${e.type}:${e.format}:${e.source}`);
    expect(events).toEqual(['beforeExport:excel:pointer', 'export:excel:pointer', 'beforeExport:pdf:pointer', 'export:pdf:pointer']);
    expect(problems).toEqual([]);
  });

  test('firstPage / previousPage / nextPage / lastPage from the pager context menu', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=500&cols=6&chrome&paging=50`);
    const pager = page.locator('.salmon-data-grid-pager');
    const info = pager.locator('.salmon-data-grid-pager__info');
    const first = () => page.locator('.salmon-data-grid-rows [role="row"]').first().getAttribute('data-row-id');
    await expect(info).toContainText('1 of 10 pages');
    await choose(page, info, 'nextPage');
    await expect(info).toContainText('2 of 10 pages');
    await expect.poll(first).toBe('r50');
    await choose(page, info, 'lastPage');
    await expect(info).toContainText('10 of 10 pages');
    await expect.poll(first).toBe('r450');
    await choose(page, info, 'previousPage');
    await expect(info).toContainText('9 of 10 pages');
    await choose(page, info, 'firstPage');
    await expect(info).toContainText('1 of 10 pages');
    await expect.poll(first).toBe('r0');
    expect((await chromeEvents(page)).filter((e) => e.type === 'contextMenu').map((e) => e.id)).toEqual(['nextPage', 'lastPage', 'previousPage', 'firstPage']);
    expect(problems).toEqual([]);
  });
});

test.describe('context menu submenus and icons', () => {
  test('ArrowRight / click open a nested submenu, ArrowLeft closes it, a child item runs; icons render', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await setExtra(
      page,
      `{ contextMenu: [
        { id: 'flat', label: 'Flat', icon: '★' },
        { id: 'more', label: 'More', icon: '☰', items: [{ id: 'child.a', label: 'Child A' }, { id: 'child.b', label: 'Child B', icon: '✓' }] },
      ] }`,
    );
    await cell(page, 'r2', 's1').click({ button: 'right' });
    const menu = contextMenu(page);
    await expect(menu).toBeVisible();
    // Icons render in the icon slot, hidden from assistive technology.
    await expect(menu.locator('[data-item-id="flat"] .salmon-data-grid-menu__icon')).toHaveText('★');
    await expect(menu.locator('[data-item-id="flat"] .salmon-data-grid-menu__icon')).toHaveAttribute('aria-hidden', 'true');
    await expect(menu.locator('[data-item-id="more"] .salmon-data-grid-menu__icon')).toHaveText('☰');
    const more = menu.locator('[data-item-id="more"]');
    await expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(more.locator('.salmon-data-grid-menu__submenu-arrow')).toHaveCount(1);
    // Keyboard: ArrowDown to "More", ArrowRight opens the submenu and focuses its first item.
    await expect(menu.locator('[data-item-id="flat"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(more).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const sub = page.getByRole('menu', { name: 'More' });
    await expect(sub).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(sub.locator('[data-item-id="child.a"]')).toBeFocused();
    await expect(sub.locator('[data-item-id="child.b"] .salmon-data-grid-menu__icon')).toHaveText('✓');
    // The submenu sits beside its item (inline end in LTR).
    const moreBox = (await more.boundingBox())!;
    const subBox = (await sub.boundingBox())!;
    expect(subBox.x).toBeGreaterThanOrEqual(moreBox.x + moreBox.width - 1);
    expect(Math.abs(subBox.y - moreBox.y)).toBeLessThanOrEqual(1);
    // ArrowLeft closes only the submenu; focus returns to its item.
    await page.keyboard.press('ArrowLeft');
    await expect(sub).toHaveCount(0);
    await expect(menu).toBeVisible();
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    // Enter on the child runs it from the keyboard.
    await page.keyboard.press('ArrowRight');
    await expect(sub).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(popover(page)).toHaveCount(0);
    // Pointer: clicking the parent opens the submenu; clicking a child runs it and closes every menu.
    await cell(page, 'r3', 's2').click({ button: 'right' });
    await menu.locator('[data-item-id="more"]').click();
    await expect(sub).toBeVisible();
    await sub.locator('[data-item-id="child.a"]').click();
    await expect(popover(page)).toHaveCount(0);
    const clicks = (await chromeEvents(page)).filter((e) => e.type === 'contextMenu');
    expect(clicks).toEqual([
      { type: 'contextMenu', id: 'child.b', target: { kind: 'cell', rowId: 'r2', field: 's1' }, source: 'keyboard' },
      { type: 'contextMenu', id: 'child.a', target: { kind: 'cell', rowId: 'r3', field: 's2' }, source: 'pointer' },
    ]);
    expect(problems).toEqual([]);
  });
});

test.describe('context menu targets', () => {
  test('right-click on the pager resolves the pager target; on a group caption the groupCaption target', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=500&cols=10&chrome&paging=50&group=b9`);
    await recordTargets(page);
    await page.locator('.salmon-data-grid-pager .salmon-data-grid-pager__info').click({ button: 'right' });
    await expect(contextMenu(page)).toBeVisible();
    expect(await contextMenu(page).locator('[data-item-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['itemId']))).toEqual(['firstPage', 'previousPage', 'nextPage', 'lastPage']);
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    const caption = page.locator('.salmon-data-grid-rows [role="row"][data-row-id^="__g"]').first();
    const captionId = await caption.getAttribute('data-row-id');
    await caption.click({ button: 'right' });
    await expect(contextMenu(page)).toBeVisible();
    // Row-only items (edit, delete, copy) do not apply to a caption.
    const captionItems = await contextMenu(page).locator('[data-item-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['itemId']));
    expect(captionItems).not.toContain('edit');
    expect(captionItems).not.toContain('delete');
    expect(captionItems).not.toContain('copy');
    expect(captionItems).toContain('exportCsv');
    await page.keyboard.press('Escape');
    // A data cell and a header for comparison.
    const dataRow = await page.locator('.salmon-data-grid-rows [role="row"]:not([data-row-id^="__g"])').first().getAttribute('data-row-id');
    await cell(page, dataRow!, 's1').click({ button: 'right' });
    await page.keyboard.press('Escape');
    await header(page, 's1').click({ button: 'right' });
    await page.keyboard.press('Escape');
    expect(await targets(page)).toEqual([
      { kind: 'pager' },
      { kind: 'groupCaption', rowId: captionId },
      { kind: 'cell', rowId: dataRow, field: 's1' },
      { kind: 'header', field: 's1' },
    ]);
    expect(problems).toEqual([]);
  });

  test('a pinned cell after horizontal scroll and a virtual row after vertical scroll resolve their targets', async ({ page }) => {
    const problems = collectProblems(page);
    // frozenCols=2 pins id and s0 to the start.
    await openGrid(page, `${CHROME}&frozenCols=2`);
    await recordTargets(page);
    await scrollViewport(page, null, 2500);
    const pinned = cell(page, 'r4', 's0');
    await expect(pinned).toHaveCount(1);
    expect(await pinned.evaluate((el) => !!el.closest('.salmon-data-grid-pin--left'))).toBe(true);
    await pinned.click({ button: 'right' });
    await expect(contextMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    // A center cell rendered under column virtualization at the same scroll position.
    const centerId = await page.evaluate(() => (document.querySelector('.salmon-data-grid-row[data-row-id="r4"] .salmon-data-grid-center .salmon-data-grid-cell') as HTMLElement).dataset['columnId'] as string);
    await cell(page, 'r4', centerId).click({ button: 'right' });
    await page.keyboard.press('Escape');
    // Far down: rows that were never rendered at mount.
    await scrollViewport(page, 36 * 1700, null);
    const range = await page.evaluate(() => window.__gridApi.getRenderedRange().rows as { start: number; end: number });
    expect(range.start).toBeGreaterThan(1000);
    const deep = `r${range.start + 5}`;
    await cell(page, deep, 's0').click({ button: 'right' });
    await expect(contextMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await cell(page, deep, centerId).click({ button: 'right' });
    await page.keyboard.press('Escape');
    expect(await targets(page)).toEqual([
      { kind: 'cell', rowId: 'r4', field: 's0' },
      { kind: 'cell', rowId: 'r4', field: centerId },
      { kind: 'cell', rowId: deep, field: 's0' },
      { kind: 'cell', rowId: deep, field: centerId },
    ]);
    // Focus followed the right-clicked virtual cell (focus returns there after Escape).
    expect(await page.evaluate(() => document.activeElement?.closest('[data-row-id]')?.getAttribute('data-row-id'))).toBe(deep);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

test.describe('toolbar items', () => {
  test('edit, cancel and delete toolbar items act on the focused / selected row', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=10&chrome&edit=row`);
    const item = (id: string) => page.locator(`[data-toolbar-item="${id}"]`);
    // no selected row and nothing editing -> edit, delete and cancel are disabled at rest.
    for (const id of ['edit', 'delete', 'cancel']) await expect(item(id)).toHaveAttribute('aria-disabled', 'true');
    await cell(page, 'r3', 's1').click();
    for (const id of ['edit', 'delete']) await expect(item(id)).not.toHaveAttribute('aria-disabled', 'true');
    await item('edit').click();
    await expect(item('cancel')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-row-id="r3"]').first()).toHaveAttribute('data-editing', '');
    await cell(page, 'r3', 's1').locator('input').fill('toolbar draft');
    await item('cancel').click();
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    expect(await rowValue(page, 'r3', 's1')).not.toBe('toolbar draft');
    // delete removes the selected row (the click above selected r3).
    await cell(page, 'r4', 's1').click();
    await item('delete').click();
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r4"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.getRowInfo('r4'))).toBeFalsy();
    expect(await page.evaluate(() => window.__gridApi.getRowInfo('r3'))).toBeTruthy();
    expect(await editEvents(page)).toEqual(['editStart', 'editCancel', 'delete']);
    expect((await chromeEvents(page)).filter((e) => e.type === 'toolbar').map((e) => `${e.id}:${e.source}`)).toEqual(['edit:pointer', 'cancel:pointer', 'delete:pointer']);
    expect(problems).toEqual([]);
  });

  test('exportExcel and exportPdf toolbar items download the files', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=100&cols=6&chrome&export`);
    for (const [id, file] of [
      ['exportExcel', 'export.xlsx'],
      ['exportPdf', 'export.pdf'],
    ] as const) {
      const download = page.waitForEvent('download');
      await page.locator(`[data-toolbar-item="${id}"]`).click();
      const saved = await download;
      expect(saved.suggestedFilename()).toBe(file);
      const bytes = Buffer.concat(await (await saved.createReadStream()).toArray());
      // XLSX is a zip ("PK"), PDF starts with "%PDF-".
      expect(bytes.subarray(0, id === 'exportExcel' ? 2 : 5).toString('latin1')).toBe(id === 'exportExcel' ? 'PK' : '%PDF-');
    }
    expect(problems).toEqual([]);
  });

  test('the print toolbar item runs window.print() with the print projection', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=120&cols=6&chrome&export`);
    await stubPrint(page);
    await page.locator('[data-toolbar-item="print"]').click();
    await expect.poll(async () => (await prints(page)).length).toBe(1);
    const [printed] = await prints(page);
    expect(printed?.rows).toBe(120);
    expect(printed?.headers).toEqual(['ID', 'Text 0', 'Text 1', 'Text 2', 'Text 3', 'Number 4', 'Number 5']);
    await expect(page.locator('.salmon-data-grid-print')).toHaveCount(0);
    const events = await page.evaluate(() => (window as unknown as { __outputEvents: { type: string; source?: string }[] }).__outputEvents);
    expect(events.map((e) => e.type)).toEqual(['beforePrint', 'afterPrint']);
    expect(events[0]?.source).toBe('pointer');
    expect((await chromeEvents(page)).filter((e) => e.type === 'toolbar')).toEqual([{ type: 'toolbar', id: 'print', source: 'pointer' }]);
    expect(problems).toEqual([]);
  });
});

test.describe('toolbar layout', () => {
  test('align start / center / end place the items at the start, center and end of the toolbar', async ({ page }) => {
    const problems = collectProblems(page);
    await page.setViewportSize({ width: 1200, height: 800 });
    await openGrid(page, `${DEV_URL}?rows=100&cols=6&search`);
    await setExtra(
      page,
      `{ toolbar: [
        { id: 's1', label: 'Start one', align: 'start' },
        { id: 's2', label: 'Start two', align: 'start' },
        { id: 'c1', label: 'Center', align: 'center' },
        { id: 'e1', label: 'End', align: 'end' },
      ] }`,
    );
    const toolbar = page.locator('.salmon-data-grid-toolbar');
    await expect(page.locator('[data-toolbar-item="e1"]')).toBeVisible();
    const box = async (id: string) => (await page.locator(`[data-toolbar-item="${id}"]`).boundingBox())!;
    const inner = await toolbar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { left: r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight) };
    });
    const [s1, s2, c1, e1] = [await box('s1'), await box('s2'), await box('c1'), await box('e1')];
    // Start items flush with the start edge, in order; the end item flush with the end edge.
    expect(Math.abs(s1.x - inner.left)).toBeLessThanOrEqual(1);
    expect(s2.x).toBeGreaterThan(s1.x + s1.width - 1);
    expect(Math.abs(e1.x + e1.width - inner.right)).toBeLessThanOrEqual(1);
    // The center item sits in the middle of the free space between the start and end groups.
    const before = c1.x - (s2.x + s2.width);
    const after = e1.x - (c1.x + c1.width);
    expect(before).toBeGreaterThan(100);
    expect(Math.abs(before - after)).toBeLessThanOrEqual(2);
    // Only a center item: centered in the toolbar.
    await setExtra(page, `{ toolbar: [{ id: 'c1', label: 'Center', align: 'center' }] }`);
    await nextFrames(page);
    const only = await box('c1');
    expect(Math.abs(only.x + only.width / 2 - (inner.left + inner.right) / 2)).toBeLessThanOrEqual(2);
    // Start then end with nothing between: the end item still goes to the end edge.
    await setExtra(page, `{ toolbar: [{ id: 's1', label: 'Start one' }, { id: 'e1', label: 'End', align: 'end' }] }`);
    await nextFrames(page);
    const [a, z] = [await box('s1'), await box('e1')];
    expect(Math.abs(a.x - inner.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(z.x + z.width - inner.right)).toBeLessThanOrEqual(1);
    // RTL mirrors: start is the right edge.
    await setExtra(page, `{ dir: 'rtl', toolbar: [{ id: 's1', label: 'Start one' }, { id: 'e1', label: 'End', align: 'end' }] }`);
    await nextFrames(page);
    const [ra, rz] = [await box('s1'), await box('e1')];
    expect(Math.abs(ra.x + ra.width - inner.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(rz.x - inner.left)).toBeLessThanOrEqual(1);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Stacked headers
// ---------------------------------------------------------------------------

test.describe('stacked headers', () => {
  test('sort, filter, resize and reorder work on leaf headers under groups; reorder stays inside the parent', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=30&stacked&qsort&qfilter=menu&chrome`);
    // Sort: click a leaf under Group 0 / Part 0A.
    await header(page, 's1').click();
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'ascending');
    const asc = (await viewValues(page, 's1')) as string[];
    expect([...asc].sort()).toEqual(asc);
    // Filter: the leaf's filter button opens its filter menu.
    await header(page, 'n5').locator('.salmon-data-grid-filter-button').click();
    const dialog = page.getByRole('dialog', { name: 'Filter Number 5' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Operator' }).selectOption('lessThan');
    await dialog.getByRole('spinbutton', { name: 'Value' }).fill('50000');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await viewValues(page, 'n5')).every((v) => Number(v) < 50000)).toBe(true);
    await expect(header(page, 'n5')).toHaveAttribute('data-filtered', '');
    // Resize: drag the leaf's resize handle; its group cells grow with it.
    const groupWidth = (id: string) => page.locator(`.salmon-data-grid-header-group[data-group-id="${id}"]`).first().evaluate((el) => el.getBoundingClientRect().width);
    const [leafBefore, partBefore, groupBefore] = [(await header(page, 's2').boundingBox())!.width, await groupWidth('g0a'), await groupWidth('g0')];
    const handle = (await header(page, 's2').locator('.salmon-data-grid-resize-handle').boundingBox())!;
    const hx = handle.x + handle.width / 2;
    const hy = handle.y + handle.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) await page.mouse.move(hx + (60 * i) / 5, hy);
    await page.mouse.up();
    await expect.poll(async () => (await header(page, 's2').boundingBox())!.width).toBeCloseTo(leafBefore + 60, 0);
    expect(await groupWidth('g0a')).toBeCloseTo(partBefore + 60, 0);
    expect(await groupWidth('g0')).toBeCloseTo(groupBefore + 60, 0);
    const resized = (await chromeEvents(page)).filter((e) => e.type === 'resizeEnd');
    expect(resized).toEqual([{ type: 'resizeEnd', field: 's2', width: leafBefore + 60 }]);
    // Reorder: drag s3 onto s0 inside Part 0A.
    const drag = async (from: string, to: string) => {
      const a = (await header(page, from).boundingBox())!;
      const b = (await header(page, to).boundingBox())!;
      const y = a.y + a.height / 2;
      await page.mouse.move(a.x + a.width / 2, y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + a.width / 2 + ((b.x + 5 - (a.x + a.width / 2)) * i) / 8, y);
      await page.mouse.up();
      await nextFrames(page);
    };
    expect((await headerOrder(page)).slice(0, 6)).toEqual(['id', 's0', 's1', 's2', 's3', 'n4']);
    await drag('s3', 's0');
    expect((await headerOrder(page)).slice(0, 6)).toEqual(['id', 's3', 's0', 's1', 's2', 'n4']);
    expect((await chromeEvents(page)).filter((e) => e.type === 'drop').at(-1)).toMatchObject({ field: 's3' });
    // Out of the parent: n4 (Part 0A) dropped onto n5 (Part 0B) is rejected; the order is unchanged.
    const order = await headerOrder(page);
    await drag('n4', 'n6');
    expect(await headerOrder(page)).toEqual(order);
    expect(problems).toEqual([]);
  });

  test('a group split by the frozen edge logs the split-group dev warning once per group', async ({ page }) => {
    const problems = collectProblems(page);
    // frozenCols=3 pins id, s0 and s1: Group 0 and Part 0A have leaves on both sides of the edge.
    await openGrid(page, `${DEV_URL}?rows=200&cols=30&stacked&frozenCols=3`);
    await nextFrames(page);
    const warnings = problems.filter((p) => p.includes('spans two freeze zones'));
    expect(warnings.length).toBe(2);
    expect(warnings.some((w) => /stacked header "g0" spans two freeze zones and is split at the frozen edge\. Freeze whole groups\./.test(w))).toBe(true);
    expect(warnings.some((w) => /stacked header "g0a" spans two freeze zones/.test(w))).toBe(true);
    expect(warnings.every((w) => w.startsWith('warning: [salmonui] DataGrid "'))).toBe(true);
    // Each part of the split group renders in its own zone.
    expect(await page.locator('.salmon-data-grid-header .salmon-data-grid-pin--left .salmon-data-grid-header-group[data-group-id="g0a"]').count()).toBe(1);
    expect(await page.locator('.salmon-data-grid-header .salmon-data-grid-center .salmon-data-grid-header-group[data-group-id="g0a"]').count()).toBe(1);
    // Scrolling re-renders without repeating the warning; nothing else is logged.
    await scrollViewport(page, 36 * 50, 600);
    await nextFrames(page);
    expect(problems.filter((p) => !p.includes('spans two freeze zones'))).toEqual([]);
    expect(problems.filter((p) => p.includes('spans two freeze zones')).length).toBe(2);
  });

  test('whole groups pinned do not warn', async ({ page }) => {
    const problems = collectProblems(page);
    // frozenCols=1 pins only the ungrouped id column.
    await openGrid(page, `${DEV_URL}?rows=200&cols=30&stacked&frozenCols=1`);
    await nextFrames(page);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Column spans
// ---------------------------------------------------------------------------

test.describe('column spans', () => {
  const DATA = `[
    { id: 'a', q1: 'x', q2: 'x', q3: 'x', q4: 'y' },
    { id: 'b', q1: 'x', q2: 'y', q3: 'y', q4: 'y' },
    { id: 'c', q1: 'x', q2: 'z', q3: 'w', q4: '' },
  ]`;
  const COLUMNS = (opt: string) => `[
    { field: 'id', header: 'ID', primaryKey: true, width: 80 },
    { field: 'q1', header: 'Q1', type: 'string', width: 90${opt} },
    { field: 'q2', header: 'Q2', type: 'string', width: 90${opt} },
    { field: 'q3', header: 'Q3', type: 'string', width: 90${opt} },
    { field: 'q4', header: 'Q4', type: 'string', width: 90 },
  ]`;
  const spans = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-row')].map((row) => [
        row.dataset['rowId'],
        [...row.querySelectorAll<HTMLElement>('.salmon-data-grid-cell')].map((c) => `${c.dataset['columnId']}${c.hasAttribute('aria-colspan') ? `*${c.getAttribute('aria-colspan')}` : ''}`).join(' '),
      ]),
    );
  const widthOf = (page: Page, rowId: string, columnId: string) => cell(page, rowId, columnId).evaluate((el) => el.getBoundingClientRect().width);
  const headerWidths = async (page: Page, ids: string[]) => {
    let w = 0;
    for (const id of ids) w += (await header(page, id).boundingBox())!.width;
    return w;
  };

  test('colSpan: true merges equal adjacent values of the columns that opt in', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=10&cols=4`);
    await setExtra(page, `{ data: ${DATA}, columns: ${COLUMNS(', colSpan: true')} }`);
    await expect(cell(page, 'a', 'q1')).toHaveAttribute('aria-colspan', '3');
    // q4 does not opt in: row b merges q2..q3 only, never into q4.
    expect(await spans(page)).toEqual([
      ['a', 'id q1*3 q4'],
      ['b', 'id q1 q2*2 q4'],
      ['c', 'id q1 q2 q3 q4'],
    ]);
    expect(Math.abs((await widthOf(page, 'a', 'q1')) - (await headerWidths(page, ['q1', 'q2', 'q3'])))).toBeLessThanOrEqual(1);
    expect(Math.abs((await widthOf(page, 'b', 'q2')) - (await headerWidths(page, ['q2', 'q3'])))).toBeLessThanOrEqual(1);
    await expect(cell(page, 'a', 'q1')).toHaveText('x');
    expect(problems).toEqual([]);
  });

  test('mergeCells: "columns" merges equal adjacent values across every column; empty values never merge', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=10&cols=4`);
    await setExtra(page, `{ data: ${DATA}, columns: ${COLUMNS('')}, mergeCells: 'columns' }`);
    await expect(cell(page, 'b', 'q2')).toHaveAttribute('aria-colspan', '3');
    expect(await spans(page)).toEqual([
      ['a', 'id q1*3 q4'],
      ['b', 'id q1 q2*3'],
      ['c', 'id q1 q2 q3 q4'],
    ]);
    expect(Math.abs((await widthOf(page, 'b', 'q2')) - (await headerWidths(page, ['q2', 'q3', 'q4'])))).toBeLessThanOrEqual(1);
    // No row merging under "columns": q1 is "x" in every row but each row keeps its own cell.
    expect(await page.locator('.salmon-data-grid-rows [aria-rowspan]').count()).toBe(0);
    // Turning it off restores every cell.
    await setExtra(page, `{ mergeCells: false }`);
    await expect(page.locator('.salmon-data-grid-rows [aria-colspan]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

test.describe('print columns and print media', () => {
  test('printable: false leaves the column out of print()', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=40&cols=6&export`);
    await stubPrint(page);
    await setExtra(
      page,
      `{ columns: [
        { field: 'id', header: 'ID', primaryKey: true, width: 90 },
        { field: 's0', header: 'Text 0', width: 120 },
        { field: 's1', header: 'Text 1', width: 120, printable: false },
        { field: 'n4', header: 'Number 4', type: 'number', width: 120 },
      ] }`,
    );
    await expect(header(page, 's1')).toHaveCount(1);
    expect(await page.evaluate(() => window.__gridApi.print())).toBe(true);
    await expect.poll(async () => (await prints(page)).length).toBe(1);
    expect((await prints(page))[0]).toEqual({ rows: 40, headers: ['ID', 'Text 0', 'Number 4'] });
    // The column stays on screen.
    await expect(header(page, 's1')).toHaveCount(1);
    expect(problems).toEqual([]);
  });

  test('print media hides the pager, the toolbar and the busy status', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=60000&cols=20&chrome&export&paging=50`);
    const display = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).display);
    expect(await display('.salmon-data-grid-pager')).not.toBe('none');
    expect(await display('.salmon-data-grid-toolbar')).not.toBe('none');
    // The busy status shows while a large export runs.
    const done = page.evaluate(() => (window.__gridApi as any).exportToExcel({ download: false }).then(() => true));
    await expect(page.locator('.salmon-data-grid-output-status')).toBeAttached();
    expect(await display('.salmon-data-grid-output-status')).not.toBe('none');
    await page.emulateMedia({ media: 'print' });
    expect(await display('.salmon-data-grid-output-status')).toBe('none');
    expect(await display('.salmon-data-grid-pager')).toBe('none');
    expect(await display('.salmon-data-grid-toolbar')).toBe('none');
    // The grid itself still prints from the browser menu.
    expect(await display('.salmon-data-grid')).not.toBe('none');
    await page.emulateMedia({ media: 'screen' });
    expect(await display('.salmon-data-grid-pager')).not.toBe('none');
    expect(await done).toBe(true);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Adaptive dialog event
// ---------------------------------------------------------------------------

test.describe('onBeforeAdaptiveDialogOpen', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('fires with kind and field for the sort and filter sheets; preventDefault keeps them closed', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=500&cols=10&adaptive=vertical&qsort&qfilter=excel`);
    await page.evaluate(() => {
      const w = window as unknown as { __adaptive: unknown[]; __prevent: boolean; __setExtra(x: unknown): void };
      w.__adaptive = [];
      w.__prevent = false;
      w.__setExtra({
        onBeforeAdaptiveDialogOpen: (e: { type: string; kind: string; field: string | undefined; source: string; preventDefault(): void }) => {
          w.__adaptive.push({ type: e.type, kind: e.kind, field: e.field ?? null, source: e.source });
          if (w.__prevent) e.preventDefault();
        },
      });
    });
    const adaptiveEvents = () => page.evaluate(() => (window as unknown as { __adaptive: unknown[] }).__adaptive);
    const prevent = (on: boolean) => page.evaluate((v) => ((window as unknown as { __prevent: boolean }).__prevent = v), on);
    // Allowed: the sort sheet opens from the adaptive bar.
    await page.locator('.salmon-data-grid-adaptive-bar__sort').click();
    await expect(page.getByRole('dialog', { name: 'Sort' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    // Prevented: neither the sort sheet, the filter column list nor a column's filter sheet opens.
    await prevent(true);
    await page.locator('.salmon-data-grid-adaptive-bar__sort').click();
    await page.locator('.salmon-data-grid-adaptive-bar__filter').click();
    await page.evaluate(() => window.__gridApi.openFilterDialog('n4'));
    await nextFrames(page);
    await expect(popover(page)).toHaveCount(0);
    // Allowed again: the column's filter sheet opens.
    await prevent(false);
    await page.evaluate(() => window.__gridApi.openFilterDialog('n4'));
    await expect(page.locator('[data-salmon-popover][data-sheet="dialog"].salmon-data-grid-filter-menu')).toBeVisible();
    expect(await adaptiveEvents()).toEqual([
      { type: 'beforeAdaptiveDialogOpen', kind: 'sort', field: null, source: 'pointer' },
      { type: 'beforeAdaptiveDialogOpen', kind: 'sort', field: null, source: 'pointer' },
      { type: 'beforeAdaptiveDialogOpen', kind: 'filter', field: null, source: 'pointer' },
      { type: 'beforeAdaptiveDialogOpen', kind: 'filter', field: 'n4', source: 'api' },
      { type: 'beforeAdaptiveDialogOpen', kind: 'filter', field: 'n4', source: 'api' },
    ]);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Lookup filtering
// ---------------------------------------------------------------------------

test.describe('lookup column filter UI', () => {
  const statuses = (page: Page) => page.evaluate(() => [...new Set((window.__gridApi.getViewRows() as { s2: number }[]).map((r) => r.s2))].sort());

  test('Excel checkbox facets list the display text and filter by it', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=400&cols=6&lookup&qfilter=excel`);
    await expect(cell(page, 'r1', 's2')).toHaveText('Closed');
    await header(page, 's2').locator('.salmon-data-grid-filter-button').click();
    const dialog = page.getByRole('dialog', { name: 'Filter Status' });
    await expect(dialog).toBeVisible();
    const labels = await dialog.locator('.salmon-data-grid-facet-list__label').allTextContents();
    // The facets are the display texts (sorted), never the stored keys.
    expect(labels).toEqual(expect.arrayContaining(['Closed', 'On hold', 'Open', 'Pending']));
    expect(labels.some((l) => /^[0-3]$/.test(l))).toBe(false);
    // Searching the checklist matches the display text.
    await dialog.getByRole('searchbox', { name: 'Search values' }).fill('pen');
    await expect(dialog.locator('.salmon-data-grid-facet-list__label')).toHaveText(['Open', 'Pending']);
    await dialog.getByRole('searchbox', { name: 'Search values' }).fill('');
    // Uncheck "Open" and "On hold": keys 0 and 3 leave the view.
    for (const label of ['Open', 'On hold']) await dialog.locator('.salmon-data-grid-facet-list__option', { has: page.locator('.salmon-data-grid-facet-list__label', { hasText: new RegExp(`^${label}$`) }) }).click();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => statuses(page)).toEqual([1, 2]);
    expect(await page.evaluate(() => window.__gridApi.getViewRows().length)).toBe(200);
    await expect(header(page, 's2')).toHaveAttribute('data-filtered', '');
    expect(problems).toEqual([]);
  });

  test('the filter menu matches the typed display text', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=400&cols=6&lookup&qfilter=menu`);
    await header(page, 's2').locator('.salmon-data-grid-filter-button').click();
    const dialog = page.getByRole('dialog', { name: 'Filter Status' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Operator' }).selectOption('startsWith');
    await dialog.getByRole('textbox', { name: 'Value' }).fill('o');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);
    // "Open" (0) and "On hold" (3) start with "o"; the keys themselves never match text.
    await expect.poll(() => statuses(page)).toEqual([0, 3]);
    await header(page, 's2').locator('.salmon-data-grid-filter-button').click();
    await dialog.getByRole('combobox', { name: 'Operator' }).selectOption('equal');
    await dialog.getByRole('textbox', { name: 'Value' }).fill('closed');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(() => statuses(page)).toEqual([1]);
    expect(problems).toEqual([]);
  });
});
