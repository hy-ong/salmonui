import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport, waitForGridReady } from './helpers.ts';

// Virtualization compatibility gaps (development build):
// - examples/vite-spa/layout-gaps.html: `height` ('auto', '100%', default), `virtualization={false}`,
//   `rowHeight`, `renderRow` + `DataGridRow`, pinned columns with detail rows and child grids;
// - examples/vite-spa/hierarchy.html: a large virtualized parent with child grids, row drag with edge auto-scroll;
// - examples/vite-spa/index.html: column selection under column virtualization, reorder at pin edges, RTL.

const LAYOUT = `${DEV_URL}layout-gaps.html`;

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

const renderedRowIds = (page: Page, scope = '') =>
  page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(`${s} .salmon-data-grid-rows > [role="row"]`)].map((r) => r.dataset['rowId'] as string), scope);

const visibleOrder = (page: Page) => page.evaluate(() => window.__gridApi.getVisibleColumns().map((c: { columnId: string }) => c.columnId) as string[]);

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
}

test.describe('grid height and row virtualization', () => {
  test("height: 'auto' renders every row and warns above 500 rows; the default height is 400; virtualization={false} renders every row and column", async ({ page }) => {
    // 600 rows with height 'auto': no row virtualization, one dev warning.
    const problems = collectProblems(page);
    await openGrid(page, `${LAYOUT}?rows=600&cols=5&height=auto`);
    await expect(page.locator('.salmon-data-grid')).toHaveAttribute('data-auto-height', '');
    expect(await page.locator('.salmon-data-grid-rows > [role="row"]').count()).toBe(600);
    expect(await page.evaluate(() => window.__gridApi.getRenderedRange().rows)).toMatchObject({ start: 0, end: 600 });
    const autoBox = await box(page, '.salmon-data-grid-viewport');
    expect(autoBox.height).toBeGreaterThan(600 * 36);
    expect(problems.filter((p) => p.includes('height="auto" renders every row (600)'))).toHaveLength(1);
    expect(problems.filter((p) => !p.includes('height="auto"'))).toEqual([]);

    // 300 rows with height 'auto': every row, no warning.
    problems.length = 0;
    await openGrid(page, `${LAYOUT}?rows=300&cols=5&height=auto`);
    expect(await page.locator('.salmon-data-grid-rows > [role="row"]').count()).toBe(300);
    expect(problems).toEqual([]);

    // No height prop: a 400 px viewport with virtualized rows.
    await openGrid(page, `${LAYOUT}?rows=10000&cols=5&height=none`);
    await expect(page.locator('.salmon-data-grid')).not.toHaveAttribute('data-auto-height', '');
    expect((await box(page, '.salmon-data-grid-viewport')).height).toBe(400);
    const range = await page.evaluate(() => window.__gridApi.getRenderedRange().rows);
    expect(range.end - range.start).toBeLessThanOrEqual(Math.ceil((400 - 40) / 36) + 1);
    expect(await page.locator('.salmon-data-grid-rows > [role="row"]').count()).toBeLessThanOrEqual(range.end - range.start + 2 * 5);

    // virtualization={false}: every row and every column, inside the fixed 400 px viewport.
    await openGrid(page, `${LAYOUT}?rows=300&cols=40&virt=0`);
    expect((await box(page, '.salmon-data-grid-viewport')).height).toBe(400);
    expect(await page.locator('.salmon-data-grid-rows > [role="row"]').count()).toBe(300);
    expect(await page.locator('.salmon-data-grid-header-cell').count()).toBe(41);
    expect(await page.locator('.salmon-data-grid-row[data-row-id="r299"] [role="gridcell"]').count()).toBe(41);
    await scrollViewport(page, 100_000, 100_000);
    expect(await page.locator('.salmon-data-grid-rows > [role="row"]').count()).toBe(300);
    expect(problems).toEqual([]);
  });

  test("height: '100%' fills a fixed-height parent, fills the parent width, and the rendered range follows a parent resize", async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${LAYOUT}?rows=10000&cols=20&height=100%25&parent=700x500`);
    const fit = async () => {
      const parent = await box(page, '#parent');
      const grid = await box(page, '.salmon-data-grid');
      return { parent, grid, range: await page.evaluate(() => window.__gridApi.getRenderedRange()) };
    };
    // The viewport ResizeObserver measures asynchronously: wait until the range matches the viewport.
    const span = async () => {
      const range = (await fit()).range;
      return { rows: range.rows.end - range.rows.start, columns: range.columns.end - range.columns.start };
    };
    const rowsFor = (height: number) => [Math.floor((height - 2 - 40) / 36), Math.ceil((height - 2 - 40) / 36) + 1] as const;
    const within = async (height: number) => {
      const [lo, hi] = rowsFor(height);
      const n = (await span()).rows;
      return n >= lo && n <= hi;
    };
    await expect.poll(() => within(500)).toBe(true);
    let r = await fit();
    // The parent's 1 px border sits outside its 700 x 500 content box.
    expect(r.grid.width).toBe(700);
    expect(r.grid.height).toBe(500);
    expect(r.parent.width).toBe(702);
    const rows500 = r.range.rows.end - r.range.rows.start;
    const cols700 = r.range.columns.end - r.range.columns.start;
    // The last visible row ends inside the viewport bottom.
    await expect(page.locator(`.salmon-data-grid-row[data-row-id="r${r.range.rows.end - 1}"]`)).toBeVisible();

    // Taller and wider parent: more rows and more columns.
    await page.evaluate(() => (window as unknown as { __resizeParent(w: number, h: number): void }).__resizeParent(1100, 760));
    await expect.poll(async () => (await fit()).grid.height).toBe(760);
    await expect.poll(() => within(760)).toBe(true);
    await expect.poll(async () => (await span()).columns).toBeGreaterThan(cols700);
    r = await fit();
    expect(r.grid.width).toBe(1100);
    expect(r.range.rows.end - r.range.rows.start).toBeGreaterThan(rows500 + 5);
    await expect(page.locator(`.salmon-data-grid-row[data-row-id="r${r.range.rows.end - 1}"]`)).toHaveCount(1);

    // Smaller parent: the range shrinks and the DOM stays bounded.
    await page.evaluate(() => (window as unknown as { __resizeParent(w: number, h: number): void }).__resizeParent(500, 260));
    await expect.poll(async () => (await fit()).grid.height).toBe(260);
    await expect.poll(() => within(260)).toBe(true);
    r = await fit();
    expect(r.grid.width).toBe(500);
    expect(await page.locator('.salmon-data-grid-rows > [role="row"]').count()).toBeLessThanOrEqual(r.range.rows.end - r.range.rows.start + 10);
    expect(problems).toEqual([]);
  });

  test('a non-default rowHeight sets the row height and renders more rows per viewport', async ({ page }) => {
    await openGrid(page, `${LAYOUT}?rows=10000&cols=5`);
    const defaultRows = await page.evaluate(() => {
      const r = window.__gridApi.getRenderedRange().rows;
      return r.end - r.start;
    });
    expect((await box(page, '.salmon-data-grid-row[data-row-id="r1"]')).height).toBe(36);
    await openGrid(page, `${LAYOUT}?rows=10000&cols=5&rowHeight=24`);
    expect((await box(page, '.salmon-data-grid-row[data-row-id="r1"]')).height).toBe(24);
    expect((await box(page, '.salmon-data-grid-row[data-row-id="r1"] [role="gridcell"]')).height).toBe(24);
    const small = await page.evaluate(() => {
      const r = window.__gridApi.getRenderedRange().rows;
      return { count: r.end - r.start, body: (document.querySelector('.salmon-data-grid-body') as HTMLElement).getBoundingClientRect().height };
    });
    expect(small.count).toBeGreaterThan(defaultRows);
    expect(small.count).toBeGreaterThanOrEqual(Math.floor((400 - 40) / 24));
    expect(small.body).toBe(10_000 * 24);
    // Rows tile at 24 px after a deep scroll.
    await scrollViewport(page, 24 * 5000, null);
    const tops = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > [role="row"]')].map((r) => r.getBoundingClientRect().top));
    for (let i = 1; i < tops.length; i++) expect((tops[i] as number) - (tops[i - 1] as number)).toBeCloseTo(24, 0);
  });
});

test.describe('row template under virtualization', () => {
  test('a renderRow grid scrolls: rows recycle, the DOM stays bounded, row/gridcell ARIA and keyboard focus stay intact', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${LAYOUT}?rows=100000&cols=40&rowTpl`);
    const seen = new Set<string>();
    for (const [top, left] of [[0, 0], [36 * 1000, 0], [36 * 50_000, 2500], [36 * 99_990, 99_999]] as const) {
      await scrollViewport(page, top, left);
      const r = await page.evaluate(() => {
        const range = window.__gridApi.getRenderedRange();
        const rows = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > *')];
        return {
          range,
          ids: rows.map((row) => row.dataset['rowId'] as string),
          template: rows.every((row) => row.classList.contains('tpl-row') && row.classList.contains('salmon-data-grid-row') && (row.dataset['tpl'] === 'even' || row.dataset['tpl'] === 'odd')),
          roles: rows.every((row) => row.getAttribute('role') === 'row' && row.closest('[role="rowgroup"]') !== null),
          indices: rows.every((row) => Number(row.getAttribute('aria-rowindex')) === Number(row.dataset['rowIndex']) + 2 && row.dataset['rowId'] === `r${row.dataset['rowIndex']}`),
          parity: rows.every((row) => row.dataset['tpl'] === (Number(row.dataset['rowIndex']) % 2 === 0 ? 'even' : 'odd')),
          cellsOk: rows.every((row) => {
            const cells = [...row.querySelectorAll('[role="gridcell"]')];
            return cells.length > 0 && cells.every((c) => c.closest('[role="row"]') === row && c.hasAttribute('aria-colindex'));
          }),
          cells: document.querySelectorAll('.salmon-data-grid-rows [role="gridcell"]').length,
        };
      });
      const visibleRows = r.range.rows.end - r.range.rows.start;
      const visibleColumns = r.range.columns.end - r.range.columns.start;
      expect(r.template).toBe(true);
      expect(r.roles).toBe(true);
      expect(r.indices).toBe(true);
      expect(r.parity).toBe(true);
      expect(r.cellsOk).toBe(true);
      expect(r.ids.length).toBeLessThanOrEqual(visibleRows + 2 * 5);
      expect(r.cells).toBeLessThanOrEqual((visibleRows + 2 * 5) * (visibleColumns + 2 * 2 + 1));
      // The rendered rows are the window's rows.
      expect(r.ids).toContain(`r${r.range.rows.start}`);
      expect(r.ids).toContain(`r${r.range.rows.end - 1}`);
      for (const id of r.ids) seen.add(id);
    }
    // Rows recycle: the DOM never held more than a window, but four windows were rendered.
    expect(seen.size).toBeGreaterThan(4 * 10);
    // Keyboard focus moves through template rows and scrolls them into view.
    await page.evaluate(() => window.__gridApi.focusCell('r99998', 's0'));
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => (document.activeElement?.closest('[role="row"]') as HTMLElement | null)?.dataset['rowId'])).toBe('r99999');
    expect(await page.evaluate(() => document.activeElement?.closest('[role="row"]')?.classList.contains('tpl-row'))).toBe(true);
    await page.keyboard.press('Control+Home');
    await expect.poll(() => page.evaluate(() => (document.activeElement?.closest('[role="row"]') as HTMLElement | null)?.dataset['rowId'])).toBe('r0');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('gridcell');
    expect(problems).toEqual([]);
  });
});

test.describe('child grids under row virtualization', () => {
  test('expanding every parent of a 2,000-row grid mounts only the visible child grids; scrolling keeps rows tiled', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${DEV_URL}hierarchy.html?mode=child&rows=2000`);
    await page.waitForFunction(() => (window as unknown as { __mountMs?: number }).__mountMs !== undefined && window.__gridApi);
    await waitForGridReady(page);
    expect(await page.evaluate(() => window.__gridApi.expandAllDetails().status)).toBe('applied');
    const check = async () => {
      await expect.poll(() => page.locator('#customers .salmon-data-grid-child .salmon-data-grid[role="grid"]').count()).toBeGreaterThan(0);
      await frames(page);
      return page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('#customers > .salmon-data-grid-viewport > .salmon-data-grid-body > .salmon-data-grid-rows > [role="row"]')];
        const parents = rows.filter((r) => !r.dataset['rowId']?.startsWith('__detail:')).map((r) => r.dataset['rowId'] as string);
        const details = rows.filter((r) => r.dataset['rowId']?.startsWith('__detail:')).map((r) => (r.dataset['rowId'] as string).slice('__detail:'.length));
        // Direct child grids of the root grid (ids "customers/<rowId>").
        const children = [...document.querySelectorAll<HTMLElement>('[role="grid"]')].filter((g) => /^customers\/[^/]+$/.test(g.id)).map((g) => g.id.slice('customers/'.length));
        const nested = [...document.querySelectorAll<HTMLElement>('[role="grid"]')].filter((g) => /^customers\/[^/]+\/[^/]+$/.test(g.id)).length;
        let tiled = rows.length > 0;
        for (let i = 1; i < rows.length; i++) if (Math.abs((rows[i - 1] as HTMLElement).getBoundingClientRect().bottom - (rows[i] as HTMLElement).getBoundingClientRect().top) > 1) tiled = false;
        const vp = (document.querySelector('#customers > .salmon-data-grid-viewport') as HTMLElement).getBoundingClientRect();
        const anyVisible = children.some((id) => {
          const g = document.getElementById(`customers/${id}`)?.getBoundingClientRect();
          return g !== undefined && g.bottom > vp.top && g.top < vp.bottom;
        });
        return { parents, details, children, nested, tiled, anyVisible, expanded: rows.filter((r) => r.getAttribute('data-expanded') === 'true').length };
      });
    };
    const offsets = [0, 40_000, 120_000, 1_000_000];
    for (const top of offsets) {
      await page.locator('#customers > .salmon-data-grid-viewport').evaluate((el, t) => {
        el.scrollTop = t;
      }, top);
      await frames(page);
      const r = await check();
      // Every rendered parent is expanded and its detail row follows it; child grids mount only for rendered detail rows.
      expect(r.expanded).toBe(r.parents.length);
      expect(r.children.length).toBeGreaterThan(0);
      expect(r.children.length).toBeLessThanOrEqual(r.details.length);
      for (const id of r.children) expect(r.details).toContain(id);
      // A window, not 2,000 child grids.
      expect(r.children.length).toBeLessThanOrEqual(30);
      expect(r.nested).toBe(0);
      expect(r.anyVisible).toBe(true);
      expect(r.tiled).toBe(true);
    }
    // Scrolled far away, the first child grids are unmounted.
    expect(await page.locator('[id="customers/c0"]').count()).toBe(0);
    await page.locator('#customers > .salmon-data-grid-viewport').evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(page.locator('[id="customers/c0"]')).toHaveCount(1);
    await expect(page.locator('[id="customers/c0"] .salmon-data-grid-rows > [data-row-id]')).toHaveCount(3);
    expect(problems).toEqual([]);
  });
});

test.describe('row drag under row virtualization', () => {
  test('a row drag edge auto-scrolls to a target row that was not rendered at drag start and drops by id', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${DEV_URL}hierarchy.html?mode=drag&rows=2000`);
    await page.waitForFunction(() => (window as unknown as { __mountMs?: number }).__mountMs !== undefined && window.__gridApi);
    const before = new Set(await renderedRowIds(page, '#left'));
    expect(before.has('c0')).toBe(true);
    expect(before.size).toBeLessThan(40);
    const handle = await box(page, '#left [data-row-id="c0"] .salmon-data-grid-row-drag-handle');
    const vp = await box(page, '#left .salmon-data-grid-viewport');
    const x = handle.x + handle.width / 2;
    await page.mouse.move(x, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, handle.y + 20, { steps: 3 });
    // Hold the pointer in the bottom auto-scroll band.
    await page.mouse.move(x + 30, vp.y + vp.height - 8, { steps: 10 });
    const scrollTop = () => page.locator('#left .salmon-data-grid-viewport').evaluate((el) => el.scrollTop);
    await expect.poll(scrollTop, { timeout: 20_000 }).toBeGreaterThan(36 * 80);
    // Leave the band: the scroll stops, the pointer is over a row that was not rendered at drag start.
    await page.mouse.move(x + 30, vp.y + vp.height / 2, { steps: 5 });
    let settled = -1;
    await expect
      .poll(async () => {
        const previous = settled;
        await frames(page);
        settled = await scrollTop();
        return settled === previous;
      })
      .toBe(true);
    const target = await page.evaluate(([px, py]) => {
      const hit = document.elementFromPoint(px as number, py as number)?.closest<HTMLElement>('#left [data-row-id]');
      return hit ? { id: hit.dataset['rowId'] as string, index: Number(hit.dataset['rowIndex']) } : null;
    }, [x + 30, vp.y + vp.height / 2]);
    expect(target).not.toBeNull();
    expect(before.has(target!.id)).toBe(false);
    expect(await page.locator('#left .salmon-data-grid-rows > [data-row-id="c0"]').count()).toBe(0);
    // Drop on the lower half of the target row: c0 lands right after it.
    const tb = await box(page, `#left [data-row-id="${target!.id}"]`);
    await page.mouse.move(x + 30, tb.y + tb.height * 0.8, { steps: 3 });
    await frames(page);
    await expect(page.locator('#left .salmon-data-grid-row-drop-indicator')).toHaveAttribute('data-visible', '');
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate((t) => window.__events.filter((e: { type: string }) => e.type === 'rowDrop').at(-1), target!.id))
      .toMatchObject({ rowIds: ['c0'], targetGridId: 'left', toIndex: target!.index });
    const ids = await page.evaluate(() => window.__gridApi.getViewRows().map((r: { id: string }) => r.id) as string[]);
    expect(ids.indexOf('c0')).toBe(target!.index);
    expect(ids[target!.index - 1]).toBe(target!.id);
    expect(ids[0]).toBe('c1');
    expect(problems).toEqual([]);
  });
});

test.describe('column selection under column virtualization', () => {
  test('selected columns (pinned and center) stay selected for rows and columns scrolled outside the rendered window', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=100&sel=cell&cellMode=box&columnsSel`);
    // Ctrl+Space on a cell of the pinned id column selects that column.
    await page.locator('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-cell[data-column-id="id"]').click();
    await page.keyboard.press('Control+Space');
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="id"]')).toHaveAttribute('aria-selected', 'true');
    // Add a center column and a column far outside the rendered window.
    await page.evaluate(() => window.__gridApi.selectColumns(['s1', 'b99'], { mode: 'add' }));
    const selected = await page.evaluate(() => [...window.__gridApi.getSelectedColumns()].sort());
    expect(selected).toEqual(['b99', 'id', 's1']);
    expect(await page.locator('.salmon-data-grid-header-cell[data-column-id="b99"]').count()).toBe(0);
    const selectedCells = (rowId: string) =>
      page.evaluate((id) => [...document.querySelectorAll<HTMLElement>(`.salmon-data-grid-row[data-row-id="${id}"] .salmon-data-grid-cell[aria-selected="true"]`)].map((c) => c.dataset['columnId']).sort(), rowId);
    // Far down and far right: s1 leaves the window, b99 enters it; the pinned id stays.
    await scrollViewport(page, 36 * 1500, 1_000_000);
    const first = await page.evaluate(() => window.__gridApi.getRenderedRange().rows.start as number);
    expect(first).toBeGreaterThan(1400);
    expect(await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]').count()).toBe(0);
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="b99"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="id"]')).toHaveAttribute('aria-selected', 'true');
    expect(await selectedCells(`r${first + 2}`)).toEqual(['b99', 'id']);
    expect(await page.locator(`.salmon-data-grid-row[data-row-id="r${first + 2}"] .salmon-data-grid-cell[data-column-id="d98"]`).getAttribute('aria-selected')).toBe('false');
    // Back to the start columns, still deep in the rows.
    await scrollViewport(page, null, 0);
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]')).toHaveAttribute('aria-selected', 'true');
    expect(await selectedCells(`r${first + 2}`)).toEqual(['id', 's1']);
    // Every rendered row agrees.
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row')].every((row) =>
        ['id', 's1'].every((col) => row.querySelector(`.salmon-data-grid-cell[data-column-id="${col}"]`)?.getAttribute('aria-selected') === 'true'),
      ),
    );
    expect(rows).toBe(true);
    expect([...(await page.evaluate(() => window.__gridApi.getSelectedColumns()))].sort()).toEqual(['b99', 'id', 's1']);
    expect(problems).toEqual([]);
  });
});

/** Drags a header cell by the pointer to a point; returns the drop indicator and preview boxes before the release. */
async function dragHeader(page: Page, fromColumn: string, to: { x: number; y: number }) {
  const from = await box(page, `.salmon-data-grid-header-cell[data-column-id="${fromColumn}"]`);
  const start = { x: from.x + from.width * 0.4, y: from.y + from.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + (to.x > start.x ? 10 : -10), start.y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await frames(page);
  const state = await page.evaluate(() => {
    const indicator = document.querySelector('.salmon-data-grid-drop-indicator') as HTMLElement;
    const preview = document.querySelector('.salmon-data-grid-drag-preview') as HTMLElement;
    return { invalid: indicator.dataset['invalid'], indicator: indicator.getBoundingClientRect().toJSON(), preview: preview.getBoundingClientRect().toJSON(), previewText: preview.textContent };
  });
  await page.mouse.up();
  await frames(page);
  return state as { invalid: string | undefined; indicator: DOMRect; preview: DOMRect; previewText: string };
}

test.describe('reorder at pin edges', () => {
  test('a header drag and Alt+ArrowLeft / Right reorder stop at the pin edge', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=10&frozenRight`);
    const initial = await visibleOrder(page);
    expect(initial[0]).toBe('id');
    expect(initial.at(-1)).toBe('b9');
    // Dragging a center column onto the start-pinned id column is invalid and moves nothing.
    const idCell = await box(page, '.salmon-data-grid-header-cell[data-column-id="id"]');
    const invalid = await dragHeader(page, 's2', { x: idCell.x + idCell.width * 0.3, y: idCell.y + idCell.height / 2 });
    expect(invalid.invalid).toBe('true');
    expect(await visibleOrder(page)).toEqual(initial);
    // Onto the end-pinned b9 column: also invalid.
    const b9 = await box(page, '.salmon-data-grid-header-cell[data-column-id="b9"]');
    const invalidEnd = await dragHeader(page, 'd8', { x: b9.x + b9.width * 0.7, y: b9.y + b9.height / 2 });
    expect(invalidEnd.invalid).toBe('true');
    expect(await visibleOrder(page)).toEqual(initial);
    // A drag inside the center zone up to the pin edge is valid: s2 becomes the first center column.
    const s0 = await box(page, '.salmon-data-grid-header-cell[data-column-id="s0"]');
    const valid = await dragHeader(page, 's2', { x: s0.x + s0.width * 0.2, y: s0.y + s0.height / 2 });
    expect(valid.invalid).toBe('false');
    await expect.poll(() => visibleOrder(page)).toEqual(['id', 's2', 's0', 's1', ...initial.slice(4)]);
    // Alt+ArrowLeft on the first center column stops at the start pin edge.
    await page.evaluate(() => window.__gridApi.focusHeader('s2'));
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowLeft');
    await frames(page);
    expect((await visibleOrder(page)).slice(0, 2)).toEqual(['id', 's2']);
    // Alt+ArrowRight on the last center column stops at the end pin edge.
    await page.evaluate(() => window.__gridApi.focusHeader('d7'));
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(async () => (await visibleOrder(page)).slice(-3)).toEqual(['d8', 'd7', 'b9']);
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    await frames(page);
    expect((await visibleOrder(page)).slice(-3)).toEqual(['d8', 'd7', 'b9']);
    expect(await page.evaluate(() => (document.activeElement?.closest('[data-column-id]') as HTMLElement | null)?.dataset['columnId'])).toBe('d7');
    expect(problems).toEqual([]);
  });
});

test.describe('pinned columns with detail rows and child grids', () => {
  test('with start and end pinned columns a detail row spans the full width and its content stays in view while the columns scroll', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${LAYOUT}?rows=1000&cols=30&pinEnd&detail`);
    expect(await page.evaluate(() => window.__gridApi.expandDetail('r1').status)).toBe('applied');
    const detail = page.locator('.salmon-data-grid-row[data-row-id="__detail:r1"]');
    await expect(detail.locator('.detail-content')).toHaveText('Detail of r1');
    const measure = () =>
      page.evaluate(() => {
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const row = document.querySelector('.salmon-data-grid-row[data-row-id="r1"]') as HTMLElement;
        const cell = document.querySelector('.salmon-data-grid-row[data-row-id="__detail:r1"] .salmon-data-grid-detail-row__cell') as HTMLElement;
        const content = document.querySelector('.salmon-data-grid-row[data-row-id="__detail:r1"] .salmon-data-grid-detail') as HTMLElement;
        const pinStart = row.querySelector('.salmon-data-grid-cell[data-column-id="id"]') as HTMLElement;
        const pinEnd = row.querySelector('.salmon-data-grid-cell[data-column-id="b29"]') as HTMLElement;
        const r = (el: HTMLElement) => el.getBoundingClientRect();
        return {
          vp: { left: r(vp).left + vp.clientLeft, width: vp.clientWidth, scrollWidth: vp.scrollWidth },
          cell: { width: r(cell).width, colspan: Number(cell.getAttribute('aria-colspan')), colindex: cell.getAttribute('aria-colindex') },
          content: { left: r(content).left, width: r(content).width },
          pinStart: r(pinStart).left,
          pinEnd: r(pinEnd).right,
          columnCount: Number((document.querySelector('[role="grid"]') as HTMLElement).getAttribute('aria-colcount')),
        };
      });
    const a = await measure();
    // One cell spanning every column (both pinned zones included), as wide as the scrollable content.
    expect(a.cell.colindex).toBe('1');
    expect(a.cell.colspan).toBe(a.columnCount);
    expect(a.cell.width).toBeGreaterThanOrEqual(a.vp.scrollWidth - 1);
    expect(Math.abs(a.content.left - a.vp.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.content.width - a.vp.width)).toBeLessThanOrEqual(1);
    await scrollViewport(page, null, 2000);
    const b = await measure();
    expect(b.pinStart).toBe(a.pinStart);
    expect(b.pinEnd).toBe(a.pinEnd);
    expect(Math.abs(b.content.left - a.content.left)).toBeLessThanOrEqual(1);
    expect(b.content.width).toBe(a.content.width);
    expect(problems).toEqual([]);
  });

  test('with pinned columns a child grid mounts in a full-width detail row and stays in view while the parent columns scroll', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${LAYOUT}?rows=1000&cols=30&pinEnd&child`);
    expect(await page.evaluate(() => window.__gridApi.expandDetail('r1').status)).toBe('applied');
    const child = page.locator('.salmon-data-grid-row[data-row-id="__detail:r1"] .salmon-data-grid-child [role="grid"]');
    await expect(child.locator('.salmon-data-grid-rows > [data-row-id]')).toHaveCount(3);
    const measure = () =>
      page.evaluate(() => {
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const cell = document.querySelector('.salmon-data-grid-row[data-row-id="__detail:r1"] .salmon-data-grid-detail-row__cell') as HTMLElement;
        const grid = document.querySelector('.salmon-data-grid-row[data-row-id="__detail:r1"] .salmon-data-grid-child [role="grid"]') as HTMLElement;
        const pinStart = document.querySelector('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-cell[data-column-id="id"]') as HTMLElement;
        const vr = vp.getBoundingClientRect();
        return {
          vp: { left: vr.left + vp.clientLeft, right: vr.left + vp.clientLeft + vp.clientWidth, scrollWidth: vp.scrollWidth },
          colspan: Number(cell.getAttribute('aria-colspan')),
          cellWidth: cell.getBoundingClientRect().width,
          grid: grid.getBoundingClientRect().toJSON() as DOMRect,
          pinStart: pinStart.getBoundingClientRect().left,
          columnCount: Number((document.querySelector('[role="grid"]') as HTMLElement).getAttribute('aria-colcount')),
        };
      });
    const a = await measure();
    expect(a.colspan).toBe(a.columnCount);
    expect(a.cellWidth).toBeGreaterThanOrEqual(a.vp.scrollWidth - 1);
    expect(a.grid.left).toBeGreaterThanOrEqual(a.vp.left - 1);
    expect(a.grid.right).toBeLessThanOrEqual(a.vp.right + 1);
    await scrollViewport(page, null, 2500);
    const b = await measure();
    expect(b.pinStart).toBe(a.pinStart);
    expect(Math.abs(b.grid.left - a.grid.left)).toBeLessThanOrEqual(1);
    expect(b.grid.width).toBe(a.grid.width);
    // The child grid is a working grid: its rows are reachable and its own pinned-free columns render.
    await expect(child.locator('[data-row-id="o1"] [data-column-id="total"]')).toHaveText('101');
    expect(problems).toEqual([]);
  });
});

test.describe('RTL column reorder and column virtualization', () => {
  test('in RTL the header-drag drop indicator and preview track the pointer, and Alt+ArrowLeft / Right follow the visual direction', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=10&gridDir=rtl`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.salmon-data-grid')!).direction)).toBe('rtl');
    const s0 = await box(page, '.salmon-data-grid-header-cell[data-column-id="s0"]');
    const s1 = await box(page, '.salmon-data-grid-header-cell[data-column-id="s1"]');
    // RTL: s0 sits to the right of s1.
    expect(s0.x).toBeGreaterThan(s1.x);
    // Pointer over the right (visual start) half of s0: the indicator sits on s0's right edge; the preview hangs left of the pointer.
    const p1 = { x: s0.x + s0.width * 0.8, y: s0.y + s0.height / 2 };
    const first = await dragHeaderAndHold(page, 's3', p1);
    expect(first.invalid).toBe('false');
    expect(Math.abs(first.indicator.x + first.indicator.width / 2 - (s0.x + s0.width))).toBeLessThanOrEqual(2);
    expect(Math.abs(first.preview.x + first.preview.width - (p1.x - 12))).toBeLessThanOrEqual(2);
    expect(Math.abs(first.preview.y - (p1.y + 8))).toBeLessThanOrEqual(2);
    expect(first.previewText).toBe('Text 3');
    // The pointer moves to the left (visual end) half of s1: the indicator follows to s1's left edge, the preview follows the pointer.
    const p2 = { x: s1.x + s1.width * 0.2, y: s1.y + s1.height / 2 + 4 };
    await page.mouse.move(p2.x, p2.y, { steps: 8 });
    await frames(page);
    const second = await readDrag(page);
    expect(Math.abs(second.indicator.x + second.indicator.width / 2 - s1.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(second.preview.x + second.preview.width - (p2.x - 12))).toBeLessThanOrEqual(2);
    expect(Math.abs(second.preview.y - (p2.y + 8))).toBeLessThanOrEqual(2);
    // Back to the first point and drop: s3 lands before s0 (logical index 1).
    await page.mouse.move(p1.x, p1.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await visibleOrder(page)).slice(0, 5)).toEqual(['id', 's3', 's0', 's1', 's2']);
    // Keyboard: Alt+ArrowLeft moves the column visually left, which is logically forward in RTL.
    await page.evaluate(() => window.__gridApi.focusHeader('s3'));
    const xBefore = (await box(page, '.salmon-data-grid-header-cell[data-column-id="s3"]')).x;
    await page.keyboard.press('Alt+ArrowLeft');
    await expect.poll(async () => (await visibleOrder(page)).slice(0, 4)).toEqual(['id', 's0', 's3', 's1']);
    expect((await box(page, '.salmon-data-grid-header-cell[data-column-id="s3"]')).x).toBeLessThan(xBefore);
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(async () => (await visibleOrder(page)).slice(0, 4)).toEqual(['id', 's3', 's0', 's1']);
    // Alt+ArrowRight again would cross the start-pinned id column: nothing moves.
    await page.keyboard.press('Alt+ArrowRight');
    await frames(page);
    expect((await visibleOrder(page)).slice(0, 2)).toEqual(['id', 's3']);
    expect(problems).toEqual([]);
  });

  test('in RTL a 100-column grid: getRenderedRange().columns and the painted cells follow the horizontal scroll', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=1000&cols=100&gridDir=rtl`);
    const sample = () =>
      page.evaluate(() => {
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const api = window.__gridApi;
        const range = api.getRenderedRange().columns as { start: number; end: number; overscanStart: number; overscanEnd: number };
        const center = (api.getVisibleColumns() as { columnId: string; pinned?: string | null }[]).filter((c) => c.columnId !== 'id').map((c) => c.columnId);
        const rowIndex = api.getRenderedRange().rows.start as number;
        const row = document.querySelector<HTMLElement>(`.salmon-data-grid-rows > .salmon-data-grid-row[data-row-id="r${rowIndex + 1}"]`) as HTMLElement;
        const rendered = [...row.querySelectorAll<HTMLElement>('.salmon-data-grid-center > .salmon-data-grid-cell')].map((c) => c.dataset['columnId'] as string);
        const headers = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-header .salmon-data-grid-center .salmon-data-grid-header-cell, .salmon-data-grid-header-cell')]
          .map((c) => c.dataset['columnId'] as string)
          .filter((id) => id !== 'id');
        // Painted: hit-test points across the unpinned area of the row; each lands on a cell of the rendered window.
        const vr = vp.getBoundingClientRect();
        const pinned = (row.querySelector('.salmon-data-grid-cell[data-column-id="id"]') as HTMLElement).getBoundingClientRect();
        const rr = row.getBoundingClientRect();
        const y = rr.top + rr.height / 2;
        const left = vr.left + vp.clientLeft + 2;
        const right = pinned.left - 2;
        const hits: (string | null)[] = [];
        for (let i = 0; i <= 10; i++) {
          const el = document.elementFromPoint(left + ((right - left) * i) / 10, y)?.closest<HTMLElement>('[role="gridcell"]');
          hits.push(el ? (el.dataset['columnId'] as string) : null);
        }
        return { scrollLeft: vp.scrollLeft, maxScroll: vp.scrollWidth - vp.clientWidth, range, center, rendered, headers: [...new Set(headers)], hits };
      });
    const check = (s: Awaited<ReturnType<typeof sample>>) => {
      const windowIds = s.center.slice(s.range.overscanStart, s.range.overscanEnd);
      expect(s.rendered).toEqual(windowIds);
      for (const id of s.headers) expect(windowIds).toContain(id);
      const visibleIds = s.center.slice(s.range.start, s.range.end);
      for (const hit of s.hits) {
        expect(hit).not.toBeNull();
        expect(visibleIds).toContain(hit);
      }
    };
    const start = await sample();
    expect(start.scrollLeft).toBe(0);
    expect(start.range.start).toBe(0);
    check(start);
    // RTL scrollLeft runs from 0 to -max in Chromium.
    const steps = [-3000, -7500, -12_000];
    let last = start.range.start;
    for (const left of steps) {
      await scrollViewport(page, 36 * 300, left);
      const s = await sample();
      expect(s.scrollLeft).toBe(left);
      expect(s.range.start).toBeGreaterThan(last);
      last = s.range.start;
      check(s);
    }
    await scrollViewport(page, null, -1_000_000);
    const end = await sample();
    expect(end.range.end).toBe(end.center.length);
    expect(end.rendered).toContain('b99');
    check(end);
    // The last logical column is painted at the visual end (left edge) of the viewport.
    const b99 = await box(page, `.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="b99"]`);
    const vp = await box(page, '.salmon-data-grid-viewport');
    expect(Math.abs(b99.x - vp.x - 1)).toBeLessThanOrEqual(1);
    // Back to the start.
    await scrollViewport(page, null, 0);
    const back = await sample();
    expect(back.range.start).toBe(0);
    check(back);
    expect(problems).toEqual([]);
  });
});

async function readDrag(page: Page) {
  return page.evaluate(() => {
    const indicator = document.querySelector('.salmon-data-grid-drop-indicator') as HTMLElement;
    const preview = document.querySelector('.salmon-data-grid-drag-preview') as HTMLElement;
    return { invalid: indicator.dataset['invalid'], indicator: indicator.getBoundingClientRect().toJSON() as DOMRect, preview: preview.getBoundingClientRect().toJSON() as DOMRect, previewText: preview.textContent };
  });
}

/** Starts a header drag and keeps the button down at `to`. */
async function dragHeaderAndHold(page: Page, fromColumn: string, to: { x: number; y: number }) {
  const from = await box(page, `.salmon-data-grid-header-cell[data-column-id="${fromColumn}"]`);
  const start = { x: from.x + from.width * 0.5, y: from.y + from.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + (to.x > start.x ? 10 : -10), start.y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await frames(page);
  return readDrag(page);
}

test.describe('clipboard across unrendered rows', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('copy and paste cover rows outside the rendered window by id', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&sel=cell&cellMode=box&edit=cell`);
    expect(await renderedRowIds(page)).not.toContain('r1500');
    const read = (rowId: string, field: string) =>
      page.evaluate(([r, f]) => (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.[f], [rowId, field] as const);
    // Copy r0..r1500 of s2 while only the top rows are rendered.
    await page.evaluate(() => window.__gridApi.selectCellRange({ rowId: 'r0', field: 's2' }, { rowId: 'r1500', field: 's2' }));
    expect((await page.evaluate(() => window.__gridApi.copy())).status).toBe('applied');
    const lines = (await page.evaluate(() => navigator.clipboard.readText())).split('\n');
    expect(lines).toHaveLength(1501);
    expect(lines[0]).toBe(String(await read('r0', 's2')));
    expect(lines[1500]).toBe(String(await read('r1500', 's2')));
    expect(await renderedRowIds(page)).not.toContain('r1500');
    // Paste 1,000 lines from r10 down: rows far outside the window take the values.
    await page.evaluate(() => window.__gridApi.selectCellRange({ rowId: 'r10', field: 's3' }, { rowId: 'r10', field: 's3' }));
    await page.evaluate(() => window.__gridApi.focusCell('r10', 's3'));
    const text = Array.from({ length: 1000 }, (_, i) => `p${i}`).join('\n');
    expect((await page.evaluate((t) => window.__gridApi.paste(t), text)).status).toBe('applied');
    expect(await read('r10', 's3')).toBe('p0');
    expect(await read('r1009', 's3')).toBe('p999');
    expect(await read('r1010', 's3')).not.toBe('p1000');
    expect(problems).toEqual([]);
  });
});
