import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, installDevtools, PROD_URL, waitForGridReady } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Hierarchy browser gates (examples/vite-spa/hierarchy.html): detail rows
// over a virtualized 10k grid, child grids with a nested level, exports that
// include child rows (through the React export methods), and row drag and
// drop within a grid, into another grid, onto a custom element and by
// keyboard. Performance: detail expand render, child
// grid mount, and the drag frame cost with 0 React commits per drag frame.

const events = (page: Page) => page.evaluate(() => window.__events);

async function open(page: Page, base: string, query: string): Promise<void> {
  await page.goto(`${base}hierarchy.html?${query}`);
  await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
  await waitForGridReady(page);
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Rendered body rows of the root grid tile without gaps or overlaps (measured detail heights in the sparse metrics). */
async function rowsTile(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('#customers > .salmon-data-grid-viewport > .salmon-data-grid-body > .salmon-data-grid-rows > [role="row"]')];
    for (let i = 1; i < rows.length; i++) {
      const a = (rows[i - 1] as HTMLElement).getBoundingClientRect();
      const b = (rows[i] as HTMLElement).getBoundingClientRect();
      if (Math.abs(a.bottom - b.top) > 1) return false;
    }
    return rows.length > 0;
  });
}

test.describe('detail rows', () => {
  test('pointer and keyboard toggles, async load, events, measured heights while scrolling', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, DEV_URL, 'mode=detail&holdDetail=1');
    const row = page.locator('#customers [data-row-id="c3"]');
    await expect(row).toHaveAttribute('data-expanded', 'false');
    await row.locator('.salmon-data-grid-detail-toggle').click();
    await expect(row).toHaveAttribute('data-expanded', 'true');
    const detail = page.locator('#customers [data-row-id="__detail:c3"]');
    await expect(detail.locator('.detail-status')).toHaveText('loading');
    await page.evaluate(() => window.__releaseDetails?.());
    await expect(detail.locator('.detail-status')).toHaveText('Customer 3 lives in Oslo'.replace('Oslo', 'Kobe'));
    // The 220 px detail is measured; rows below move down without a gap.
    await expect.poll(() => rowsTile(page)).toBe(true);
    expect(await events(page)).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'beforeDetailToggle', rowId: 'c3', expanded: true }), expect.objectContaining({ type: 'detailToggle', rowId: 'c3', expanded: true, source: 'pointer' })]),
    );
    // The row is not selected by the toggle click.
    await expect(row).toHaveAttribute('aria-selected', 'false');
    // Keyboard: Enter on the toggle cell collapses; ArrowDown walks into the detail row.
    await row.locator('[data-column-id="__salmon_detail"]').focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('data-expanded', 'false');
    await page.keyboard.press('Space');
    await expect(row).toHaveAttribute('data-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => (document.activeElement?.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'])).toBe('__detail:c3');
    // Enter moves into the content; Escape returns to the detail row.
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Close');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('salmon-data-grid-detail-row__cell'))).toBe(true);
    // Ctrl+ArrowDown expands every detail; scrolling the 10k grid keeps the rows tiled.
    await page.keyboard.press('Control+ArrowDown');
    await expect(page.locator('#customers [data-row-id="c0"]')).toHaveAttribute('data-expanded', 'true');
    const vp = page.locator('#customers > .salmon-data-grid-viewport');
    for (const top of [5_000, 200_000, 900_000]) {
      await vp.evaluate((el, t) => {
        el.scrollTop = t;
      }, top);
      await frames(page);
      await frames(page);
      expect(await rowsTile(page)).toBe(true);
      expect(await page.locator('#customers .salmon-data-grid-detail-row').count()).toBeGreaterThan(0);
    }
    await page.keyboard.press('Control+ArrowUp');
    await expect(page.locator('#customers .salmon-data-grid-detail-row')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('detail expand render cost (production)', { tag: '@perf' }, async ({ page }) => {
    await open(page, PROD_URL, 'mode=detail');
    const times: number[] = [];
    for (const id of ['c1', 'c2', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']) {
      times.push(
        await page.evaluate(
          (rowId) =>
            new Promise<number>((resolve) => {
              const t0 = performance.now();
              window.__gridApi?.expandDetail(rowId);
              requestAnimationFrame(() => resolve(performance.now() - t0));
            }),
          id,
        ),
      );
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] as number;
    console.log(`[perf] detail expand to next frame: median ${median.toFixed(1)} ms, max ${(times.at(-1) as number).toFixed(1)} ms`);
    expectBudget(median, 16.7, 'detail expand to next frame median');
  });
});

test.describe('child grids', () => {
  test('nested child grids, inherited locale, focus in and out, export with child rows', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, DEV_URL, 'mode=child&rows=50');
    const before = await page.evaluate(async () => ((await window.__gridApi?.exportToExcel({ download: false })) as { data: Uint8Array }).data.byteLength);
    await page.locator('#customers [data-row-id="c1"] .salmon-data-grid-detail-toggle').click();
    const child = page.locator('[id="customers/c1"]');
    await expect(child).toHaveAttribute('role', 'grid');
    await expect(child.locator('.salmon-data-grid-rows > [data-row-id]')).toHaveCount(3);
    await expect(child.locator('[data-row-id="o1"] [data-column-id="total"]')).toHaveText('101,00');
    expect(await page.evaluate(() => window.__gridApi?.getChildGrid('c1')?.getViewRows().length)).toBe(3);
    // Nested level.
    await child.locator('[data-row-id="o1"] .salmon-data-grid-detail-toggle').click();
    const nested = page.locator('[id="customers/c1/o1"]');
    await expect(nested.locator('.salmon-data-grid-rows > [data-row-id]')).toHaveCount(2);
    // Keys inside the child grid stay there: ArrowDown moves the child's focus, not the parent's.
    await child.locator('[data-row-id="o51"] [data-column-id="orderId"]').click();
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => (document.activeElement?.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'])).toBe('__detail:o1');
    await page.keyboard.press('Escape');
    // Escape is not consumed by the nested selection: focus returns to the parent detail cell.
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (document.activeElement?.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'])).toBe('__detail:c1');
    // Export (expanded): the child rows are written.
    const after = await page.evaluate(async () => ((await window.__gridApi?.exportToExcel({ download: false })) as { data: Uint8Array }).data.byteLength);
    expect(after).toBeGreaterThan(before);
    // Collapse unmounts the child grid.
    await page.locator('#customers [data-row-id="c1"] .salmon-data-grid-detail-toggle').click();
    await expect(child).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi?.getChildGrid('c1'))).toBeNull();
    expect(problems).toEqual([]);
  });

  test('child grid mount cost (production)', { tag: '@perf' }, async ({ page }) => {
    await open(page, PROD_URL, 'mode=child&rows=50');
    const times: number[] = [];
    for (const id of ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']) {
      times.push(
        await page.evaluate(
          (rowId) =>
            new Promise<number>((resolve) => {
              window.__gridApi?.collapseAllDetails();
              const t0 = performance.now();
              window.__gridApi?.expandDetail(rowId);
              const wait = () => (document.getElementById(`customers/${rowId}`) ? requestAnimationFrame(() => resolve(performance.now() - t0)) : requestAnimationFrame(wait));
              wait();
            }),
          id,
        ),
      );
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] as number;
    console.log(`[perf] child grid mount to next frame: median ${median.toFixed(1)} ms, max ${(times.at(-1) as number).toFixed(1)} ms`);
    expectBudget(median, 50, 'child grid mount to next frame median');
  });
});

async function handleCenter(page: Page, grid: string, rowId: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(`#${grid} [data-row-id="${rowId}"] .salmon-data-grid-row-drag-handle`).boundingBox();
  if (!box) throw new Error(`no handle for ${rowId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function rowBox(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no box ${selector}`);
  return box;
}

const order = (page: Page, grid: string) => page.evaluate((g) => [...document.querySelectorAll<HTMLElement>(`#${g} .salmon-data-grid-rows > [data-row-id]`)].slice(0, 6).map((r) => r.dataset['rowId']), grid);

test.describe('row drag and drop', () => {
  test('reorder, cross-grid, custom target, cancel, keyboard; one event per frame and no React commits per drag frame', async ({ page }) => {
    const problems = collectProblems(page);
    await installDevtools(page);
    await open(page, DEV_URL, 'mode=drag&rows=40');
    // Reorder: drag c0 below c2.
    const from = await handleCenter(page, 'left', 'c0');
    const target = await rowBox(page, '#left [data-row-id="c2"]');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });
    const commitsAtStart = await page.evaluate(() => window.__commits.length);
    await page.mouse.move(from.x + 40, target.y + target.height * 0.8, { steps: 20 });
    await frames(page);
    await expect(page.locator('#left .salmon-data-grid-row-drop-indicator')).toHaveAttribute('data-visible', '');
    const dragCommits = await page.evaluate((s) => window.__commits.slice(s).length, commitsAtStart);
    expect(dragCommits, 'React commits during drag frames').toBe(0);
    await page.mouse.up();
    await expect.poll(() => order(page, 'left')).toEqual(['c1', 'c2', 'c0', 'c3', 'c4', 'c5']);
    const log = await events(page);
    const drags = log.filter((e) => e.type === 'rowDrag');
    expect(drags.length).toBeGreaterThan(0);
    expect(drags.length).toBeLessThanOrEqual(22);
    expect(log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'rowDragStart', rowIds: ['c0'] }),
        expect.objectContaining({ type: 'beforeRowDrop', rowIds: ['c0'], toIndex: 2, targetGridId: 'left' }),
        expect.objectContaining({ type: 'rowDrop', rowIds: ['c0'], toIndex: 2, targetGridId: 'left' }),
      ]),
    );
    // A cancelled drop keeps the order.
    await page.evaluate(() => {
      window.__cancelDrop = true;
    });
    const c1 = await handleCenter(page, 'left', 'c1');
    const c4 = await rowBox(page, '#left [data-row-id="c4"]');
    await page.mouse.move(c1.x, c1.y);
    await page.mouse.down();
    await page.mouse.move(c1.x, c4.y + c4.height * 0.8, { steps: 10 });
    await page.mouse.up();
    await frames(page);
    expect(await order(page, 'left')).toEqual(['c1', 'c2', 'c0', 'c3', 'c4', 'c5']);
    // Into the other grid: c3 moves from left to right.
    const c3 = await handleCenter(page, 'left', 'c3');
    const right = await rowBox(page, '#right .salmon-data-grid-viewport');
    await page.mouse.move(c3.x, c3.y);
    await page.mouse.down();
    await page.mouse.move(right.x + 100, right.y + 80, { steps: 15 });
    await page.mouse.up();
    await expect(page.locator('#right .salmon-data-grid-rows > [data-row-id="c3"]')).toHaveCount(1);
    await expect(page.locator('#left .salmon-data-grid-rows > [data-row-id="c3"]')).toHaveCount(0);
    expect(await events(page)).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'rowDrop', rowIds: ['c3'], targetGridId: 'right' })]));
    // Keyboard alternative: Alt+Shift+ArrowDown moves the focused row down one.
    await page.locator('#left [data-row-id="c1"] [data-column-id="name"]').click();
    await page.keyboard.press('Alt+Shift+ArrowDown');
    await expect.poll(() => order(page, 'left')).toEqual(['c2', 'c1', 'c0', 'c4', 'c5', 'c6']);
    expect(await page.evaluate(() => (document.activeElement?.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'])).toBe('c1');
    // API: moveRows.
    expect(await page.evaluate(() => window.__gridApi?.moveRows('c0', 0).status)).toBe('applied');
    await expect.poll(() => order(page, 'left')).toEqual(['c0', 'c2', 'c1', 'c4', 'c5', 'c6']);
    // Escape cancels a drag.
    const c5 = await handleCenter(page, 'left', 'c5');
    await page.mouse.move(c5.x, c5.y);
    await page.mouse.down();
    await page.mouse.move(c5.x, c5.y - 80, { steps: 5 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await order(page, 'left')).toEqual(['c0', 'c2', 'c1', 'c4', 'c5', 'c6']);
    expect(problems).toEqual([]);
  });

  test('drop onto a custom element and drag the selected rows', async ({ page }) => {
    await open(page, DEV_URL, 'mode=drag&rows=40&target=bin');
    await page.locator('#left [data-row-id="c1"] [data-column-id="name"]').click();
    await page.locator('#left [data-row-id="c2"] [data-column-id="name"]').click({ modifiers: ['ControlOrMeta'] });
    const c1 = await handleCenter(page, 'left', 'c1');
    const bin = await rowBox(page, '#bin');
    await page.mouse.move(c1.x, c1.y);
    await page.mouse.down();
    await page.mouse.move(bin.x + 40, bin.y + 40, { steps: 15 });
    await expect(page.locator('#left .salmon-data-grid-row-drag-preview__count')).toHaveText('2');
    await page.mouse.up();
    await expect(page.locator('#bin-count')).toHaveText('2');
    expect(await events(page)).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'rowDrop', rowIds: ['c1', 'c2'], targetGridId: null, target: 'bin' })]));
    await expect(page.locator('#left .salmon-data-grid-rows > [data-row-id="c1"]')).toHaveCount(1);
  });

  test('drag frame cost (production): main-thread time per frame', { tag: '@perf' }, async ({ page }) => {
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      (window as unknown as { __rafMs: number[] }).__rafMs = [];
      window.requestAnimationFrame = (cb) =>
        raf((t) => {
          const t0 = performance.now();
          cb(t);
          (window as unknown as { __rafMs: number[] }).__rafMs.push(performance.now() - t0);
        });
    });
    await open(page, PROD_URL, 'mode=drag&rows=2000');
    const from = await handleCenter(page, 'left', 'c0');
    const vp = await rowBox(page, '#left .salmon-data-grid-viewport');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });
    await page.evaluate(() => {
      (window as unknown as { __rafMs: number[] }).__rafMs = [];
    });
    for (let i = 0; i < 60; i++) await page.mouse.move(from.x + 20, vp.y + 60 + ((i * 7) % (vp.height - 120)));
    const samples = await page.evaluate(() => (window as unknown as { __rafMs: number[] }).__rafMs.slice());
    await page.mouse.up();
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
    console.log(`[perf] row drag frame: ${samples.length} frames, p50 ${(samples[Math.floor(samples.length / 2)] ?? 0).toFixed(2)} ms, p95 ${p95.toFixed(2)} ms`);
    expectBudget(samples.length, 10, 'detail row drag frames', { atLeast: true, strict: true, unit: 'frames' });
    expectBudget(p95, 4, 'row drag frame p95');
  });
});
