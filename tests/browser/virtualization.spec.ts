import { expect, test } from '@playwright/test';
import { bodyCellCount, collectProblems, DEV_URL, installDevtools, openGrid, scrollViewport } from './helpers.ts';

// Structural gates on the 100k x 100 fixture (development build, so the
// Profiler-based commit counter is active). Overscan 5 rows,
// 2 columns; row height 36; grid height 600.

test.describe('virtualization', () => {
  test('DOM cells stay bounded by (visible + 2*overscan) for rows and columns', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, DEV_URL);
    for (const [top, left] of [[0, 0], [1_800_000, 0], [1_800_000, 6000], [3_600_000, 99_999]] as const) {
      await scrollViewport(page, top, left);
      const r = await page.evaluate(() => {
        const range = window.__gridApi.getRenderedRange();
        return {
          rows: range.rows,
          columns: range.columns,
          headerCells: document.querySelectorAll('.salmon-data-grid-header-cell').length,
          pinned: document.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-pin--left .salmon-data-grid-cell').length,
          renderedRows: document.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-row').length,
        };
      });
      const visibleRows = r.rows.end - r.rows.start;
      const visibleColumns = r.columns.end - r.columns.start;
      const cells = await bodyCellCount(page);
      const budget = (visibleRows + 2 * 5) * (visibleColumns + 2 * 2) + (visibleRows + 2 * 5) * 1;
      expect(visibleRows).toBeLessThanOrEqual(17);
      expect(visibleColumns).toBeLessThanOrEqual(9);
      expect(r.renderedRows).toBeLessThanOrEqual(visibleRows + 10);
      expect(cells).toBeLessThanOrEqual(budget);
      expect(r.pinned).toBe(r.renderedRows);
      expect(r.headerCells).toBeLessThanOrEqual(visibleColumns + 4 + 1);
    }
    expect(problems).toEqual([]);
  });

  test('scrolls to the bottom of 100k rows and renders the last row', async ({ page }) => {
    await openGrid(page, DEV_URL);
    await scrollViewport(page, 10_000_000, null);
    const last = page.locator('.salmon-data-grid-row[data-row-id="r99999"]');
    await expect(last).toHaveAttribute('aria-rowindex', '100001');
    const box = await last.boundingBox();
    const vp = await page.locator('.salmon-data-grid-viewport').boundingBox();
    expect(box && vp && box.y + box.height <= vp.y + vp.height + 1 && box.y >= vp.y).toBeTruthy();
    // scrollToRow API lands the row in view.
    await page.evaluate(() => window.__gridApi.scrollToRow('r50000', { align: 'start' }));
    await page.waitForTimeout(50);
    const row = await page.locator('.salmon-data-grid-row[data-row-id="r50000"]').boundingBox();
    const header = await page.locator('.salmon-data-grid-header').boundingBox();
    expect(row && header && Math.abs(row.y - (header.y + header.height)) <= 1).toBeTruthy();
  });

  test('ARIA: one grid, rowgroups of rows of cells, absolute indices', async ({ page }) => {
    await openGrid(page, DEV_URL);
    await scrollViewport(page, 36 * 500, 2000);
    const aria = await page.evaluate(() => {
      const grid = document.querySelectorAll('[role="grid"]');
      const root = grid[0] as HTMLElement;
      const badRows = [...root.querySelectorAll('[role="row"]')].filter((row) => row.closest('[role="rowgroup"]') === null).length;
      const badCells = [...root.querySelectorAll('[role="gridcell"],[role="columnheader"]')].filter((c) => c.closest('[role="row"]') === null).length;
      const firstRow = root.querySelector('.salmon-data-grid-rows [role="row"]') as HTMLElement;
      const colIndices = [...firstRow.querySelectorAll('[role="gridcell"]')].map((c) => Number(c.getAttribute('aria-colindex')));
      return {
        grids: grid.length,
        rowcount: root.getAttribute('aria-rowcount'),
        colcount: root.getAttribute('aria-colcount'),
        badRows,
        badCells,
        firstRowIndex: Number(firstRow.getAttribute('aria-rowindex')),
        firstRowId: firstRow.dataset['rowId'],
        colIndices,
      };
    });
    expect(aria.grids).toBe(1);
    expect(aria.rowcount).toBe('100001');
    expect(aria.colcount).toBe('101');
    expect(aria.badRows).toBe(0);
    expect(aria.badCells).toBe(0);
    expect(aria.firstRowIndex).toBe(Number(aria.firstRowId?.slice(1)) + 2);
    expect(aria.colIndices[0]).toBe(1);
    expect(aria.colIndices[1]).toBeGreaterThan(2); // center slice starts after unrendered columns
    for (let i = 2; i < aria.colIndices.length; i++) expect(aria.colIndices[i]).toBe((aria.colIndices[i - 1] as number) + 1);
  });

  test('frozen columns and the sticky header stay put while scrolling', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?frozenRight=1`);
    const left = page.locator('.salmon-data-grid-header-cell[data-column-id="id"]');
    const right = page.locator('.salmon-data-grid-header-cell[data-column-id="b99"]');
    const header = page.locator('.salmon-data-grid-header');
    const before = { left: await left.boundingBox(), right: await right.boundingBox(), header: await header.boundingBox() };
    await scrollViewport(page, 50_000, 4321);
    const after = { left: await left.boundingBox(), right: await right.boundingBox(), header: await header.boundingBox() };
    expect(after.left).toEqual(before.left);
    expect(after.right).toEqual(before.right);
    expect(after.header?.y).toBe(before.header?.y);
    // The frozen body cell of the first rendered visible row lines up with its header.
    const firstVisible = await page.evaluate(() => window.__gridApi.getRenderedRange().rows.start as number);
    const cell = await page.locator(`.salmon-data-grid-row[data-row-id="r${firstVisible}"] .salmon-data-grid-cell[data-column-id="id"]`).boundingBox();
    expect(cell?.x).toBe(before.left?.x);
    const rightCell = await page.locator(`.salmon-data-grid-row[data-row-id="r${firstVisible}"] .salmon-data-grid-cell[data-column-id="b99"]`).boundingBox();
    expect(rightCell?.x).toBe(before.right?.x);
  });
});

test.describe('render budget', () => {
  test('zero React commits for scrolls that keep the rendered range', async ({ page }) => {
    await installDevtools(page);
    await openGrid(page, DEV_URL);
    await scrollViewport(page, 36 * 1000, 0);
    await page.waitForTimeout(100);
    const start = await page.evaluate(() => window.__commits.length);
    // 1 px steps inside one row and within the column window: 30 scroll events.
    for (let i = 1; i <= 15; i++) await scrollViewport(page, 36 * 1000 + i, null);
    for (let i = 1; i <= 15; i++) await scrollViewport(page, null, i);
    const commits = await page.evaluate((s) => window.__commits.length - s, start);
    expect(commits).toBe(0);
  });

  test('a range change re-renders only entering rows and cells', async ({ page }) => {
    await installDevtools(page);
    await openGrid(page, DEV_URL);
    await scrollViewport(page, 36 * 1000, 0);
    await page.waitForTimeout(100);
    const start = await page.evaluate(() => window.__commits.length);
    await scrollViewport(page, 36 * 1003, null); // three rows enter, three leave
    const result = await page.evaluate((s) => {
      const commits = window.__commits.slice(s);
      // StrictMode runs mount layout effects twice in development; count distinct ids.
      return { commits: commits.length, rows: [...new Set(commits.flatMap((c) => c.rows))], cells: new Set(commits.flatMap((c) => c.cells)).size, headers: commits.reduce((n, c) => n + c.headers.length, 0) };
    }, start);
    const perRow = await page.evaluate(() => document.querySelector('.salmon-data-grid-rows .salmon-data-grid-row')?.querySelectorAll('.salmon-data-grid-cell').length ?? 0);
    expect(result.commits).toBe(1);
    expect(result.rows.length).toBe(3);
    expect(result.cells).toBe(3 * perRow);
    expect(result.headers).toBe(0);
  });

  test('a single cell change re-renders one cell', async ({ page }) => {
    await installDevtools(page);
    await openGrid(page, DEV_URL);
    await page.waitForTimeout(100);
    const start = await page.evaluate(() => window.__commits.length);
    // Patch one row through the local data source: only that row's cells update.
    await page.evaluate(() => {
      const api = window.__gridApi;
      const source = api.getDataSource();
      const row = api.getRow('r3');
      source.patch({ upsert: [{ ...row, s0: 'patched' }] });
    });
    await page.waitForTimeout(50);
    const result = await page.evaluate((s) => window.__commits.slice(s).flatMap((c) => c.cells), start);
    expect(await page.locator('.salmon-data-grid-row[data-row-id="r3"] .salmon-data-grid-cell[data-column-id="s0"]').textContent()).toBe('patched');
    const perRow = await page.evaluate(() => document.querySelector('.salmon-data-grid-row[data-row-id="r3"]')?.querySelectorAll('.salmon-data-grid-cell').length ?? 0);
    expect(result.every((id) => id.startsWith('r3:'))).toBe(true);
    expect(result.length).toBeLessThanOrEqual(perRow);
  });
});

test.describe('scroll height compression', () => {
  test('1M rows map into a capped scroll height and reach the last row', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=1000000&cols=4&maxScrollHeight=2000000`);
    const height = await page.evaluate(() => (document.querySelector('.salmon-data-grid-body') as HTMLElement).getBoundingClientRect().height);
    expect(height).toBe(2_000_000);
    await scrollViewport(page, 1e9, null);
    const last = page.locator('.salmon-data-grid-row[data-row-id="r999999"]');
    await expect(last).toHaveCount(1);
    const box = await last.boundingBox();
    const vp = await page.locator('.salmon-data-grid-viewport').boundingBox();
    expect(box && vp && box.y + box.height <= vp.y + vp.height + 1 && box.y > vp.y).toBeTruthy();
    // Middle: the rendered row matches the linear mapping.
    await scrollViewport(page, 1_000_000, null);
    const start = await page.evaluate(() => window.__gridApi.getRenderedRange().rows.start as number);
    expect(Math.abs(start - 500_000)).toBeLessThan(200);
    // Wheel input moves content 1:1 under compression.
    const before = await page.evaluate(() => {
      (window as any).__wheelSum = 0;
      document.querySelector('.salmon-data-grid-viewport')!.addEventListener('wheel', (e) => ((window as any).__wheelSum += (e as WheelEvent).deltaY));
      return window.__gridApi.getRenderedRange().rows.start as number;
    });
    await page.mouse.move(400, 400);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 360);
    await page.waitForTimeout(100);
    const { afterWheel, wheelSum } = await page.evaluate(() => ({
      afterWheel: window.__gridApi.getRenderedRange().rows.start as number,
      wheelSum: (window as any).__wheelSum as number,
    }));
    // Without the 1:1 wheel mapping the content would move ~18x further.
    expect(wheelSum).toBeGreaterThan(0);
    expect(afterWheel - before).toBe(Math.round(wheelSum / 36));
  });

  test('measured variable row heights', async ({ page }) => {
    const problems = collectProblems(page);
    // One shared ResizeObserver (viewport + measured rows), never per row or cell.
    await page.addInitScript(() => {
      const Native = window.ResizeObserver;
      (window as any).__observers = 0;
      window.ResizeObserver = class extends Native {
        constructor(cb: ResizeObserverCallback) {
          super(cb);
          (window as any).__observers++;
        }
      };
    });
    await openGrid(page, `${DEV_URL}?rows=20000&cols=10&wrap=1`);
    await page.waitForTimeout(100);
    const tall = await page.locator('.salmon-data-grid-row[data-row-id="r0"]').boundingBox();
    const short = await page.locator('.salmon-data-grid-row[data-row-id="r1"]').boundingBox();
    expect(tall!.height).toBeGreaterThan(50);
    expect(short!.height).toBe(36);
    expect(short!.y).toBeCloseTo(tall!.y + tall!.height, 0);
    await scrollViewport(page, 1e9, null);
    await page.waitForTimeout(100);
    await scrollViewport(page, 1e9, null);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r19999"]')).toHaveCount(1);
    // StrictMode mounts twice in development: at most one live observer per mount.
    expect(await page.evaluate(() => (window as any).__observers as number)).toBeLessThanOrEqual(2);
    expect(problems).toEqual([]);
  });
});
