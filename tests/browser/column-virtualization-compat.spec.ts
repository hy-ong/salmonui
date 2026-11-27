import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// Column virtualization compatibility (docs/site/content/virtualization.md,
// "Column virtualization compatibility"). Data grids commonly document column virtualization as
// incompatible with row templates, detail templates, hierarchy, autofill, batch editing,
// stacked headers, grouping and column spanning; Salmon UI lifts every one of them. The
// column features (resize, reorder, autofit, Autofit All, print, clipboard, grouping from
// the column menu) work on columns that were never rendered.
//
// Every test runs on a wide grid (examples/vite-spa: 100 data columns, about 14,000 px wide
// in a 1,280 px viewport) and first asserts that the column it acts on is outside the
// rendered column window. Stacked headers, grouping and column spans under column
// virtualization are covered by tests/browser/chrome.spec.ts and tests/browser/grouping.spec.ts.

const LAYOUT = `${DEV_URL}layout-gaps.html`;

type ChromeEvent = { type: string; [k: string]: unknown };

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid-rows [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const value = (page: Page, rowId: string, field: string) => page.evaluate(([r, f]) => (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.[f], [rowId, field] as const);
const chromeEvents = (page: Page) => page.evaluate(() => (window as unknown as { __chromeEvents: ChromeEvent[] }).__chromeEvents);
/** Whether any cell or header of the column is in the DOM. */
const rendered = (page: Page, columnId: string) => page.evaluate((id) => document.querySelector(`.salmon-data-grid [data-column-id="${id}"]`) !== null, columnId);
/** Runtime width of a column (resize, autofit), else its definition width. */
const widthOf = (page: Page, columnId: string) =>
  page.evaluate((id) => {
    const api = window.__gridApi;
    const widths = (api.engine.getModuleState('columns') as { widths: Record<string, number> }).widths;
    return widths[id] ?? (api.getVisibleColumns().find((c: { columnId: string }) => c.columnId === id)?.def.width as number);
  }, columnId);
const visibleOrder = (page: Page) => page.evaluate(() => window.__gridApi.getVisibleColumns().map((c: { columnId: string }) => c.columnId) as string[]);
const columnRange = (page: Page) => page.evaluate(() => window.__gridApi.getRenderedRange().columns as { start: number; end: number });

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
}

/** The grid virtualizes columns: the rendered window holds a small slice of the center columns. */
async function expectColumnWindow(page: Page, total: number): Promise<void> {
  const range = await columnRange(page);
  expect(range.end - range.start).toBeLessThan(total / 3);
}

async function scrollToColumn(page: Page, columnId: string): Promise<void> {
  await page.evaluate((id) => window.__gridApi.scrollToColumn(id), columnId);
  await frames(page);
  await expect(header(page, columnId)).toHaveCount(1);
}

test.describe('column virtualization lifts the usual incompatibilities', () => {
  test('row template: renderRow rows keep the template and render the far columns while the column window moves', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=100&rowTemplate`);
    await expectColumnWindow(page, 100);
    expect(await rendered(page, 'b99')).toBe(false);
    const read = () =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > [role="row"]')];
        return {
          range: window.__gridApi.getRenderedRange().columns as { start: number; end: number },
          template: rows.length > 0 && rows.every((r) => r.classList.contains('app-template-row') && r.hasAttribute('data-template')),
          columns: [...new Set([...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-cell')].map((c) => c.dataset['columnId']))],
          perRow: Math.max(...rows.map((r) => r.querySelectorAll('[role="gridcell"]').length)),
        };
      });
    const near = await read();
    expect(near.template).toBe(true);
    expect(near.columns).toContain('s0');
    await scrollViewport(page, 36 * 500, 100_000);
    const far = await read();
    expect(far.template).toBe(true);
    // The template rows hold the far columns now; the first ones left the DOM.
    expect(far.columns).toContain('b99');
    expect(far.columns).not.toContain('s0');
    // The pinned id column plus the column window and its overscan: never the 101 columns.
    expect(far.perRow).toBeLessThanOrEqual(far.range.end - far.range.start + 2 * 2 + 1);
    await expect(cell(page, 'r500', 'b99')).toHaveCount(1);
    expect(await page.evaluate(() => document.querySelector('.salmon-data-grid-rows [data-row-id="r500"]')?.classList.contains('app-template-row'))).toBe(true);
    expect(problems).toEqual([]);
  });

  test('detail template: the detail row spans every column and stays in view while the column window moves', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${LAYOUT}?rows=1000&cols=60&detail`);
    await expectColumnWindow(page, 60);
    expect(await page.evaluate(() => window.__gridApi.expandDetail('r1').status)).toBe('applied');
    const detail = page.locator('.salmon-data-grid-row[data-row-id="__detail:r1"]');
    await expect(detail.locator('.detail-content')).toHaveText('Detail of r1');
    const measure = () =>
      page.evaluate(() => {
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const cellEl = document.querySelector('.salmon-data-grid-row[data-row-id="__detail:r1"] .salmon-data-grid-detail-row__cell') as HTMLElement;
        const content = document.querySelector('.salmon-data-grid-row[data-row-id="__detail:r1"] .salmon-data-grid-detail') as HTMLElement;
        const v = vp.getBoundingClientRect();
        const c = content.getBoundingClientRect();
        return {
          scrollLeft: vp.scrollLeft,
          vp: { left: v.left + vp.clientLeft, width: vp.clientWidth, scrollWidth: vp.scrollWidth },
          colspan: Number(cellEl.getAttribute('aria-colspan')),
          cellWidth: cellEl.getBoundingClientRect().width,
          content: { left: c.left, width: c.width },
          columnCount: Number((document.querySelector('[role="grid"]') as HTMLElement).getAttribute('aria-colcount')),
          parentColumns: [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-cell')].map((el) => el.dataset['columnId']),
        };
      });
    const a = await measure();
    expect(a.colspan).toBe(a.columnCount);
    expect(a.cellWidth).toBeGreaterThanOrEqual(a.vp.scrollWidth - 1);
    expect(Math.abs(a.content.left - a.vp.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.content.width - a.vp.width)).toBeLessThanOrEqual(1);
    for (const left of [4000, 100_000]) {
      await scrollViewport(page, null, left);
      const b = await measure();
      expect(b.scrollLeft).toBeGreaterThan(3000);
      // The parent row renders another column window; the detail content does not move.
      expect(b.parentColumns).not.toContain('s1');
      expect(Math.abs(b.content.left - a.content.left)).toBeLessThanOrEqual(1);
      expect(b.content.width).toBe(a.content.width);
      expect(b.colspan).toBe(a.colspan);
    }
    expect((await measure()).parentColumns).toContain('b59');
    await expect(detail.locator('.detail-content')).toHaveText('Detail of r1');
    expect(problems).toEqual([]);
  });

  test('hierarchy: a child grid stays mounted and in view while the parent column window moves', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${LAYOUT}?rows=1000&cols=60&child`);
    await expectColumnWindow(page, 60);
    expect(await page.evaluate(() => window.__gridApi.expandDetail('r1').status)).toBe('applied');
    const child = page.locator('.salmon-data-grid-row[data-row-id="__detail:r1"] .salmon-data-grid-child [role="grid"]');
    await expect(child.locator('.salmon-data-grid-rows > [data-row-id]')).toHaveCount(3);
    const childId = await child.getAttribute('id');
    const measure = () =>
      page.evaluate(() => {
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const grid = document.querySelector('.salmon-data-grid-row[data-row-id="__detail:r1"] .salmon-data-grid-child [role="grid"]') as HTMLElement;
        const v = vp.getBoundingClientRect();
        return { vp: { left: v.left + vp.clientLeft, right: v.left + vp.clientLeft + vp.clientWidth }, grid: grid.getBoundingClientRect().toJSON() as DOMRect };
      });
    const a = await measure();
    expect(a.grid.left).toBeGreaterThanOrEqual(a.vp.left - 1);
    expect(a.grid.right).toBeLessThanOrEqual(a.vp.right + 1);
    // Mark the child grid element: it must not remount while the parent columns scroll.
    await page.evaluate(() => ((document.querySelector('.salmon-data-grid-child [role="grid"]') as HTMLElement & { __mark?: number }).__mark = 1));
    for (const left of [3000, 100_000]) {
      await scrollViewport(page, null, left);
      const b = await measure();
      expect(Math.abs(b.grid.left - a.grid.left)).toBeLessThanOrEqual(1);
      expect(b.grid.width).toBe(a.grid.width);
    }
    expect(await rendered(page, 'b59')).toBe(true);
    expect(await page.evaluate(() => (document.querySelector('.salmon-data-grid-child [role="grid"]') as HTMLElement & { __mark?: number }).__mark)).toBe(1);
    expect(await child.getAttribute('id')).toBe(childId);
    await expect(child.locator('[data-row-id="o1"] [data-column-id="total"]')).toHaveText('101');
    expect(problems).toEqual([]);
  });

  test('autofill: fillSelection tiles a range across columns that are not rendered', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=100&sel=cell&cellMode=box&edit=cell&efill`);
    await expectColumnWindow(page, 100);
    for (const id of ['s10', 'b19', 's90', 'b99']) expect(await rendered(page, id)).toBe(false);
    // Source: rows r0..r1 over one full type cycle (s10..b19), so every tile lands on a column of the same type.
    const source: Record<string, unknown> = {};
    for (const r of ['r0', 'r1']) for (const f of ['s10', 'n15', 'd17', 'b19']) source[`${r}:${f}`] = await value(page, r, f);
    await page.evaluate(() => window.__gridApi.selectCellRange({ rowId: 'r0', field: 's10' }, { rowId: 'r1', field: 'b19' }));
    expect((await page.evaluate(() => window.__gridApi.fillSelection('r1', 'b99'))).status).toBe('applied');
    expect(await rendered(page, 'b99')).toBe(false);
    for (const r of ['r0', 'r1']) {
      for (const [far, src] of [['s90', 's10'], ['n55', 'n15'], ['n95', 'n15'], ['d47', 'd17'], ['b99', 'b19'], ['s30', 's10']] as const) {
        expect(await value(page, r, far)).toEqual(source[`${r}:${src}`]);
      }
    }
    // The selection grows to the filled block.
    const range = await page.evaluate(() => window.__gridApi.getSelection().cellRanges[0]);
    expect(range).toMatchObject({ anchor: { rowId: 'r0', columnId: 's10' }, focus: { rowId: 'r1', columnId: 'b99' } });
    // The filled cells paint once their columns render.
    await scrollToColumn(page, 's90');
    await expect(cell(page, 'r0', 's90')).toHaveText(String(source['r0:s10']));
    expect(problems).toEqual([]);
  });

  test('autofill: dragging the fill handle past the right edge auto-scrolls and fills columns outside the rendered window', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=100&sel=cell&cellMode=box&edit=cell&efill`);
    await page.evaluate(() => window.__gridApi.selectCellRange({ rowId: 'r0', field: 's0' }, { rowId: 'r0', field: 'b9' }));
    await scrollToColumn(page, 'b9');
    const pattern = new Map<string, unknown>();
    for (const f of ['s0', 'n4', 'd7', 'b9']) pattern.set(f, await value(page, 'r0', f));
    const handle = page.locator('.salmon-data-grid .salmon-data-grid-fill-handle');
    await expect(handle).toHaveCount(1);
    const h = (await handle.boundingBox())!;
    const viewport = (await page.locator('.salmon-data-grid-viewport').boundingBox())!;
    const y = h.y + h.height / 2;
    await page.mouse.move(h.x + h.width / 2, y);
    await page.mouse.down();
    // Hold the pointer past the right edge: auto-scroll moves the column window right.
    await page.mouse.move(viewport.x + viewport.width - 30, y, { steps: 4 });
    await page.mouse.move(viewport.x + viewport.width + 30, y, { steps: 2 });
    await page.waitForFunction(() => (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollLeft > 5000);
    await page.mouse.move(viewport.x + viewport.width - 200, y, { steps: 2 });
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-fill-preview')).toHaveAttribute('data-visible', '');
    await page.mouse.up();
    const focus = await page.evaluate(() => window.__gridApi.getSelection().cellRanges[0]?.focus?.columnId as string);
    const order = await visibleOrder(page);
    const last = order.indexOf(focus);
    expect(last).toBeGreaterThan(40);
    // The source columns left the DOM; the filled columns repeat the source by type cycle.
    expect(await rendered(page, 's0')).toBe(false);
    for (let i = 11; i <= last; i++) {
      const field = order[i] as string;
      const src = ['s0', 'n4', 'd7', 'b9'].find((f) => f[0] === field[0] && Number(f.slice(1)) % 10 === Number(field.slice(1)) % 10);
      if (src) expect(await value(page, 'r0', field)).toEqual(pattern.get(src));
    }
    expect(problems).toEqual([]);
  });

  test('batch edit: a draft in a column outside the initial window survives the column leaving the DOM and saves', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=100&edit=batch`);
    await expectColumnWindow(page, 100);
    expect(await rendered(page, 's90')).toBe(false);
    await page.evaluate(() => window.__gridApi.focusCell('r1', 's90'));
    await expect(cell(page, 'r1', 's90')).toBeFocused();
    await page.keyboard.press('F2');
    const input = cell(page, 'r1', 's90').locator('input');
    await expect(input).toBeFocused();
    await input.fill('far draft');
    await page.keyboard.press('Tab');
    // Tab moves the editor right, into the next column; its editor opens there.
    await expect(cell(page, 'r1', 's91').locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    // Scroll back to the start: the edited column leaves the DOM, the draft stays in the engine.
    await scrollViewport(page, null, 0);
    expect(await rendered(page, 's90')).toBe(false);
    expect(await page.evaluate(() => window.__gridApi.getPendingChanges().changedRecords.length)).toBe(1);
    await scrollToColumn(page, 's90');
    await expect(cell(page, 'r1', 's90')).toHaveText('far draft');
    await expect(cell(page, 'r1', 's90')).toHaveAttribute('data-dirty', '');
    await scrollViewport(page, null, 0);
    expect((await page.evaluate(() => window.__gridApi.save())).status).toBe('applied');
    await page.evaluate(() => window.__gridApi.whenEditSettled());
    expect(await value(page, 'r1', 's90')).toBe('far draft');
    expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(false);
    expect(problems).toEqual([]);
  });
});

test.describe('column features act on columns outside the rendered window', () => {
  const CHROME = `${DEV_URL}?rows=2000&cols=100&chrome&group=`;

  test('resize: a never-rendered column takes an API width, the scroll width follows, and a pointer resize there commits', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await expectColumnWindow(page, 100);
    expect(await rendered(page, 'n95')).toBe(false);
    const scrollWidth = () => page.evaluate(() => (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollWidth);
    const before = await scrollWidth();
    expect(await widthOf(page, 'n95')).toBe(140);
    expect((await page.evaluate(() => window.__gridApi.setColumnWidth('n95', 320))).status).toBe('applied');
    await frames(page);
    expect(await widthOf(page, 'n95')).toBe(320);
    expect(await scrollWidth()).toBe(before + 180);
    expect(await rendered(page, 'n95')).toBe(false);
    // Rendered at its new width once it scrolls in.
    await scrollToColumn(page, 'n95');
    expect(Math.round((await box(page, '.salmon-data-grid-header-cell[data-column-id="n95"]')).width)).toBe(320);
    expect(Math.round((await cell(page, 'r0', 'n95').boundingBox())!.width)).toBe(320);
    // Pointer resize on the far column.
    const handle = (await header(page, 'n95').locator('.salmon-data-grid-resize-handle').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2, { steps: 3 });
    await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => widthOf(page, 'n95')).toBe(380);
    expect(await chromeEvents(page)).toContainEqual({ type: 'resizeEnd', field: 'n95', width: 380 });
    // The width survives the column leaving and re-entering the DOM.
    await scrollViewport(page, null, 0);
    expect(await rendered(page, 'n95')).toBe(false);
    await scrollToColumn(page, 'n95');
    expect(Math.round((await box(page, '.salmon-data-grid-header-cell[data-column-id="n95"]')).width)).toBe(380);
    expect(problems).toEqual([]);
  });

  test('reorder: moveColumn, Alt+Arrow and a header drag move columns from outside the initial window', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await expectColumnWindow(page, 100);
    expect(await rendered(page, 'b99')).toBe(false);
    // API: a never-rendered column moves to the front of the center zone and renders there.
    expect((await page.evaluate(() => window.__gridApi.moveColumn('b99', 1))).status).toBe('applied');
    expect((await visibleOrder(page)).slice(0, 3)).toEqual(['id', 'b99', 's0']);
    await frames(page);
    expect(await rendered(page, 'b99')).toBe(true);
    // Keyboard: Alt+ArrowRight on a far header (focusHeader scrolls it into view).
    await page.evaluate(() => window.__gridApi.focusHeader('s90'));
    await expect(header(page, 's90')).toBeFocused();
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(async () => {
      const order = await visibleOrder(page);
      return order.slice(order.indexOf('s91'), order.indexOf('s91') + 2);
    }).toEqual(['s91', 's90']);
    expect(await page.evaluate(() => (document.activeElement?.closest('[data-column-id]') as HTMLElement | null)?.dataset['columnId'])).toBe('s90');
    // Pointer: drag a far header onto another far header.
    await scrollToColumn(page, 'n96');
    const target = await box(page, '.salmon-data-grid-header-cell[data-column-id="n96"]');
    const from = await box(page, '.salmon-data-grid-header-cell[data-column-id="s93"]');
    const start = { x: from.x + from.width * 0.4, y: from.y + from.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 10, start.y, { steps: 2 });
    await page.mouse.move(target.x + target.width * 0.8, target.y + target.height / 2, { steps: 12 });
    await frames(page);
    await page.mouse.up();
    await expect.poll(async () => {
      const order = await visibleOrder(page);
      return order.slice(order.indexOf('n94'), order.indexOf('n94') + 4);
    }).toEqual(['n94', 'n95', 'n96', 's93']);
    expect(await chromeEvents(page)).toContainEqual(expect.objectContaining({ type: 'drop', field: 's93' }));
    expect(problems).toEqual([]);
  });

  test('autofit: one never-rendered column and Autofit All fit columns outside the window to their content', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await expectColumnWindow(page, 100);
    expect(await rendered(page, 's90')).toBe(false);
    expect(await widthOf(page, 's90')).toBe(160);
    await page.evaluate(() => window.__gridApi.autoSizeColumns('s90'));
    const fitted = await widthOf(page, 's90');
    expect(fitted).not.toBe(160);
    expect(await rendered(page, 's90')).toBe(false);
    // Measured while unrendered = measured while rendered: autofit reads values, not the DOM.
    await scrollToColumn(page, 's90');
    const cells = page.locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="s90"]');
    expect(await cells.count()).toBeGreaterThan(5);
    const overflowing = (id: string) =>
      page.evaluate((c) => [...document.querySelectorAll<HTMLElement>(`.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="${c}"], .salmon-data-grid-header-cell[data-column-id="${c}"] .salmon-data-grid-header-cell__text`)].filter((el) => el.scrollWidth > el.clientWidth + 1).length, id);
    expect(await overflowing('s90')).toBe(0);
    await page.evaluate(() => window.__gridApi.autoSizeColumns('s90'));
    expect(Math.abs((await widthOf(page, 's90')) - fitted)).toBeLessThanOrEqual(1);

    // Autofit All from the column menu of a near column: every column, rendered or not.
    await scrollViewport(page, null, 0);
    for (const id of ['n95', 'd98', 'b99']) expect(await rendered(page, id)).toBe(false);
    const definition = { n95: 140, d98: 150, b99: 110 } as Record<string, number>;
    await header(page, 's1').hover();
    await header(page, 's1').locator('.salmon-data-grid-column-menu-button').click();
    await page.getByRole('menu', { name: 'Text 1 column menu' }).locator('[data-item-id="autoSizeAll"]').click();
    await expect.poll(() => page.evaluate(() => Object.keys((window.__gridApi.engine.getModuleState('columns') as { widths: Record<string, number> }).widths).length)).toBeGreaterThanOrEqual(100);
    const all: Record<string, number> = {};
    for (const id of Object.keys(definition)) {
      all[id] = await widthOf(page, id);
      expect(all[id]).toBeGreaterThan(30);
      expect(all[id]).toBeLessThan(400);
    }
    // The widths are the content widths, not the definitions: a fit of the rendered column measures the same
    // width (the content width depends on the platform font, so it can equal a definition width by chance).
    for (const id of Object.keys(definition)) {
      await scrollToColumn(page, id);
      expect(await overflowing(id)).toBe(0);
      expect(Math.round((await box(page, `.salmon-data-grid-header-cell[data-column-id="${id}"]`)).width)).toBe(all[id]);
      await page.evaluate((c) => window.__gridApi.autoSizeColumns(c), id);
      const refit = await widthOf(page, id);
      expect(Math.abs(refit - all[id]), id).toBeLessThanOrEqual(1);
    }
    expect(problems).toEqual([]);
  });

  test('print: the print output holds every column, including the never-rendered ones', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=50&cols=100&export`);
    await expectColumnWindow(page, 100);
    expect(await rendered(page, 'b99')).toBe(false);
    await page.evaluate(() => {
      const w = window as unknown as { __printed?: { headers: string[]; first: string[] } };
      window.print = () => {
        const container = document.querySelector('.salmon-data-grid-print');
        w.__printed = {
          headers: [...(container?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent ?? ''),
          first: [...(container?.querySelector('tbody > tr')?.querySelectorAll('td') ?? [])].map((td) => td.textContent ?? ''),
        };
        setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0);
      };
    });
    expect(await page.evaluate(() => window.__gridApi.print())).toBe(true);
    const printed = await page.evaluate(() => (window as unknown as { __printed: { headers: string[]; first: string[] } }).__printed);
    expect(printed.headers).toHaveLength(101);
    expect(printed.headers.slice(-3)).toEqual(['Date 97', 'Date 98', 'Flag 99']);
    expect(printed.first).toHaveLength(101);
    expect(printed.first[91]).toBe(String(await value(page, 'r0', 's90')));
    expect(problems).toEqual([]);
  });

  test('clipboard: copying a range across unrendered columns writes every column to the TSV', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=100&sel=cell&cellMode=box&edit=cell`);
    await expectColumnWindow(page, 100);
    expect(await rendered(page, 's90')).toBe(false);
    await page.evaluate(() => window.__gridApi.selectCellRange({ rowId: 'r0', field: 's0' }, { rowId: 'r2', field: 'b99' }));
    expect((await page.evaluate(() => window.__gridApi.copy({ includeHeaders: true }))).status).toBe('applied');
    const lines = (await page.evaluate(() => navigator.clipboard.readText())).split('\n');
    expect(lines).toHaveLength(4);
    const head = (lines[0] as string).split('\t');
    expect(head).toHaveLength(100);
    expect(head[0]).toBe('Text 0');
    expect(head[99]).toBe('Flag 99');
    for (const [i, rowId] of ['r0', 'r1', 'r2'].entries()) {
      const fields = (lines[i + 1] as string).split('\t');
      expect(fields).toHaveLength(100);
      expect(fields[90]).toBe(String(await value(page, rowId, 's90')));
      // Formatted text, like a rendered cell: the N0 number column copies its display value.
      const formatted = await page.evaluate((r) => window.__gridApi.engine.getCellSnapshot(r, 'n95')?.formattedValue, rowId);
      expect(fields[95]).toBe(formatted);
    }
    expect(await rendered(page, 's90')).toBe(false);
    expect(problems).toEqual([]);
  });

  test('grouping from the column menu of a far column groups, shows captions in view, and ungroups', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await expectColumnWindow(page, 100);
    expect(await rendered(page, 's90')).toBe(false);
    await scrollToColumn(page, 's90');
    await header(page, 's90').hover();
    await header(page, 's90').locator('.salmon-data-grid-column-menu-button').click();
    await page.getByRole('menu', { name: 'Text 90 column menu' }).locator('[data-item-id="group"]').click();
    await expect.poll(() => page.evaluate(() => window.__gridApi.engine.getSnapshot().query.grouping.map((g: { columnId: string }) => g.columnId))).toEqual(['s90']);
    expect(await page.evaluate(() => (window as unknown as { __groupEvents: { type: string; field?: string }[] }).__groupEvents)).toContainEqual(expect.objectContaining({ type: 'change', action: 'group', field: 's90' }));
    // Captions render while the grid is scrolled far right; the caption text stays inside the viewport.
    const caption = page.locator('.salmon-data-grid-rows .salmon-data-grid-group-caption').first();
    await expect(caption).toBeVisible();
    const vp = await box(page, '.salmon-data-grid-viewport');
    const c = (await caption.locator('.salmon-data-grid-group-caption__text').boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(vp.x - 1);
    expect(c.x).toBeLessThan(vp.x + vp.width);
    expect(await caption.textContent()).toContain('Text 90');
    // Ungroup from the same menu after the column scrolled out and back.
    await scrollViewport(page, null, 0);
    expect(await rendered(page, 's90')).toBe(false);
    await page.evaluate(() => window.__gridApi.openColumnMenu('s90'));
    await page.getByRole('menu', { name: 'Text 90 column menu' }).locator('[data-item-id="ungroup"]').click();
    await expect.poll(() => page.evaluate(() => window.__gridApi.engine.getSnapshot().query.grouping.length)).toBe(0);
    expect(problems).toEqual([]);
  });
});
