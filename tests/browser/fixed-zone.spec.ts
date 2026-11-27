import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// Fixed zone (column `pinned: 'center'`):
// a fixed column keeps its slot and scrolls with it, then sticks at the start
// edge (after the start zone and earlier fixed columns) or at the end edge
// (before the end zone and later fixed columns), so it never leaves the
// viewport while the other center columns scroll on both sides. Fixture:
// examples/vite-spa/src/main.tsx (`?fixedCols=s2,s30`; id is pinned to the
// start by the fixture, `?frozenRight` pins the last column, b59, to the end).
// Widths: id 90, s* 160.

const URL = `${DEV_URL}?rows=2000&cols=60&fixedCols=s2,s30&frozenRight`;
const LAST = 'b59';
const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid-row[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const x = async (page: Page, rowId: string, columnId: string) => (await cell(page, rowId, columnId).boundingBox())?.x ?? NaN;
const right = async (page: Page, rowId: string, columnId: string) => {
  const b = (await cell(page, rowId, columnId).boundingBox())!;
  return b.x + b.width;
};
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.closest<HTMLElement>('.salmon-data-grid-cell')?.dataset['columnId'] ?? null;
  });
const fixedHeaders = (page: Page) =>
  page.locator('.salmon-data-grid-header .salmon-data-grid-fixed .salmon-data-grid-header-cell').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['columnId']));

/** Viewport-relative box of the focused cell and of every fixed box in its row. */
const focusBoxes = (page: Page) =>
  page.evaluate(() => {
    const el = (document.activeElement as HTMLElement).closest('.salmon-data-grid-cell') as HTMLElement;
    const row = el.closest('.salmon-data-grid-row') as HTMLElement;
    const vp = (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).getBoundingClientRect();
    const a = el.getBoundingClientRect();
    const fixed = [...row.querySelectorAll<HTMLElement>('.salmon-data-grid-fixed')].map((f) => {
      const r = f.getBoundingClientRect();
      return { id: (f.querySelector('.salmon-data-grid-cell') as HTMLElement).dataset['columnId'], left: r.left - vp.left, right: r.right - vp.left };
    });
    return { left: a.left - vp.left, right: a.right - vp.left, fixed };
  });

/** Every sampled point of the body shows a cell (no blank areas). */
async function blankPoints(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
    const rect = vp.getBoundingClientRect();
    const headerBottom = (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect().bottom;
    const misses: string[] = [];
    for (let y = headerBottom + 3; y < rect.top + vp.clientHeight - 2; y += 33) {
      for (let x = rect.left + 3; x < rect.left + vp.clientWidth - 2; x += 37) {
        const el = document.elementFromPoint(x, y);
        if (!el?.closest('.salmon-data-grid-cell')) misses.push(`${Math.round(x)},${Math.round(y)}`);
      }
    }
    return misses;
  });
}

test.describe('fixed zone', () => {
  test('horizontal scroll: a fixed column scrolls with its slot, then sticks at the start edge; one beyond the viewport waits at the end edge', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, URL);
    const id = await x(page, 'r0', 'id');
    // Scroll start: s2 in its slot after id (90), s0 and s1 (160 each), scrolling columns on both sides.
    expect((await x(page, 'r0', 's2')) - id).toBe(90 + 320);
    const s1 = await x(page, 'r0', 's1');
    const s3 = await x(page, 'r0', 's3');
    // s30's slot is far right, out of the rendered column window: it renders after the slice and waits at the end edge.
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r0"] .salmon-data-grid-fixed[data-trail] .salmon-data-grid-cell[data-column-id="s30"]')).toHaveCount(1);
    expect(await right(page, 'r0', 's30')).toBe(await x(page, 'r0', LAST));
    expect(await blankPoints(page)).toEqual([]);
    // Small scroll: s2 moves with its slot, like its neighbours.
    await scrollViewport(page, null, 100);
    expect((await x(page, 'r0', 's2')) - id).toBe(90 + 220);
    expect(await x(page, 'r0', 's1')).toBe(s1 - 100);
    expect(await x(page, 'r0', 's3')).toBe(s3 - 100);
    // Past its slot: s2 sticks after the start zone, header and cells alike.
    for (const left of [700, 2000]) {
      await scrollViewport(page, null, left);
      expect((await x(page, 'r0', 's2')) - id).toBe(90);
      expect((await header(page, 's2').boundingBox())!.x - id).toBe(90);
      expect(await right(page, 'r0', 's30')).toBe(await x(page, 'r0', LAST));
      expect(await blankPoints(page)).toEqual([]);
    }
    // Far right: s2's slot is left of the column window (zero-width lead box); s30 stacks after s2.
    await scrollViewport(page, null, 1e6);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r0"] .salmon-data-grid-fixed[data-lead] .salmon-data-grid-cell[data-column-id="s2"]')).toHaveCount(1);
    expect((await x(page, 'r0', 's2')) - id).toBe(90);
    expect((await x(page, 'r0', 's30')) - id).toBe(90 + 160);
    expect(await blankPoints(page)).toEqual([]);
    // A point inside the fixed box hits the fixed cell, not a scrolled column beneath it.
    const hit = await page.evaluate((px) => {
      const row = document.querySelector('.salmon-data-grid-row[data-row-id="r0"]') as HTMLElement;
      const y = row.getBoundingClientRect().top + 10;
      return (document.elementFromPoint(px + 80, y)?.closest('.salmon-data-grid-cell') as HTMLElement | null)?.dataset['columnId'] ?? null;
    }, id + 90);
    expect(hit).toBe('s2');
    // Vertical scroll keeps deep rows aligned.
    await scrollViewport(page, 36 * 500, null);
    const first = await page.evaluate(() => window.__gridApi.getRenderedRange().rows.start as number);
    expect((await x(page, `r${first + 3}`, 's2')) - id).toBe(90);
    await scrollViewport(page, 0, 0);
    expect((await x(page, 'r0', 's2')) - id).toBe(90 + 320);
    await expect(page.locator('.salmon-data-grid-fixed[data-lead]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('keyboard: ArrowRight / ArrowLeft visit start, center, fixed and end columns in visual order; revealed columns are never under a fixed box', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, URL);
    await cell(page, 'r1', 'id').click();
    const order: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      order.push(await focused(page));
      await page.keyboard.press('ArrowRight');
    }
    expect(order).toEqual(['id', 's0', 's1', 's2', 's3']);
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('aria-colindex'))).toBe('6');
    // Walk right far enough to scroll: each focused scrolling column is clear of every fixed box.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('ArrowRight');
      const b = await focusBoxes(page);
      for (const f of b.fixed) expect(b.left >= f.right - 1 || b.right <= f.left + 1, `${await focused(page)} vs ${f.id}`).toBe(true);
    }
    // Walk back left across the fixed column: s2 focuses, s1 ends left of the s2 box.
    const colindex = async () => Number(await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('aria-colindex')));
    while ((await colindex()) > 4) await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe('s2');
    await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe('s1');
    const b = await focusBoxes(page);
    expect(b.right).toBeLessThanOrEqual((b.fixed.find((f) => f.id === 's2')?.left ?? 0) + 1);
    // End reaches the end-pinned column, Home the start-pinned one.
    await page.keyboard.press('End');
    expect(await focused(page)).toBe(LAST);
    await page.keyboard.press('Home');
    expect(await focused(page)).toBe('id');
    expect(problems).toEqual([]);
  });

  test('resize and reorder: the fixed slot and stacking follow widths and order; api.pinColumn moves columns into and out of the fixed zone', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, URL);
    const id = await x(page, 'r0', 'id');
    await page.evaluate(() => window.__gridApi.setColumnWidth('s1', 220));
    await scrollViewport(page, null, 0);
    expect((await x(page, 'r0', 's2')) - id).toBe(90 + 160 + 220);
    await scrollViewport(page, null, 900);
    expect((await x(page, 'r0', 's2')) - id).toBe(90);
    await scrollViewport(page, null, 0);
    // Reorder the fixed column after s3: its slot moves.
    await page.evaluate(() => window.__gridApi.moveColumn('s2', 4));
    await scrollViewport(page, null, 0);
    expect((await x(page, 'r0', 's2')) - id).toBe(90 + 160 + 220 + 160);
    expect(await fixedHeaders(page)).toEqual(['s2', 's30']);
    // Fix s0 at runtime: it stacks before s2 at the start edge; then unpin s2.
    await page.evaluate(() => window.__gridApi.pinColumn('s0', 'center'));
    expect(await fixedHeaders(page)).toEqual(['s0', 's2', 's30']);
    await scrollViewport(page, null, 1500);
    expect((await x(page, 'r0', 's0')) - id).toBe(90);
    expect((await x(page, 'r0', 's2')) - id).toBe(90 + 160);
    await page.evaluate(() => window.__gridApi.pinColumn('s2', null));
    await scrollViewport(page, null, 0);
    expect(await fixedHeaders(page)).toEqual(['s0', 's30']);
    expect(problems).toEqual([]);
  });

  test('RTL: the fixed column scrolls with its slot toward the inline end, then sticks after the start zone', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${URL}&dir=rtl`);
    const vp = page.locator('.salmon-data-grid-viewport');
    const scrollTo = async (left: number) => {
      await vp.evaluate((el, l) => {
        el.scrollLeft = l;
      }, left);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    const id = await right(page, 'r0', 'id');
    // Mirrored: the slot is 90 + 320 px left of the start (right) edge.
    expect(id - (await right(page, 'r0', 's2'))).toBe(90 + 320);
    await scrollTo(-100);
    expect(id - (await right(page, 'r0', 's2'))).toBe(90 + 220);
    for (const left of [-700, -4000]) {
      await scrollTo(left);
      expect(id - (await right(page, 'r0', 's2'))).toBe(90);
      expect(await right(page, 'r0', 'id')).toBe(id);
    }
    expect(problems).toEqual([]);
  });
});
