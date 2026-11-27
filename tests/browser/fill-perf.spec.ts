import { expect, test, type Page } from '@playwright/test';
import { openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Autofill timing (interaction budgets), production
// build of the 100k x 100 fixture with cell selection, the fill handle, and
// cell (commit) or batch (draft) editing:
// - Fill handle drag frame: the drag does its work in one animation frame per
//   pointer move (hit test, constrain, auto-scroll, preview write); every rAF
//   callback is wrapped and timed (same method as the row drag frame in
//   hierarchy.spec.ts). Budget: the pointer-drag frame budget, <= 4 ms p95.
//   0 React commits while dragging is asserted in clipboard.spec.ts
//   (development build).
// - `api.fillSelection` over 10,000 rows (a 1 x 10 source tiled to
//   10,000 x 10, 99,990 written cells) from the call to the painted frame
//   that shows the filled values: <= 500 ms, the "Autofill over 10,000 rows"
//   budget.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;
const URL_OF = (mode: 'cell' | 'batch') => `${PROD_URL}?sel=cell&cellMode=box&edit=${mode}&efill`;
const select = (page: Page, a: [string, string], b: [string, string]) =>
  page.evaluate(([x, y]) => window.__gridApi.selectCellRange({ rowId: x[0], field: x[1] }, { rowId: y[0], field: y[1] }), [a, b] as const);

test.describe('autofill timing (production build)', () => {
  test('fill handle drag frame: main thread <= 4 ms p95', async ({ page }) => {
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
    await openGrid(page, URL_OF('cell'));
    await select(page, ['r1', 's1'], ['r2', 's3']);
    const handle = page.locator('.salmon-data-grid .salmon-data-grid-fill-handle');
    await expect(handle).toHaveCount(1);
    const box = (await handle.boundingBox())!;
    const vp = (await page.locator('.salmon-data-grid-viewport').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 2 });
    await page.evaluate(() => ((window as unknown as { __rafMs: number[] }).__rafMs = []));
    // 60 moves inside the body (down, then across), no auto-scroll band.
    for (let i = 0; i < 60; i++) await page.mouse.move(box.x + (i % 20) * 6, Math.min(vp.y + vp.height - 80, box.y + 20 + i * 6));
    const samples = await page.evaluate(() => (window as unknown as { __rafMs: number[] }).__rafMs.slice());
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-fill-preview')).toHaveAttribute('data-visible', '');
    await page.mouse.up();
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length / 2)] ?? 0;
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
    console.log(`[perf] fill handle drag frame: p50=${round(p50)}ms p95=${round(p95)}ms (${samples.length} frames)`);
    expectBudget(samples.length, 10, 'fill handle drag frames', { atLeast: true, strict: true, unit: 'frames' });
    expectBudget(p95, 4, 'fill handle drag frame p95');
  });

  for (const mode of ['batch', 'cell'] as const) {
    test(`fillSelection over 10,000 rows (1 x 10 to 10,000 x 10, ${mode} mode) to painted <= 500 ms`, async ({ page }) => {
      await openGrid(page, URL_OF(mode));
      const fill = (round: number) =>
        page.evaluate(
          (r) =>
            new Promise<{ ms: number; status: string }>((resolve) => {
              const api = window.__gridApi;
              api.setCellValue('r0', 's1', `fill-${r}`);
              api.selectCellRange({ rowId: 'r0', field: 's1' }, { rowId: 'r0', field: 's10' });
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const t0 = performance.now();
                  const result = api.fillSelection('r9999', 's10');
                  const check = (): void => {
                    const cell = document.querySelector('.salmon-data-grid-rows [data-row-id="r5"] .salmon-data-grid-cell[data-column-id="s1"]');
                    const source = document.querySelector('.salmon-data-grid-rows [data-row-id="r0"] .salmon-data-grid-cell[data-column-id="s1"]');
                    if (cell && source && cell.textContent === source.textContent) {
                      void document.body.offsetHeight;
                      const ch = new MessageChannel();
                      ch.port1.onmessage = () => resolve({ ms: performance.now() - t0, status: result.status });
                      ch.port2.postMessage(0);
                    } else setTimeout(check, 0);
                  };
                  queueMicrotask(check);
                }),
              );
            }),
          round,
        );
      const first = await fill(0); // warm-up
      expect(first.status).toBe('applied');
      if (mode === 'cell') expect(await page.evaluate(() => window.__gridApi.getRowInfo('r9999')?.row?.['s1'])).toBe('fill-0');
      else expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(true);
      const samples: number[] = [];
      for (let i = 1; i <= 3; i++) {
        if (mode === 'batch') await page.evaluate(() => window.__gridApi.cancelEdit());
        samples.push((await fill(i)).ms);
      }
      samples.sort((a, b) => a - b);
      console.log(`[perf] fillSelection 10,000 x 10 (${mode} mode) to painted: median=${round(samples[1] as number)}ms max=${round(samples[2] as number)}ms`);
      expectBudget(samples[1] as number, 500, `fillSelection 10,000 x 10 (${mode} mode) to painted median`);
    });
  }
});
