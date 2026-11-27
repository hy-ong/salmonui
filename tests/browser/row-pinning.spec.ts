import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// Row pinning: pinned rows render first
// in the sticky top rowgroup (before `stickyRows`), stay under the header
// while 5,000 virtualized rows scroll, are rendered once, intersect pinned
// columns, take part in keyboard navigation with a consistent aria-rowindex,
// and follow `pinRows` / `unpinRows` and sorting at runtime.
// Fixture flag: examples/vite-spa/src/main.tsx `?pinRows=r10,r20`.

const URL = `${DEV_URL}?rows=5000&cols=30&sort&pinRows=r4000,r10&frozenRows=1&frozenCols=1`;

const topIds = (page: Page) =>
  page.locator('.salmon-data-grid-frozen-rows--top [role="row"]').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset['rowId'], e.hasAttribute('data-pinned'), e.getAttribute('aria-rowindex')]));

async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el?.classList.contains('salmon-data-grid-cell')) return el?.tagName.toLowerCase() ?? 'none';
    return `${(el.closest('[data-row-id]') as HTMLElement).dataset['rowId']}:${el.dataset['columnId']}`;
  });
}

test.describe('row pinning', () => {
  test('pinned rows head the sticky top zone and stay in place while rows and columns scroll', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, URL);
    expect(await topIds(page)).toEqual([
      ['r10', true, '2'],
      ['r4000', true, '3'],
      ['r0', false, '4'],
    ]);
    await expect(page.locator('[data-row-id="r4000"]')).toHaveCount(1);
    const header = await page.locator('.salmon-data-grid-header').boundingBox();
    const before = await page.locator('[data-row-id="r10"]').boundingBox();
    expect(Math.abs(before!.y - (header!.y + header!.height))).toBeLessThanOrEqual(1);
    // Far down the virtual window: still one r4000, still under the header.
    await scrollViewport(page, 120_000, null);
    const after = await page.locator('[data-row-id="r10"]').boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
    await expect(page.locator('[data-row-id="r4000"]')).toHaveCount(1);
    const range = await page.evaluate(() => window.__gridApi.getRenderedRange().rows);
    expect(range.start).toBeGreaterThan(100);
    // Pinned columns intersect pinned rows: the start-pinned cell does not move horizontally.
    const pinnedCell = page.locator('.salmon-data-grid-row[data-row-id="r10"] .salmon-data-grid-cell[data-column-id="id"]');
    const x = (await pinnedCell.boundingBox())!.x;
    await scrollViewport(page, null, 2_000);
    expect(Math.abs((await pinnedCell.boundingBox())!.x - x)).toBeLessThanOrEqual(1);
    expect(problems).toEqual([]);
  });

  test('keyboard moves between pinned and scrolling rows in visible order', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, URL);
    await page.locator('.salmon-data-grid-row[data-row-id="r10"] .salmon-data-grid-cell[data-column-id="s1"]').click();
    expect(await focused(page)).toBe('r10:s1');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('r4000:s1');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('r0:s1');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('r1:s1');
    await expect(page.locator('[data-row-id="r1"]')).toHaveAttribute('aria-rowindex', '5');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await focused(page)).toBe('r10:s1');
    // Scroll far away and come back by keyboard: the pinned row stays focusable without scrolling.
    await page.keyboard.press('Control+End');
    await expect.poll(() => focused(page)).toBe('r4999:b29');
    await page.keyboard.press('Control+Home');
    await expect.poll(() => focused(page)).toBe('r10:id');
    expect(problems).toEqual([]);
  });

  test('pinRows, unpinRows and sorting at runtime', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, URL);
    await page.evaluate(() => window.__gridApi.pinRows(['r2']));
    await expect.poll(() => topIds(page)).toEqual([
      ['r2', true, '2'],
      ['r10', true, '3'],
      ['r4000', true, '4'],
      ['r0', false, '5'],
    ]);
    await page.evaluate(() => window.__gridApi.sortColumn('id', 'desc'));
    // String ids descending: r4000 > r2 > r10; the sticky row is the first scrolling row.
    await expect.poll(() => topIds(page).then((rows) => rows.map((r) => r[0]))).toEqual(['r4000', 'r2', 'r10', 'r999']);
    await page.evaluate(() => window.__gridApi.unpinRows(['r4000', 'r2']));
    await expect.poll(() => topIds(page).then((rows) => rows.map((r) => r[0]))).toEqual(['r10', 'r999']);
    expect(await page.evaluate(() => [window.__gridApi.isRowPinned('r10'), window.__gridApi.isRowPinned('r2'), window.__gridApi.getPinnedRowIds()])).toEqual([true, false, ['r10']]);
    await page.evaluate(() => window.__gridApi.scrollToRow('r4000'));
    await expect(page.locator('.salmon-data-grid-rows [data-row-id="r4000"]')).toHaveCount(1);
    expect(problems).toEqual([]);
  });
});
