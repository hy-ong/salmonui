import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, PROD_URL, scrollViewport } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Batch editing under row and column virtualization.
// Drafts live in the core edit module keyed by row id, never in rendered
// cells, so they survive a row leaving and re-entering the window; keyboard
// moves scroll the target cell into view and its editor takes focus when it
// mounts; save and cancel cover rows that are not rendered. The performance
// gate scrolls a grid with 1,000 dirty cells (the per-cell edit flag read is
// on the scroll path).

const BATCH = `${DEV_URL}?rows=100000&cols=100&edit=batch`;
const ROW = 36;

const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid .salmon-data-grid-rows [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const rowEl = (page: Page, rowId: string) => page.locator(`.salmon-data-grid .salmon-data-grid-rows [data-row-id="${rowId}"]`);
const value = (page: Page, rowId: string, field: string) => page.evaluate(([r, f]) => (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.[f], [rowId, field] as const);

test.describe('batch editing with virtualization', () => {
  test('dirty cells and an open editor keep their drafts when scrolled out and back in', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, BATCH);
    await cell(page, 'r1', 's1').click();
    await page.keyboard.press('F2');
    const input = cell(page, 'r1', 's1').locator('input');
    await expect(input).toBeFocused();
    await input.fill('draft-1');
    await page.keyboard.press('Enter');
    await expect(cell(page, 'r2', 's1').locator('input')).toBeFocused();
    // The editor of r2 stays open while its row leaves the window.
    await cell(page, 'r2', 's1').locator('input').fill('open-2');
    await scrollViewport(page, ROW * 50_000, null);
    await expect(rowEl(page, 'r1')).toHaveCount(0);
    await expect(rowEl(page, 'r2')).toHaveCount(0);
    await scrollViewport(page, 0, null);
    await expect(cell(page, 'r1', 's1')).toHaveText('draft-1');
    await expect(cell(page, 'r1', 's1')).toHaveAttribute('data-dirty', '');
    await expect(cell(page, 'r2', 's1').locator('input')).toHaveValue('open-2');
    await cell(page, 'r2', 's1').locator('input').focus();
    await page.keyboard.press('Escape');
    // Escape restores the draft from before the editor opened (none): only r1 is changed.
    expect(await page.evaluate(() => window.__gridApi.getPendingChanges().changedRecords.length)).toBe(1);
    expect(problems).toEqual([]);
  });

  test('Enter and Tab move across the row and column windows, scrolling and keeping the editor focused', async ({ page }) => {
    await openGrid(page, BATCH);
    await cell(page, 'r5', 's1').click();
    await page.keyboard.press('F2');
    await page.keyboard.type('x');
    for (let i = 0; i < 40; i++) await page.keyboard.press('Enter');
    const down = cell(page, 'r45', 's1').locator('input');
    await expect(down).toBeFocused();
    await expect(down).toBeInViewport();
    await expect(rowEl(page, 'r5')).toHaveCount(0);
    // Column window: Tab 30 times from s0 passes the rendered center columns.
    await page.keyboard.press('Escape');
    await cell(page, 'r45', 's0').click();
    await page.keyboard.press('F2');
    for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
    const right = cell(page, 'r45', 's30').locator('input');
    await expect(right).toBeFocused();
    await expect(right).toBeInViewport();
    await expect(cell(page, 'r45', 's0')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // The r5 draft survived both window moves.
    await scrollViewport(page, 0, 0);
    await expect(cell(page, 'r5', 's1')).toHaveAttribute('data-dirty', '');
    expect(String(await page.evaluate(() => (window.__gridApi.getPendingChanges().changedRecords[0] as Record<string, unknown>)['s1']))).toMatch(/x$/);
  });

  test('added, deleted and changed rows outside the window save and cancel', async ({ page }) => {
    await openGrid(page, BATCH);
    const results = await page.evaluate(() => {
      const api = window.__gridApi;
      const out: string[] = [];
      out.push(api.updateCell('r50000', 's1', 'far away').status);
      out.push(api.updateCell('r99999', 'n4', '42').status);
      out.push(api.deleteRows(['r70000']).status);
      return out;
    });
    expect(results).toEqual(['applied', 'applied', 'applied']);
    // Delete marks and drafts render once the rows enter the window.
    await scrollViewport(page, ROW * 69_995, null);
    await expect(rowEl(page, 'r70000')).toHaveAttribute('data-deleted', '');
    await scrollViewport(page, ROW * 30_000, null);
    // An added row (sticky band) with its key, then the whole batch saves while none of the rows is rendered.
    await page.evaluate(() => {
      const api = window.__gridApi;
      api.addRow({ id: 'added-1', s1: 'added' });
    });
    await expect(page.locator('.salmon-data-grid-added-rows .salmon-data-grid-added-row')).toHaveCount(1);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__gridApi.save().status)).toBe('applied');
    await expect.poll(() => value(page, 'r50000', 's1')).toBe('far away');
    expect(await value(page, 'r99999', 'n4')).toBe(42);
    expect(await value(page, 'r70000', 's1')).toBeUndefined();
    expect(await value(page, 'added-1', 's1')).toBe('added');
    await expect(page.locator('.salmon-data-grid-added-rows .salmon-data-grid-added-row')).toHaveCount(0);
    // Cancel drops drafts of rows that are not rendered.
    await page.evaluate(() => window.__gridApi.updateCell('r60000', 's1', 'tmp'));
    expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(true);
    expect(await page.evaluate(() => window.__gridApi.cancelEdit().status)).toBe('applied');
    expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(false);
    expect(await value(page, 'r60000', 's1')).not.toBe('tmp');
  });
});

test.describe('batch editing scroll performance (production build)', () => {
  test('scrolling 100k x 100 with 1,000 dirty cells at 2,000 px/s: 0 blank frames, p95 <= 16.7 ms', { tag: '@perf' }, async ({ page }) => {
    await openGrid(page, `${PROD_URL}?rows=100000&cols=100&edit=batch`);
    // 1,000 dirty cells spread over the first 2,000 rows (the scrolled range).
    await page.evaluate(() => {
      for (let r = 0; r < 2000; r += 2) window.__gridApi.updateCell(`r${r}`, 's1', `v${r}`);
    });
    expect(await page.evaluate(() => window.__gridApi.getEditSnapshot().dirtyCellCount)).toBe(1000);
    await page.waitForTimeout(300);
    const result = await page.evaluate(
      () =>
        new Promise<{ frames: number; blank: number; p95: number; max: number; dropped: number }>((resolve) => {
          const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
          const header = (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect();
          const footer = document.querySelector('.salmon-data-grid-footer') as HTMLElement | null;
          const rect = vp.getBoundingClientRect();
          const top = header.bottom + 2;
          const bottom = (footer ? footer.getBoundingClientRect().top : rect.bottom) - 2;
          const x = rect.left + 300;
          const speed = 2000;
          const duration = 5000;
          const deltas: number[] = [];
          let blank = 0;
          let start = 0;
          let last = 0;
          const covered = (y: number): boolean => !!document.elementFromPoint(x, y)?.closest('.salmon-data-grid-rows [role="row"]');
          const step = (t: number): void => {
            if (!start) {
              start = t;
              last = t;
            } else {
              deltas.push(t - last);
              last = t;
              if (!covered(top) || !covered((top + bottom) / 2) || !covered(bottom)) blank++;
            }
            if (t - start >= duration) {
              const sorted = [...deltas].sort((a, b) => a - b);
              resolve({ frames: deltas.length, blank, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, max: sorted[sorted.length - 1] ?? 0, dropped: deltas.filter((d) => d > 25).length });
              return;
            }
            vp.scrollTop = ((t - start) / 1000) * speed;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
    );
    console.log(`[perf] batch-dirty scroll 2000px/s: frames=${result.frames} blank=${result.blank} p95=${result.p95.toFixed(2)}ms max=${result.max.toFixed(2)}ms dropped=${result.dropped}`);
    expectBudget(result.frames, 200, 'editing virtualization scroll frames', { atLeast: true, strict: true, unit: 'frames' });
    expect(result.blank).toBe(0);
    expectBudget(result.p95, 16.7 + 0.5, 'batch-dirty scroll 2000px/s frame p95');
    expectBudget(result.dropped / result.frames, 0.02, 'batch-dirty scroll 2000px/s dropped frame ratio', { unit: 'x' });
  });
});
