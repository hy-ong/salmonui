import { expect, test, type Page } from '@playwright/test';
import { openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Data Visualization timing budgets on the production build
// (examples/vite-spa/viz-families.html, 1280 x 800, DPR 2):
//
// - 500 `Sparkline`s in Data Grid cells (two sparkline columns, 500 rows),
//   vertical scroll at 2,000 px/s for 5 s: the Data Grid "Scroll" budgets
//   unchanged (p95 frame <= 16.7 ms + 0.5 ms vsync slack, dropped <= 2 %,
//   0 blank frames, scroll handler p95 <= 1 ms). The `sparklines in grid`
//   `bench` core path (tooling/bench/core-paths.mjs).
// - `HeatMap` 1,000 x 1,000 cells on the canvas renderer: mount to the first
//   frame with the canvas drawn (lazy chunk included) <= 200 ms, best of 3.
//
// Frame and blank sampling follow tests/browser/scroll-perf.spec.ts: rAF
// deltas, a frame is dropped over 25 ms, and a frame is blank when a sample
// point of the body does not hit a rendered cell in the rAF after the step.

test.describe.configure({ retries: 1 });

interface ScrollResult {
  frames: number;
  blank: number;
  p50: number;
  p95: number;
  max: number;
  dropped: number;
  distance: number;
  handlerP95: number;
  scrollEvents: number;
  sparklines: number;
}

async function instrumentScroll(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __scrollMs: number[] };
    w.__scrollMs = [];
    const add = EventTarget.prototype.addEventListener;
    let last: Event | null = null;
    EventTarget.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      if (type !== 'scroll' || !listener) return add.call(this, type, listener, options);
      const fn = function (this: unknown, event: Event) {
        const t = performance.now();
        if (typeof listener === 'function') listener.call(this, event);
        else listener.handleEvent(event);
        if (event === last) w.__scrollMs[w.__scrollMs.length - 1]! += performance.now() - t;
        else w.__scrollMs.push(performance.now() - t);
        last = event;
      };
      return add.call(this, type, fn, options);
    };
  });
}

function scroll(page: Page, speed: number, duration: number): Promise<ScrollResult> {
  return page.evaluate(
    ([pxPerS, ms]) =>
      new Promise<ScrollResult>((resolve) => {
        const w = window as unknown as { __scrollMs: number[] };
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const rect = vp.getBoundingClientRect();
        const header = (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect();
        // The five columns are narrower than the viewport: sample up to the last header cell.
        const cells = [...document.querySelectorAll('.salmon-data-grid-header [role="columnheader"]')].map((c) => c.getBoundingClientRect().right);
        const right = Math.min(rect.left + vp.clientWidth, Math.max(rect.left + 100, ...cells)) - 8;
        const points: [number, number][] = [];
        for (let y = header.bottom + 4; y < rect.top + vp.clientHeight - 4; y += 36) for (let x = rect.left + 8; x < right; x += 75) points.push([x, y]);
        const covered = () => points.every(([x, y]) => document.elementFromPoint(x, y)?.closest('.salmon-data-grid-rows .salmon-data-grid-cell'));
        w.__scrollMs.length = 0;
        const top0 = vp.scrollTop;
        const deltas: number[] = [];
        let blank = 0;
        let start = 0;
        let last = 0;
        let sparklines = 0;
        const step = (t: number): void => {
          if (!start) start = last = t;
          else {
            deltas.push(t - last);
            last = t;
            if (!covered()) blank++;
            sparklines = Math.max(sparklines, document.querySelectorAll('.salmon-data-grid-rows .salmon-sparkline').length);
          }
          if (t - start >= ms) {
            const sorted = [...deltas].sort((a, b) => a - b);
            const handler = [...w.__scrollMs].sort((a, b) => a - b);
            const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(xs.length * p) - 1))] ?? 0;
            resolve({ frames: deltas.length, blank, p50: pct(sorted, 0.5), p95: pct(sorted, 0.95), max: sorted.at(-1) ?? 0, dropped: deltas.filter((d) => d > 25).length, distance: Math.abs(vp.scrollTop - top0), handlerP95: pct(handler, 0.95), scrollEvents: handler.length, sparklines });
            return;
          }
          vp.scrollTop = top0 + ((t - start) / 1000) * pxPerS;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    [speed, duration] as const,
  );
}

const r2 = (v: number) => Math.round(v * 100) / 100;

test.describe('Data Visualization timing (production build)', () => {
  test('500 sparklines in Data Grid cells: vertical scroll at 2,000 px/s keeps the grid scroll budgets', async ({ page }) => {
    await instrumentScroll(page);
    await openGrid(page, `${PROD_URL}viz-families.html?case=spark-grid&rows=500`);
    await page.waitForTimeout(300);
    const rows = await page.evaluate(() => Number(document.querySelector('[role="grid"]')?.getAttribute('aria-rowcount') ?? 0));
    expect(rows).toBeGreaterThanOrEqual(500);
    await scroll(page, 2000, 1000); // warm-up
    await page.evaluate(() => ((document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop = 0));
    const r = await scroll(page, 2000, 5000);
    console.log(`[perf] sparkline grid scroll 2000px/s: p50=${r2(r.p50)}ms p95=${r2(r.p95)}ms max=${r2(r.max)}ms handlerP95=${r2(r.handlerP95)}ms (frames ${r.frames}, blank ${r.blank}, dropped ${r.dropped}, scroll events ${r.scrollEvents}, distance ${Math.round(r.distance)} px, sparklines in view ${r.sparklines})`);
    expect(r.sparklines, 'sparklines rendered in the viewport').toBeGreaterThan(20);
    expectBudget(r.frames, 200, 'sparkline grid scroll frames', { atLeast: true, strict: true, unit: 'frames' });
    expect(r.blank, 'blank frames').toBe(0);
    expectBudget(r.p95, 16.7 + 0.5, 'sparkline grid scroll p95 frame');
    expectBudget(r.dropped / r.frames, 0.02, 'sparkline grid scroll dropped share', { unit: 'x' });
    expectBudget(r.handlerP95, 1, 'sparkline grid scroll handler p95');
    expectBudget(r.distance, 9000, 'sparkline grid scroll distance', { atLeast: true, strict: true, unit: 'px' });
  });

  test('HeatMap 1,000 x 1,000 cells on canvas: mount to drawn <= 200 ms', async ({ page }) => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i++) {
      await page.goto(`${PROD_URL}viz-families.html?case=heat-big`);
      await page.waitForFunction(() => window.__vizMountMs !== undefined, undefined, { timeout: 30_000 });
      best = Math.min(best, await page.evaluate(() => window.__vizMountMs as number));
    }
    await expect(page.locator('#heat-big')).toHaveAttribute('data-renderer', 'canvas');
    expect(await page.locator('#heat-big .salmon-heat-map-cell').count()).toBe(0);
    console.log(`[perf] heat map 1000x1000 canvas mount: ${r2(best)}ms`);
    expectBudget(best, 200, 'heat map 1000x1000 canvas mount');
  });
});
