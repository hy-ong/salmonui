import { expect, test, type Page } from '@playwright/test';
import type { DataGridApi } from '@salmonui/data-grid';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// Viewport methods of DataGridApi on examples/vite-spa (main.tsx): scrollTo
// and scrollToColumn, getPageSizeForHeight.

const frames = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Field of the center column at `index` (after the pinned ID column). */
const centerField = (page: Page, index: number) =>
  page.evaluate((i) => {
    const api = window.__gridApi as DataGridApi<unknown>;
    return api.engine.getSnapshot().columns.center[i]?.field as string;
  }, index);

/** Header cell box of a column relative to the viewport's scrolling area (null when not rendered). */
const headerBox = (page: Page, field: string) =>
  page.evaluate((f) => {
    const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
    const cell = document.querySelector<HTMLElement>(`.salmon-data-grid-header-cell[data-column-id="${CSS.escape(f)}"]`);
    if (!cell) return null;
    const pinned = document.querySelector<HTMLElement>('.salmon-data-grid-header-cell[data-column-id="id"]')?.getBoundingClientRect();
    const v = vp.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    return { left: c.left - (pinned ? pinned.right : v.left), right: v.left + vp.clientWidth - c.right, width: c.width };
  }, field);

const firstVisibleRowIndex = (page: Page) =>
  page.evaluate(() => {
    const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
    const top = (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect().bottom;
    for (const row of vp.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > [role="row"]')) {
      if (row.getBoundingClientRect().top >= top - 1) return Number(row.dataset['rowIndex']);
    }
    return -1;
  });

const scrollPosition = (page: Page) =>
  page.evaluate(() => {
    const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
    return { top: vp.scrollTop, left: vp.scrollLeft };
  });

test.describe('viewport API', () => {
  test('scrollToColumn brings an unrendered column into view with start, end and nearest alignment', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=1000&cols=100`);
    const field = await centerField(page, 60);
    expect(await headerBox(page, field)).toBeNull();
    await page.evaluate((f) => (window.__gridApi as DataGridApi<unknown>).scrollToColumn(f, { align: 'start' }), field);
    await frames(page);
    const start = await headerBox(page, field);
    expect(start).not.toBeNull();
    expect(Math.abs(start!.left)).toBeLessThanOrEqual(1);
    await expect(page.locator(`.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="${field}"]`).first()).toBeVisible();
    // End: the column's end edge meets the viewport's end edge.
    const far = await centerField(page, 80);
    await page.evaluate((f) => (window.__gridApi as DataGridApi<unknown>).scrollToColumn(f, { align: 'end' }), far);
    await frames(page);
    const end = await headerBox(page, far);
    expect(Math.abs(end!.right)).toBeLessThanOrEqual(1);
    // Nearest: a column already in view does not scroll; one before the window scrolls to the start edge.
    const before = await scrollPosition(page);
    await page.evaluate((f) => (window.__gridApi as DataGridApi<unknown>).scrollToColumn(f), far);
    await frames(page);
    expect(await scrollPosition(page)).toEqual(before);
    const first = await centerField(page, 0);
    await page.evaluate((f) => (window.__gridApi as DataGridApi<unknown>).scrollToColumn(f), first);
    await frames(page);
    expect((await scrollPosition(page)).left).toBe(0);
    expect(Math.abs((await headerBox(page, first))!.left)).toBeLessThanOrEqual(1);
    expect(problems).toEqual([]);
  });

  test('scrollTo moves the viewport to a row offset and a column offset, keeps an omitted axis and clamps', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=100000&cols=100`);
    await page.evaluate(() => (window.__gridApi as DataGridApi<unknown>).scrollTo({ top: 36 * 500 }));
    await frames(page);
    expect(await scrollPosition(page)).toEqual({ top: 36 * 500, left: 0 });
    expect(await firstVisibleRowIndex(page)).toBe(500);
    await page.evaluate(() => (window.__gridApi as DataGridApi<unknown>).scrollTo({ left: 300 }));
    await frames(page);
    expect(await scrollPosition(page)).toEqual({ top: 36 * 500, left: 300 });
    // Clamped at both ends.
    await page.evaluate(() => (window.__gridApi as DataGridApi<unknown>).scrollTo({ top: 1e12 }));
    await frames(page);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r99999"]')).toBeVisible();
    await page.evaluate(() => (window.__gridApi as DataGridApi<unknown>).scrollTo({ top: -50, left: -50 }));
    await frames(page);
    expect(await scrollPosition(page)).toEqual({ top: 0, left: 0 });
    expect(problems).toEqual([]);
  });

  test('scrollTo takes row offsets under scroll compression (1M rows) and logical left offsets in RTL', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=1000000&cols=20&dir=rtl`);
    await page.evaluate(() => (window.__gridApi as DataGridApi<unknown>).scrollTo({ top: 36 * 600_000 }));
    await frames(page);
    // 36,000,000 px of rows in a 15,000,000 px scroll range: the physical offset is scaled, the row lands at the top.
    expect((await scrollPosition(page)).top).toBeLessThan(15_000_000);
    expect(Math.abs((await firstVisibleRowIndex(page)) - 600_000)).toBeLessThanOrEqual(1);
    await page.evaluate(() => (window.__gridApi as DataGridApi<unknown>).scrollTo({ left: 200 }));
    await frames(page);
    expect((await scrollPosition(page)).left).toBe(-200);
  });

  for (const rowHeight of [36, 48]) {
    test(`getPageSizeForHeight fills a height with the toolbar, header, rows and pager, rowHeight ${rowHeight}`, async ({ page }) => {
      const problems = collectProblems(page);
      await openGrid(page, `${DEV_URL}?rows=1000&cols=6&qpage=10&qsearch&gridHeight=auto&rowHeight=${rowHeight}`);
      await expect(page.locator('.salmon-data-grid-toolbar')).toBeVisible();
      await expect(page.locator('.salmon-data-grid-pager')).toBeVisible();
      for (const height of [500, 731, 1000]) {
        const size = await page.evaluate((h) => {
          const api = window.__gridApi as DataGridApi<unknown>;
          const n = api.getPageSizeForHeight(h);
          api.setPageSize(n);
          return n;
        }, height);
        await frames(page);
        const stack = await page.evaluate(() => {
          const top = (document.querySelector('.salmon-data-grid-toolbar') as HTMLElement).getBoundingClientRect().top;
          const bottom = (document.querySelector('.salmon-data-grid-pager') as HTMLElement).getBoundingClientRect().bottom;
          const rows = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > [role="row"][data-row-id]')];
          return { height: bottom - top, rows: rows.length, rowHeight: rows[0]?.getBoundingClientRect().height ?? 0 };
        });
        expect(stack.rowHeight).toBe(rowHeight);
        expect(stack.rows).toBe(size);
        // The whole grid (toolbar to pager) fits in the height, and one more row would not.
        expect(stack.height).toBeLessThanOrEqual(height + 0.5);
        expect(stack.height + rowHeight).toBeGreaterThan(height);
      }
      expect(problems).toEqual([]);
    });
  }
});
