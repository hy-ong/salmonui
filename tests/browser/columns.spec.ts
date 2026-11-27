import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// Column definition behavior in the browser: resolved `%` and
// `'auto'` widths, rendered alignment (LTR and RTL), reactive and API column
// visibility, content autofit, column chooser search settings, the column
// menu built-in and custom items, overflow modes, text-wrap modes, editor
// presets, and the command column. Fixture flags: examples/vite-spa/src/main.tsx
// (`?colWidths`, `?wrap`, `?chrome`, `?filter`, `?filterUi`, `?edit`, `?ecommands`,
// `?gridDir`); everything else goes through `window.__setExtra(patch)`.

const SMALL = `${DEV_URL}?rows=200&cols=10`;

const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid-row[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const popover = (page: Page) => page.locator('[data-salmon-popover]');
const widthOf = (page: Page, id: string) => page.evaluate((columnId) => document.querySelector(`.salmon-data-grid-header-cell[data-column-id="${columnId}"]`)!.getBoundingClientRect().width, id);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Re-renders the grid with more props (main.tsx `window.__setExtra`). */
async function setExtra(page: Page, build: string): Promise<void> {
  // `build` is a function expression evaluated in the page, so props can carry callbacks.
  await page.evaluate((src) => {
    const w = window as unknown as { __setExtra(p: unknown): void; __log: unknown[] };
    w.__log ??= [];
    // eslint-disable-next-line no-new-func
    w.__setExtra(new Function('log', `return (${src})(log);`)(w.__log));
  }, build);
  await frames(page);
}
const log = (page: Page) => page.evaluate(() => (window as unknown as { __log?: unknown[] }).__log ?? []);

/** True when every rendered body cell of the column shows its whole text. */
const columnFits = (page: Page, id: string) =>
  page.evaluate((columnId) => {
    const cells = [...document.querySelectorAll<HTMLElement>(`.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="${columnId}"]`)];
    return cells.length > 0 && cells.every((c) => c.scrollWidth <= c.clientWidth);
  }, id);

/** Gaps between the text of `el` (text nodes only) and its content box, in px. */
const textGaps = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)!;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let left = Infinity;
    let right = -Infinity;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const start = box.left + parseFloat(cs.paddingLeft);
    const end = box.right - parseFloat(cs.paddingRight);
    return { left: left - start, right: end - right, textAlign: cs.textAlign, direction: cs.direction };
  }, selector);

const ALIGN_COLUMNS = `() => ({
  columns: [
    { field: 'id', header: 'ID', primaryKey: true, width: 90 },
    { field: 's0', header: 'Start', align: 'start', width: 220 },
    { field: 's1', header: 'End', align: 'end', headerAlign: 'end', width: 220 },
    { field: 's2', header: 'Center', align: 'center', headerAlign: 'center', width: 220 },
    { field: 's3', header: 'Justify', align: 'justify', headerAlign: 'start', width: 220 },
    { field: 'n4', header: 'Header center only', type: 'number', align: 'end', headerAlign: 'center', width: 220 },
  ],
})`;

test.describe('column widths', () => {
  test("'%' widths resolve against the viewport after mount and follow a resize; 'auto' content-fits once after mount", async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&colWidths`);
    await frames(page);
    const quarter = () => page.evaluate(() => (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).clientWidth * 0.25);
    expect(Math.abs((await widthOf(page, 's0')) - (await quarter()))).toBeLessThanOrEqual(1);
    // A narrower viewport re-resolves the percent width.
    await page.setViewportSize({ width: 900, height: 800 });
    await expect.poll(async () => Math.abs((await widthOf(page, 's0')) - (await quarter()))).toBeLessThanOrEqual(1);
    expect(await widthOf(page, 's0')).toBeLessThan(300);
    // 'auto': fitted to the header and rendered cells, not the 150 px default; every cell fits.
    const auto = await widthOf(page, 's1');
    expect(auto).not.toBe(150);
    expect(auto).toBeLessThan(160);
    expect(await columnFits(page, 's1')).toBe(true);
    // Not wider than the widest rendered cell text plus padding and header affordances.
    const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="s1"]')].map((c) => c.scrollWidth)));
    expect(auto).toBeLessThanOrEqual(widest + 64);
    expect(problems).toEqual([]);
  });

  test("a 'auto' column capped by maxWidth fits once after mount and clips with an ellipsis", async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&colWidths`);
    await frames(page);
    expect(await widthOf(page, 's2')).toBe(60);
    const c = cell(page, 'r0', 's2');
    await expect(c).not.toHaveAttribute('data-clip', /.*/);
    const info = await c.evaluate((el) => ({ overflow: getComputedStyle(el).textOverflow, clipped: el.scrollWidth > el.clientWidth }));
    expect(info).toEqual({ overflow: 'ellipsis', clipped: true });
    // Content fit happens once: scrolling new rows in does not re-measure.
    const before = await widthOf(page, 's1');
    await page.evaluate(() => window.__gridApi.scrollToRow('r150'));
    await frames(page);
    expect(await widthOf(page, 's1')).toBe(before);
    expect(problems).toEqual([]);
  });
});

test.describe('alignment', () => {
  test('cells and headers render start / end / center / justify, headerAlign overrides align', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    await setExtra(page, ALIGN_COLUMNS);
    const c = (id: string) => `.salmon-data-grid-row[data-row-id="r0"] .salmon-data-grid-cell[data-column-id="${id}"]`;
    const h = (id: string) => `.salmon-data-grid-header-cell[data-column-id="${id}"] .salmon-data-grid-header-cell__content`;
    const start = await textGaps(page, c('s0'));
    expect(start.textAlign).toBe('start');
    expect(start.left).toBeLessThan(2);
    expect(start.right).toBeGreaterThan(20);
    const end = await textGaps(page, c('s1'));
    expect(end.textAlign).toBe('end');
    expect(end.right).toBeLessThan(2);
    expect(end.left).toBeGreaterThan(20);
    const center = await textGaps(page, c('s2'));
    expect(center.textAlign).toBe('center');
    expect(Math.abs(center.left - center.right)).toBeLessThan(2);
    expect((await textGaps(page, c('s3'))).textAlign).toBe('justify');
    // Headers: headerAlign, else align.
    const hEnd = await textGaps(page, h('s1'));
    expect(hEnd.textAlign).toBe('end');
    expect(hEnd.right).toBeLessThan(2);
    const hCenter = await textGaps(page, h('s2'));
    expect(Math.abs(hCenter.left - hCenter.right)).toBeLessThan(2);
    const hStart = await textGaps(page, h('s3'));
    expect(hStart.left).toBeLessThan(2);
    // n4: cells end-aligned, header centered.
    expect((await textGaps(page, c('n4'))).right).toBeLessThan(2);
    const hn = await textGaps(page, h('n4'));
    expect(hn.textAlign).toBe('center');
    expect(Math.abs(hn.left - hn.right)).toBeLessThan(2);
    expect(problems).toEqual([]);
  });

  test('start and end mirror under RTL (gridDir=rtl)', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&gridDir=rtl`);
    await setExtra(page, ALIGN_COLUMNS);
    const c = (id: string) => `.salmon-data-grid-row[data-row-id="r0"] .salmon-data-grid-cell[data-column-id="${id}"]`;
    const h = (id: string) => `.salmon-data-grid-header-cell[data-column-id="${id}"] .salmon-data-grid-header-cell__content`;
    const start = await textGaps(page, c('s0'));
    expect(start.direction).toBe('rtl');
    // RTL start is the right edge.
    expect(start.right).toBeLessThan(2);
    expect(start.left).toBeGreaterThan(20);
    const end = await textGaps(page, c('s1'));
    expect(end.left).toBeLessThan(2);
    expect(end.right).toBeGreaterThan(20);
    const center = await textGaps(page, c('s2'));
    expect(Math.abs(center.left - center.right)).toBeLessThan(2);
    const hEnd = await textGaps(page, h('s1'));
    expect(hEnd.left).toBeLessThan(2);
    const hStart = await textGaps(page, h('s3'));
    expect(hStart.right).toBeLessThan(2);
    expect(problems).toEqual([]);
  });
});

test.describe('column visibility', () => {
  test('reactive column.hidden and api.hideColumns / showColumns hide and show header and cells; events fire', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    const columns = (hidden: boolean) => `(log) => ({
      columns: [
        { field: 'id', header: 'ID', primaryKey: true, width: 90 },
        { field: 's0', header: 'Text 0', width: 160 },
        { field: 's1', header: 'Text 1', width: 160, hidden: ${hidden} },
        { field: 's2', header: 'Text 2', width: 160 },
        { field: 'n4', header: 'Number 4', type: 'number', width: 140 },
      ],
      onBeforeColumnVisibilityChange: (e) => log.push({ type: e.type, hidden: [...e.hidden], shown: [...e.shown] }),
      onColumnVisibilityChange: (e) => log.push({ type: e.type, hidden: [...e.hidden], shown: [...e.shown] }),
    })`;
    await setExtra(page, columns(true));
    await expect(header(page, 's1')).toHaveCount(0);
    await expect(cell(page, 'r0', 's1')).toHaveCount(0);
    await expect(header(page, 's2')).toHaveCount(1);
    expect(await page.locator('[role="grid"]').getAttribute('aria-colcount')).toBe('4');
    // Toggling the definition back shows it.
    await setExtra(page, columns(false));
    await expect(header(page, 's1')).toHaveCount(1);
    await expect(cell(page, 'r0', 's1')).toHaveCount(1);
    expect(await page.locator('[role="grid"]').getAttribute('aria-colcount')).toBe('5');
    // API by field.
    await page.evaluate(() => (window as unknown as { __log: unknown[] }).__log.splice(0));
    await page.evaluate(() => window.__gridApi.hideColumns(['s2', 'n4']));
    await expect(header(page, 's2')).toHaveCount(0);
    await expect(header(page, 'n4')).toHaveCount(0);
    await expect(cell(page, 'r0', 'n4')).toHaveCount(0);
    await page.evaluate(() => window.__gridApi.showColumns('n4'));
    await expect(header(page, 'n4')).toHaveCount(1);
    await expect(cell(page, 'r0', 'n4')).toHaveCount(1);
    await expect(header(page, 's2')).toHaveCount(0);
    expect(await log(page)).toEqual([
      { type: 'beforeColumnVisibilityChange', hidden: ['s2', 'n4'], shown: [] },
      { type: 'columnVisibilityChange', hidden: ['s2', 'n4'], shown: [] },
      { type: 'beforeColumnVisibilityChange', hidden: [], shown: ['n4'] },
      { type: 'columnVisibilityChange', hidden: [], shown: ['n4'] },
    ]);
    expect(problems).toEqual([]);
  });
});

test.describe('autofit', () => {
  test('double-clicking the resize handle, api.autoSizeColumns() and Ctrl+Alt+Enter fit the width to the content', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    await setExtra(
      page,
      `() => ({
        columns: [
          { field: 'id', header: 'ID', primaryKey: true, width: 90 },
          { field: 's0', header: 'Text 0', width: 400 },
          { field: 's1', header: 'Text 1', width: 40 },
          { field: 's2', header: 'Text 2', width: 40 },
          { field: 's3', header: 'Text 3', width: 400 },
        ],
      })`,
    );
    expect(await columnFits(page, 's1')).toBe(false);
    // Double-click on the resize handle: a too-wide column shrinks to its content.
    const handle = header(page, 's0').locator('.salmon-data-grid-resize-handle');
    await handle.dblclick();
    await expect.poll(() => widthOf(page, 's0')).toBeLessThan(200);
    expect(await columnFits(page, 's0')).toBe(true);
    const fitted = await widthOf(page, 's0');
    // api.autoSizeColumns(field): a too-narrow column grows to the same content-derived width class.
    await page.evaluate(() => window.__gridApi.autoSizeColumns('s1'));
    await expect.poll(() => widthOf(page, 's1')).toBeGreaterThan(60);
    expect(await columnFits(page, 's1')).toBe(true);
    expect(Math.abs((await widthOf(page, 's1')) - fitted)).toBeLessThan(40);
    // Ctrl+Alt+Enter on a focused header.
    await page.evaluate(() => window.__gridApi.focusHeader('s2'));
    await page.keyboard.press('Control+Alt+Enter');
    await expect.poll(() => widthOf(page, 's2')).toBeGreaterThan(60);
    expect(await columnFits(page, 's2')).toBe(true);
    // api.autoSizeColumns() without fields fits every column.
    await page.evaluate(() => window.__gridApi.autoSizeColumns());
    await expect.poll(() => widthOf(page, 's3')).toBeLessThan(200);
    expect(await columnFits(page, 's3')).toBe(true);
    expect(problems).toEqual([]);
  });
});

test.describe('column chooser settings', () => {
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Choose columns' });
  const shown = (page: Page) => dialog(page).locator('.salmon-data-grid-column-chooser__item:not([hidden])').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['columnId']));

  test('searchable: false removes the search box; searchOperator changes matching', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    await setExtra(page, `() => ({ columnChooser: { searchable: false } })`);
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('searchbox')).toHaveCount(0);
    expect((await shown(page)).length).toBe(11);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    // Default operator: contains.
    await setExtra(page, `() => ({ columnChooser: {} })`);
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    await dialog(page).getByRole('searchbox', { name: 'Search columns' }).fill('ext');
    await expect.poll(() => shown(page)).toEqual(['s0', 's1', 's2', 's3']);
    await page.keyboard.press('Escape');
    // startsWith: "ext" matches nothing, "Text" every text column.
    await setExtra(page, `() => ({ columnChooser: { searchOperator: 'startsWith' } })`);
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    const search = dialog(page).getByRole('searchbox', { name: 'Search columns' });
    await search.fill('ext');
    await expect.poll(() => shown(page)).toEqual([]);
    await search.fill('Text');
    await expect.poll(() => shown(page)).toEqual(['s0', 's1', 's2', 's3']);
    await page.keyboard.press('Escape');
    // endsWith: "1" matches only "Text 1".
    await setExtra(page, `() => ({ columnChooser: { searchOperator: 'endsWith' } })`);
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    await dialog(page).getByRole('searchbox', { name: 'Search columns' }).fill('1');
    await expect.poll(() => shown(page)).toEqual(['s1']);
    await page.keyboard.press('Escape');
    expect(problems).toEqual([]);
  });

  test('a hideable: false column is not listed in the chooser', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    await setExtra(
      page,
      `() => ({
        columnChooser: true,
        columns: [
          { field: 'id', header: 'ID', primaryKey: true, width: 90, hideable: false },
          { field: 's0', header: 'Text 0', width: 160 },
          { field: 's1', header: 'Text 1', width: 160, hideable: false },
          { field: 's2', header: 'Text 2', width: 160 },
        ],
      })`,
    );
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    await expect(dialog(page)).toBeVisible();
    expect(await dialog(page).locator('.salmon-data-grid-column-chooser__item').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['columnId']))).toEqual(['s0', 's2']);
    // The grid still renders it.
    await expect(header(page, 's1')).toHaveCount(1);
    await page.keyboard.press('Escape');
    expect(problems).toEqual([]);
  });
});

test.describe('column menu items', () => {
  test('the filter item opens the filter menu; the columnChooser item opens the chooser', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&chrome&filter&filterUi=menu`);
    await page.evaluate(() => window.__gridApi.openColumnMenu('s1'));
    const menu = page.getByRole('menu', { name: 'Text 1 column menu' });
    await expect(menu).toBeVisible();
    await menu.locator('[data-item-id="filter"]').click();
    await expect(page.getByRole('menu', { name: 'Text 1 column menu' })).toHaveCount(0);
    const filterMenu = page.locator('.salmon-data-grid-filter-menu');
    await expect(filterMenu).toBeVisible();
    await expect(filterMenu).toHaveAttribute('role', 'dialog');
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    await page.evaluate(() => window.__gridApi.openColumnMenu('s2'));
    await page.getByRole('menu', { name: 'Text 2 column menu' }).locator('[data-item-id="columnChooser"]').click();
    const chooser = page.getByRole('dialog', { name: 'Choose columns' });
    await expect(chooser).toBeVisible();
    await expect(page.getByRole('menu', { name: 'Text 2 column menu' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(chooser).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('a custom item and a submenu item render and raise onColumnMenuItemClick with the item and column', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    await setExtra(
      page,
      `(log) => ({
        columnMenu: [
          'autoSize',
          { id: 'custom1', label: 'Custom one' },
          { id: 'more', label: 'More', items: [{ id: 'sub1', label: 'Sub one' }, { id: 'sub2', label: 'Sub two' }] },
        ],
        onColumnMenuItemClick: (e) => log.push({ id: e.item.id, label: e.item.label, field: e.field, column: e.column.field, header: e.column.header }),
      })`,
    );
    await page.evaluate(() => window.__gridApi.openColumnMenu('s1'));
    const menu = page.getByRole('menu', { name: 'Text 1 column menu' });
    await expect(menu).toBeVisible();
    expect(await menu.locator(':scope > [data-item-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['itemId']))).toEqual(['autoSize', 'custom1', 'more']);
    await expect(menu.locator('[data-item-id="custom1"]')).toHaveText('Custom one');
    await menu.locator('[data-item-id="custom1"]').click();
    await expect(popover(page)).toHaveCount(0);
    expect(await log(page)).toEqual([{ id: 'custom1', label: 'Custom one', field: 's1', column: 's1', header: 'Text 1' }]);
    // Submenu.
    await page.evaluate(() => window.__gridApi.openColumnMenu('s2'));
    const more = page.getByRole('menu', { name: 'Text 2 column menu' }).locator('[data-item-id="more"]');
    await expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    const sub = page.getByRole('menu', { name: 'More' });
    await expect(sub).toBeVisible();
    await sub.locator('[data-item-id="sub2"]').click();
    await expect(popover(page)).toHaveCount(0);
    expect((await log(page))[1]).toEqual({ id: 'sub2', label: 'Sub two', field: 's2', column: 's2', header: 'Text 2' });
    expect(problems).toEqual([]);
  });
});

test.describe('overflow', () => {
  test('clip vs ellipsis rendering, the ellipsisWithTooltip title on overflow, and the grid overflow default', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    const build = (gridOverflow: string) => `() => ({
      ${gridOverflow ? `overflow: '${gridOverflow}',` : ''}
      columns: [
        { field: 'id', header: 'ID', primaryKey: true, width: 90 },
        { field: 's0', header: 'Text 0', width: 50, overflow: 'clip' },
        { field: 's1', header: 'Text 1', width: 50, overflow: 'ellipsis' },
        { field: 's2', header: 'Text 2', width: 50, overflow: 'ellipsisWithTooltip' },
        { field: 's3', header: 'Text 3', width: 50 },
        { field: 'n4', header: 'N', type: 'number', width: 140, overflow: 'ellipsisWithTooltip' },
      ],
    })`;
    await setExtra(page, build(''));
    const textOverflow = (id: string) => cell(page, 'r0', id).evaluate((el) => getComputedStyle(el).textOverflow);
    expect(await textOverflow('s0')).toBe('clip');
    expect(await textOverflow('s1')).toBe('ellipsis');
    expect(await textOverflow('s2')).toBe('ellipsis');
    // Default (no column or grid overflow): ellipsis.
    expect(await textOverflow('s3')).toBe('ellipsis');
    // Header cells follow the column overflow too.
    expect(await header(page, 's0').locator('.salmon-data-grid-header-cell__content').evaluate((el) => getComputedStyle(el).textOverflow)).toBe('clip');
    // ellipsisWithTooltip: an overflowing cell gets its text as title on hover; a fitting one does not.
    const tipCell = cell(page, 'r0', 's2');
    expect(await tipCell.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(tipCell).not.toHaveAttribute('title', /.+/);
    await tipCell.hover();
    await expect(tipCell).toHaveAttribute('title', (await tipCell.textContent()) ?? '');
    const fitting = cell(page, 'r0', 'n4');
    await fitting.hover();
    await expect(fitting).not.toHaveAttribute('title', /.+/);
    // ellipsis (no tooltip) never gets a title.
    await cell(page, 'r0', 's1').hover();
    await expect(cell(page, 'r0', 's1')).not.toHaveAttribute('title', /.+/);
    // DataGrid-level overflow applies to columns without their own.
    await setExtra(page, build('clip'));
    expect(await textOverflow('s3')).toBe('clip');
    expect(await textOverflow('s1')).toBe('ellipsis');
    await setExtra(page, build('ellipsisWithTooltip'));
    await expect(cell(page, 'r0', 's3')).toHaveAttribute('data-clip', 'tooltip');
    await cell(page, 'r1', 's3').hover();
    await expect(cell(page, 'r1', 's3')).toHaveAttribute('title', (await cell(page, 'r1', 's3').textContent()) ?? '');
    expect(problems).toEqual([]);
  });
});

test.describe('text wrap modes', () => {
  const lines = (page: Page, selector: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector<HTMLElement>(sel)!;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const tops = new Set<number>();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
      }
      return { lines: tops.size, whiteSpace: getComputedStyle(el).whiteSpace };
    }, selector);
  const headerContent = (id: string) => `.salmon-data-grid-header-cell[data-column-id="${id}"] .salmon-data-grid-header-cell__content`;
  const bodyCell = (row: string, id: string) => `.salmon-data-grid-row[data-row-id="${row}"] .salmon-data-grid-cell[data-column-id="${id}"]`;

  test("'header' wraps header text while cells stay on one line", async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    await setExtra(
      page,
      `() => ({
        textWrap: 'header',
        columns: [
          { field: 'id', header: 'ID', primaryKey: true, width: 90 },
          { field: 's1', header: 'A long header text that has to wrap', width: 110 },
          { field: 's2', header: 'Text 2', width: 60 },
        ],
      })`,
    );
    await expect(page.locator('.salmon-data-grid')).toHaveAttribute('data-text-wrap', 'header');
    const h = await lines(page, headerContent('s1'));
    expect(h.whiteSpace).toBe('normal');
    expect(h.lines).toBeGreaterThan(1);
    const c = await lines(page, bodyCell('r0', 's2'));
    expect(c.whiteSpace).toBe('nowrap');
    expect(c.lines).toBe(1);
    expect(await page.locator(bodyCell('r0', 's2')).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(problems).toEqual([]);
  });

  test("'content' wraps cells while the header stays on one line", async ({ page }) => {
    const problems = collectProblems(page);
    // ?wrap mounts textWrap 'content' with measured rows; s1 of every 7th row is long, s1 is 120 px.
    await openGrid(page, `${SMALL}&wrap`);
    await setExtra(
      page,
      `() => ({
        textWrap: 'content',
        columns: [
          { field: 'id', header: 'ID', primaryKey: true, width: 90 },
          { field: 's1', header: 'A long header text that does not wrap', width: 120 },
        ],
      })`,
    );
    await expect(page.locator('.salmon-data-grid')).toHaveAttribute('data-text-wrap', 'content');
    const c = await lines(page, bodyCell('r0', 's1'));
    expect(c.whiteSpace).toBe('normal');
    expect(c.lines).toBeGreaterThan(1);
    // The wrapped row is taller than a one-line row.
    const heights = await page.evaluate(() => ['r0', 'r1'].map((id) => document.querySelector(`.salmon-data-grid-row[data-row-id="${id}"]`)!.getBoundingClientRect().height));
    expect(heights[0]).toBeGreaterThan(heights[1]! + 5);
    const h = await lines(page, headerContent('s1'));
    expect(h.whiteSpace).toBe('nowrap');
    expect(h.lines).toBe(1);
    expect(problems).toEqual([]);
  });
});

test.describe('command column', () => {
  test('the built-in Delete command deletes the row; onCommandClick preventDefault() cancels it', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row&ecommands`);
    const commands = (row: string) => cell(page, row, 'commands');
    await commands('r1').locator('[data-command="delete"]').click();
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r1"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.getRowInfo('r1'))).toBeFalsy();
    expect(await page.evaluate(() => (window as unknown as { __editEvents: { type: string }[] }).__editEvents.map((e) => e.type))).toContain('delete');
    await setExtra(
      page,
      `(log) => ({
        onCommandClick: (e) => {
          log.push({ type: e.type, command: e.command.type, rowId: e.rowId, rowField: e.row && e.row.id });
          if (e.command.type === 'delete' || e.command.type === 'edit') e.preventDefault();
        },
      })`,
    );
    await commands('r2').locator('[data-command="delete"]').click();
    await commands('r2').locator('[data-command="edit"]').click();
    await frames(page);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r2"]')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r2"]')).not.toHaveAttribute('data-editing', '');
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    expect(await log(page)).toEqual([
      { type: 'commandClick', command: 'delete', rowId: 'r2', rowField: 'r2' },
      { type: 'commandClick', command: 'edit', rowId: 'r2', rowField: 'r2' },
    ]);
    expect(problems).toEqual([]);
  });
});

test.describe('editor presets', () => {
  test("'datetime' renders the date-time picker; an explicit editor overrides the type default; editorProps reach the input", async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row`);
    await setExtra(
      page,
      `() => ({
        columns: [
          { field: 'id', header: 'ID', primaryKey: true, width: 90 },
          { field: 's0', header: 'Text 0', width: 160, editorProps: { maxLength: 5, className: 'probe-text' } },
          { field: 'n4', header: 'Number 4', type: 'number', width: 140, editorProps: { className: 'probe-num', style: { color: 'rgb(1, 2, 3)' } } },
          { field: 'd7', header: 'Date 7', type: 'date', width: 150 },
          { field: 'd8', header: 'Date 8', type: 'date', editor: 'datetime', width: 220, editorProps: { min: '2025-01-01T00:00' } },
          { field: 's1', header: 'Text 1', width: 160, editor: 'select', editorProps: { options: ['a', 'b'], placeholder: 'none' } },
          { field: 's2', header: 'Text 2', width: 160, editor: 'number' },
        ],
      })`,
    );
    await cell(page, 'r1', 's0').click();
    await page.keyboard.press('F2');
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r1"]').first()).toHaveAttribute('data-editing', '');
    // Type default: date -> the date-only picker.
    await expect(cell(page, 'r1', 'd7').locator('.salmon-data-grid-date input')).toHaveAttribute('placeholder', 'mm/dd/yyyy');
    // Explicit presets override the type default.
    const dt = cell(page, 'r1', 'd8').locator('.salmon-data-grid-date input');
    await expect(dt).toHaveAttribute('placeholder', 'mm/dd/yyyy hh:mm');
    expect(await dt.inputValue()).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    const select = cell(page, 'r1', 's1').locator('select');
    await expect(select).toHaveCount(1);
    expect(await select.locator('option').allTextContents()).toEqual(['none', 'a', 'b']);
    await expect(cell(page, 'r1', 's2').locator('input[inputmode="decimal"]')).toHaveCount(1);
    // editorProps reach the native input.
    const text = cell(page, 'r1', 's0').locator('input');
    await expect(text).toHaveAttribute('maxlength', '5');
    await expect(text).toHaveClass(/probe-text/);
    const num = cell(page, 'r1', 'n4').locator('input');
    await expect(num).toHaveClass(/probe-num/);
    await expect(num).toHaveCSS('color', 'rgb(1, 2, 3)');
    await page.keyboard.press('Escape');
    expect(problems).toEqual([]);
  });
});
