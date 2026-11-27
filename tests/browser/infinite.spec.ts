import { expect, test, type Page } from '@playwright/test';
import type { DataGridApi } from '@salmonui/data-grid';
import { collectProblems, DEV_URL, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Infinite scroll gates (examples/vite-spa/infinite.html): loading rows, range reads per scroll distance, stale aborts,
// scroll frame time while reads are in flight, keyboard focus onto unloaded
// rows, selection and editing of loaded rows, errors and retry.

async function open(page: Page, base: string, query = ''): Promise<void> {
  await page.goto(`${base}infinite.html${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
  await page.waitForSelector('.salmon-data-grid-row[data-row-id="r0"]');
}

const reads = (page: Page) => page.evaluate(() => window.__reads.map((r) => ({ ...r })));

/** Scrolls row `index` to the top (the 1M-row scroll range is compressed, so offsets are not index x 36). */
async function scrollToIndex(page: Page, index: number): Promise<void> {
  await page.evaluate((i) => {
    const api = window.__gridApi as DataGridApi<unknown>;
    api.scrollToRow(api.getRowInfo(`r${i}`) ? `r${i}` : `__loading:${i}`, { align: 'start' });
  }, index);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test.describe('infinite scroll', () => {
  test('loads the initial blocks, shows loading rows, and reads about one block per block scrolled', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, DEV_URL, 'delay=30');
    const initial = await reads(page);
    expect(initial[0]).toMatchObject({ start: 0, end: 300 });
    expect(await page.locator('[role="grid"]').getAttribute('aria-rowcount')).toBe('1000001');
    // Scroll 20,000 rows in viewport-sized steps, letting reads land.
    for (let i = 0; i <= 20_000; i += 40) await scrollToIndex(page, i);
    await page.waitForTimeout(300);
    const all = await reads(page);
    const issued = all.length - initial.length;
    expect(issued).toBeLessThanOrEqual(Math.ceil(20_000 / 100) + 4);
    for (const r of all) expect(r.end - r.start).toBeLessThanOrEqual(300);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r20000"]')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('a jump costs one read; reads for rows scrolled past are aborted; placeholders show until the block lands', async ({ page }) => {
    // `hold`: reads stay pending until the test releases them, so the
    // placeholders and the in-flight abort are observed without a timer race.
    await open(page, DEV_URL, 'hold&delay=20');
    const before = (await reads(page)).length;
    // A drag across the scrollbar: many positions in quick succession (one per frame).
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const api = window.__gridApi as DataGridApi<unknown>;
          let i = 0;
          const step = () => {
            api.scrollToRow(`__loading:${100_000 + i * 20_000}`, { align: 'start' });
            if (++i < 20) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        }),
    );
    await expect(page.locator('.salmon-data-grid-loading-row').first()).toBeVisible();
    await expect(page.locator('.salmon-data-grid-loading-row').first()).toHaveAttribute('aria-busy', 'true');
    const target = 100_000 + 19 * 20_000;
    await expect.poll(async () => (await reads(page)).some((r) => r.start <= target && r.end > target && !r.aborted)).toBe(true);
    await page.evaluate(() => window.__releaseReads?.());
    await expect(page.locator(`.salmon-data-grid-row[data-row-id="r${target + 2}"]`)).toBeVisible();
    const after = await reads(page);
    expect(after.length - before).toBeLessThanOrEqual(2);
    // Jump away while a read is in flight (held): it is aborted.
    const inRange = (r: { start: number }) => r.start >= 899_000 && r.start <= 900_100;
    await scrollToIndex(page, 900_000);
    await expect.poll(async () => (await reads(page)).some(inRange)).toBe(true);
    await scrollToIndex(page, 50_000);
    await expect.poll(async () => (await reads(page)).some((r) => inRange(r) && r.aborted)).toBe(true);
  });

  test('scroll frames stay within budget while reads are in flight (production build)', { tag: '@perf' }, async ({ page }) => {
    await open(page, PROD_URL, 'delay=600&cache=6');
    const result = await page.evaluate(
      () =>
        new Promise<{ p95: number; frames: number; handlerP95: number; inflightFrames: number }>((resolve) => {
          const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
          const frames: number[] = [];
          const handler: number[] = [];
          let last = 0;
          let inflight = 0;
          const t0 = performance.now();
          const tick = (ts: number) => {
            if (last) frames.push(ts - last);
            last = ts;
            const a = performance.now();
            vp.scrollTop += 2000 / 60;
            vp.dispatchEvent(new Event('scroll'));
            handler.push(performance.now() - a);
            if (window.__reads.some((r) => !r.aborted && performance.now() - r.at < 600)) inflight++;
            if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
            else {
              const pct = (xs: number[], p: number) => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)] as number;
              resolve({ p95: pct(frames, 95), frames: frames.length, handlerP95: pct(handler, 95), inflightFrames: inflight });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`[perf] infinite scroll 2000px/s with reads in flight: frame p95 ${result.p95.toFixed(2)} ms, scroll handler p95 ${result.handlerP95.toFixed(3)} ms, ${result.inflightFrames}/${result.frames} frames with a read in flight`);
    expectBudget(result.inflightFrames / result.frames, 0.25, 'infinite scroll share of frames painted while a read is in flight', { atLeast: true, strict: true, unit: 'x' });
    expectBudget(result.handlerP95, 1, 'infinite scroll 2000px/s scroll handler p95');
    expectBudget(result.p95, 17.5, 'infinite scroll 2000px/s frame p95');
  });

  test('ArrowDown past the loaded end of an unknown total loads the block, then focuses its first row', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, DEV_URL, 'unknown&delay=400&block=50');
    // 150 loaded rows, one loading row, the header row.
    expect(await page.locator('[role="grid"]').getAttribute('aria-rowcount')).toBe('152');
    await page.evaluate(() => window.__gridApi?.focusCell('r149', 'name'));
    await page.keyboard.press('ArrowDown');
    // Focus sits on the loading row until the block lands, then follows the row.
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r150"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (document.activeElement?.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'])).toBe('r150');
    expect(await page.locator('[role="grid"]').getAttribute('aria-rowcount')).toBe('202');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => (document.activeElement?.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'])).toBe('r151');
    expect(problems).toEqual([]);
  });

  test('Ctrl+End to an unloaded last row loads it and focuses it', async ({ page }) => {
    await open(page, DEV_URL, 'delay=60');
    await page.evaluate(() => window.__gridApi?.focusCell('r0', 'name'));
    await page.keyboard.press('Control+End');
    await expect.poll(() => page.evaluate(() => (document.activeElement?.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'])).toBe('r999999');
  });

  test('selects and edits loaded rows; a write echo updates the cell', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, DEV_URL, 'edit&delay=20');
    await page.locator('.salmon-data-grid-row[data-row-id="r3"] .salmon-data-grid-cell[data-column-id="city"]').click();
    expect(await page.evaluate(() => window.__gridApi?.getSelectedRowIds())).toEqual(['r3']);
    await page.evaluate(() => window.__gridApi?.updateCell('r3', 'name', 'Edited name'));
    await page.evaluate(() => window.__gridApi?.save());
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r3"] .salmon-data-grid-cell[data-column-id="name"]')).toHaveText('Edited name');
    expect(problems).toEqual([]);
  });

  test('adds a row at the bottom: it shows in the bottom band, lands after the last row and the row count grows', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, DEV_URL, 'add&total=450&delay=20');
    expect(await page.locator('[role="grid"]').getAttribute('aria-rowcount')).toBe('451');
    await scrollToIndex(page, 449);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r449"]')).toBeVisible();
    const before = (await reads(page)).length;
    expect(await page.evaluate(() => window.__gridApi?.addRow({ id: 'draft', name: 'Added at the bottom', city: 'Lyon', amount: 5 }).status)).toBe('applied');
    // The unsaved row renders in the sticky band at the bottom edge of the body.
    const band = page.locator('.salmon-data-grid-added-rows--bottom .salmon-data-grid-added-row');
    await expect(band).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-added-rows--top')).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi?.save().status)).toBe('applied');
    await page.evaluate(() => window.__gridApi?.whenEditSettled());
    // The server appended it as row 450: the visible blocks re-read in full and it lands after r449.
    const added = page.locator('.salmon-data-grid-row[data-row-id="r450"]');
    await expect(added.locator('.salmon-data-grid-cell[data-column-id="name"]')).toHaveText('Added at the bottom');
    await expect(band).toHaveCount(0);
    expect(await page.locator('[role="grid"]').getAttribute('aria-rowcount')).toBe('452');
    expect(await added.getAttribute('aria-rowindex')).toBe('452');
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r449"]')).toBeVisible();
    const after = (await reads(page)).slice(before);
    expect(after.length).toBeGreaterThanOrEqual(1);
    // Only the blocks around the viewport are re-read (not from row 0), and the re-read reaches past the old end.
    for (const r of after) expect(r.start).toBeGreaterThanOrEqual(300);
    expect(Math.max(...after.map((r) => r.end))).toBeGreaterThanOrEqual(451);
    // No loading rows remain in the viewport.
    await expect(page.locator('.salmon-data-grid-loading-row')).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi?.engine.infiniteScroll?.getStatus().totalRowCount)).toBe(451);
    expect(problems).toEqual([]);
  });

  test('a failed block shows a retry row; retry loads it', async ({ page }) => {
    await open(page, DEV_URL, 'fail&delay=20');
    await scrollToIndex(page, 5_000);
    await page.waitForTimeout(300);
    const row = page.locator('.salmon-data-grid-loading-row[data-status="error"][data-row-index="5001"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Block failed to load');
    await page.evaluate(() => {
      window.__fail = false;
    });
    await row.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r5002"]')).toBeVisible();
  });

  test('cache with maxBlocks bounds the rows held while scrolling', async ({ page }) => {
    await open(page, DEV_URL, 'cache=3&delay=10');
    for (let i = 0; i <= 10_000; i += 200) await scrollToIndex(page, i);
    await page.waitForTimeout(200);
    expect(await page.locator('.salmon-data-grid-rows .salmon-data-grid-row').count()).toBeLessThan(60);
    expect(await page.locator('[role="grid"]').getAttribute('aria-rowcount')).toBe('1000001');
    // Back to an evicted block: it is read again.
    const before = (await reads(page)).length;
    await scrollToIndex(page, 5_000);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r5001"]')).toBeVisible();
    expect((await reads(page)).length).toBeGreaterThan(before);
  });
});
