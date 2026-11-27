import { expect, test, type Page } from '@playwright/test';
import { installDevtools, openGrid, DEV_URL, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Scroll budget ("Frame time during 5 s horizontal scroll") with the
// fixed zone (`pinned: 'center'`): production build, 100k x 100,
// 1280 x 800 at DPR 2. Two fixed columns (s2 near the start, s30 beyond the
// first viewport) plus the start (id) and end (b99) pinned columns, so the
// run covers a fixed slot inside, left of and right of the rendered column
// window. Same method as the stacked-header run in chrome-perf.spec.ts.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;

type Run = { frames: number; blank: number; p95: number; max: number; dropped: number };

/** Ping-pong horizontal scroll at 2,000 px/s for 5 s; frame deltas and frames with a sampled point not on a cell. */
const scroll = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Run>((resolve) => {
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const rect = vp.getBoundingClientRect();
        const headerRow = (document.querySelector('.salmon-data-grid-header [role="row"]') as HTMLElement).getBoundingClientRect();
        const bodyY = headerRow.bottom + 20;
        const xs: number[] = [];
        for (let x = rect.left + 4; x < rect.left + vp.clientWidth - 4; x += 61) xs.push(x);
        const max = vp.scrollWidth - vp.clientWidth;
        const speed = 2000;
        const duration = 5000;
        const deltas: number[] = [];
        let blank = 0;
        let start = 0;
        let last = 0;
        const covered = (): boolean => {
          for (const x of xs) {
            if (!document.elementFromPoint(x, bodyY)?.closest('.salmon-data-grid-cell')) return false;
            if (!document.elementFromPoint(x, headerRow.top + headerRow.height / 2)?.closest('.salmon-data-grid-header-cell')) return false;
          }
          return true;
        };
        const step = (t: number): void => {
          if (!start) {
            start = t;
            last = t;
          } else {
            deltas.push(t - last);
            last = t;
            if (!covered()) blank++;
          }
          if (t - start >= duration) {
            const sorted = [...deltas].sort((a, b) => a - b);
            resolve({ frames: deltas.length, blank, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, max: sorted[sorted.length - 1] ?? 0, dropped: deltas.filter((d) => d > 25).length });
            return;
          }
          const d = ((t - start) / 1000) * speed;
          const lap = Math.floor(d / max);
          vp.scrollLeft = lap % 2 ? max - (d % max) : d % max;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );

test.describe('fixed zone scroll budgets', () => {
  test('horizontal scroll at 2,000 px/s for 5 s on 100k x 100 with two fixed columns: p95 frame <= 16.7 ms, dropped <= 2 %, 0 blank frames', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?fixedCols=s2,s30&frozenRight`);
    await page.waitForTimeout(300);
    expect(await page.locator('.salmon-data-grid-header .salmon-data-grid-fixed').count()).toBe(2);
    await scroll(page); // warm-up
    const result = await scroll(page);
    console.log(`[perf] fixed zone horizontal scroll 2000px/s: ${JSON.stringify({ ...result, p95: round(result.p95), max: round(result.max), droppedPct: round((100 * result.dropped) / result.frames) })}`);
    expectBudget(result.frames, 200, 'fixed zone horizontal scroll 2000px/s frames', { atLeast: true, strict: true, unit: 'frames' });
    expect(result.blank).toBe(0);
    expectBudget(result.p95, 16.7 + 0.5, 'fixed zone horizontal scroll 2000px/s frame p95');
    expectBudget(result.dropped / result.frames, 0.02, 'fixed zone horizontal scroll 2000px/s dropped frame ratio', { unit: 'x' });
  });

  test('React commits only on frames where the rendered column window changes; fixed cells stay mounted (development build)', async ({ page }) => {
    await installDevtools(page);
    await openGrid(page, `${DEV_URL}?rows=100000&fixedCols=s2,s30&frozenRight`);
    await page.waitForTimeout(300);
    const run = await page.evaluate(
      () =>
        new Promise<{ frames: number; commits: number; windowChanges: number; fixedRemounts: number }>((resolve) => {
          const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
          const fixedCell = () => document.querySelector('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-fixed .salmon-data-grid-cell[data-column-id="s2"]');
          const before = fixedCell();
          let fixedRemounts = 0;
          const range = () => JSON.stringify(window.__gridApi.getRenderedRange().columns);
          let prev = range();
          let windowChanges = 0;
          const c0 = window.__commits.length;
          let frames = 0;
          const step = (): void => {
            frames++;
            vp.scrollLeft += 33;
            requestAnimationFrame(() => {
              const now = range();
              if (now !== prev) windowChanges++;
              prev = now;
              if (fixedCell() !== before) fixedRemounts++;
              if (frames < 90) step();
              else resolve({ frames, commits: window.__commits.length - c0, windowChanges, fixedRemounts });
            });
          };
          step();
        }),
    );
    console.log(`[perf] fixed zone horizontal scroll commits: ${JSON.stringify(run)}`);
    expect(run.commits).toBeLessThanOrEqual(run.windowChanges);
    expect(run.fixedRemounts).toBe(0);
  });
});
