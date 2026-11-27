import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Pivot Table timing budgets that are not engine core paths (the other
// rows are asserted by tests/browser/pivot*.spec.ts) on the
// production build of examples/vite-spa/pivot.html with the 1,000,000-row
// `pivot` fixture (`?case=large`, pivot-fixture.ts; 100,000 distinct
// customers):
//
// - Initial render to first painted viewport (aggregation included) <= 1.8 s,
//   engine in a Worker (`&worker`): from the moment the fixture is generated
//   (before the first React render) to the frame after the first value cell is
//   in the DOM (`window.__pivotTimes.ready`). The main-thread engine is
//   measured as well (reported, not gated).
// - Scroll the result at 2,000 px/s: the Data Grid scroll budgets (0 blank
//   frames, p95 frame <= 16.7 ms; scroll-perf.spec.ts methodology: rAF
//   timestamp deltas gated at 16.7 + 0.5 ms, a frame is blank when a sample
//   point of the body does not hit a body cell) on 100,000 customer rows.
// - Open the field list <= 50 ms to painted.
// - Open the member editor for a field with 100,000 members <= 50 ms to
//   painted (its first member options in the DOM).
//
// "To painted": the action runs at the start of a frame (inside
// requestAnimationFrame); the end marker is a MessageChannel task posted from
// the first rAF callback in which the target is in the DOM, so it runs after
// that frame's style, layout and paint (interaction-perf.spec.ts).

test.describe.configure({ retries: 1 });

const URL = `${PROD_URL}pivot.html`;
const round = (v: number) => Math.round(v * 10) / 10;
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(0.95 * values.length) - 1)] as number;

declare global {
  interface Window {
    __pivot: any;
    __pivotApi: any;
    __pivotTimes: { start: number; ready?: number; generated?: number };
  }
}

async function firstPaint(page: Page, query: string): Promise<{ ready: number; generated: number }> {
  await page.goto(`${URL}?${query}`);
  await page.waitForFunction(() => window.__pivotTimes?.ready !== undefined, undefined, { timeout: 60_000 });
  return page.evaluate(() => ({ ready: window.__pivotTimes.ready as number, generated: window.__pivotTimes.generated as number }));
}

/** Runs `action` at a frame start; resolves with the time until the frame after `selector` matched is painted. */
function toPainted(page: Page, action: string, selector: string): Promise<number> {
  return page.evaluate(
    ([a, sel]) =>
      new Promise<number>((resolve, reject) => {
        requestAnimationFrame(() => {
          const t0 = performance.now();
          // biome-ignore lint/security/noGlobalEval: test-only action string
          (0, eval)(a);
          const check = (): void => {
            if (document.querySelector(sel)) {
              const ch = new MessageChannel();
              ch.port1.onmessage = () => resolve(performance.now() - t0);
              ch.port2.postMessage(0);
              return;
            }
            if (performance.now() - t0 > 10_000) reject(new Error(`${sel} not painted`));
            else requestAnimationFrame(check);
          };
          // Same frame first: a render flushed in this callback's microtasks is painted by this frame.
          queueMicrotask(() => {
            if (document.querySelector(sel)) {
              const ch = new MessageChannel();
              ch.port1.onmessage = () => resolve(performance.now() - t0);
              ch.port2.postMessage(0);
            } else requestAnimationFrame(check);
          });
        });
      }),
    [action, selector] as const,
  );
}

async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__pivot.closeDialog());
  await expect(page.locator('.salmon-pivot-table-dialog')).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

interface ScrollResult {
  frames: number;
  blank: number;
  p50: number;
  p95: number;
  max: number;
  dropped: number;
  distance: number;
}

/** scroll-perf.spec.ts `startMonitor` (programmatic input): per-frame scrollTop steps, frame intervals and blank sampling. */
function scroll(page: Page, speed: number, duration: number): Promise<ScrollResult> {
  return page.evaluate(
    ([pxPerS, ms]) =>
      new Promise<ScrollResult>((resolve) => {
        const vp = document.querySelector('.salmon-pivot-table .salmon-data-grid-viewport') as HTMLElement;
        const rect = vp.getBoundingClientRect();
        const header = (document.querySelector('.salmon-pivot-table .salmon-data-grid-header') as HTMLElement).getBoundingClientRect();
        const pinned = document.querySelector<HTMLElement>('.salmon-pivot-table .salmon-data-grid-rows .salmon-data-grid-pin--left');
        const left = (pinned ? pinned.getBoundingClientRect().right : rect.left) + 8;
        const top = header.bottom + 4;
        const right = Math.min(rect.left + vp.clientWidth - 8, left + 1200);
        const bottom = rect.top + vp.clientHeight - 4;
        const points: [number, number][] = [];
        for (let y = top; y < bottom; y += 36) for (let x = left; x < right; x += 150) points.push([x, y]);
        const covered = (): boolean => {
          for (const [x, y] of points) if (!document.elementFromPoint(x, y)?.closest('.salmon-data-grid-rows .salmon-data-grid-cell')) return false;
          return true;
        };
        const startTop = vp.scrollTop;
        const deltas: number[] = [];
        let blank = 0;
        let start = 0;
        let last = 0;
        const step = (t: number): void => {
          if (!start) {
            start = t;
            last = t;
          } else {
            deltas.push(t - last);
            last = t;
            if (!covered()) blank++;
          }
          if (t - start >= ms) {
            const sorted = [...deltas].sort((a, b) => a - b);
            const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))] ?? 0;
            resolve({ frames: deltas.length, blank, p50: pct(0.5), p95: pct(0.95), max: sorted[sorted.length - 1] ?? 0, dropped: deltas.filter((d) => d > 25).length, distance: Math.abs(vp.scrollTop - startTop) });
            return;
          }
          vp.scrollTop = startTop + ((t - start) / 1000) * pxPerS;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    [speed, duration] as const,
  );
}

const report = (name: string, r: ScrollResult) => `[perf] ${name}: p50=${round(r.p50)}ms p95=${round(r.p95)}ms max=${round(r.max)}ms (frames ${r.frames}, blank ${r.blank}, dropped ${r.dropped}, distance ${Math.round(r.distance)} px)`;

test.describe('pivot timing (production build, 1,000,000 rows)', () => {
  test('initial render to first painted viewport through a Worker <= 1.8 s', async ({ page }) => {
    const worker = await firstPaint(page, 'case=large&worker');
    console.log(`[perf] pivot first painted viewport, 1M rows, Worker: ${round(worker.ready)} ms (fixture generation ${round(worker.generated)} ms, not counted)`);
    const main = await firstPaint(page, 'case=large');
    console.log(`[perf] pivot first painted viewport, 1M rows, main thread (deferred compute): ${round(main.ready)} ms (reported, not gated)`);
    expectBudget(worker.ready, 1800, 'pivot first painted viewport, 1M rows, Worker');
  });

  test('scroll 100,000 result rows at 2,000 px/s: 0 blank frames, p95 frame <= 16.7 ms', async ({ page }) => {
    await firstPaint(page, 'case=large&worker&scroll');
    expect(await page.evaluate(() => window.__pivot.result.rowCount)).toBeGreaterThan(100_000);
    await page.waitForTimeout(300);
    await scroll(page, 2000, 1000); // warm-up
    await page.evaluate(() => ((document.querySelector('.salmon-pivot-table .salmon-data-grid-viewport') as HTMLElement).scrollTop = 0));
    await page.waitForTimeout(300);
    const worker = await scroll(page, 2000, 5000);
    console.log(report('pivot scroll 2000px/s, 100k rows, Worker', worker));
    await firstPaint(page, 'case=large&scroll');
    await page.waitForTimeout(300);
    await scroll(page, 2000, 1000);
    await page.evaluate(() => ((document.querySelector('.salmon-pivot-table .salmon-data-grid-viewport') as HTMLElement).scrollTop = 0));
    await page.waitForTimeout(300);
    const main = await scroll(page, 2000, 5000);
    console.log(report('pivot scroll 2000px/s, 100k rows, main thread', main));
    for (const [label, r] of [['worker', worker], ['main thread', main]] as const) {
      expectBudget(r.frames, 200, `pivot scroll ${label}: frames`, { atLeast: true, strict: true, unit: 'frames' });
      expectBudget(r.distance, 9000, `pivot scroll ${label}: distance`, { atLeast: true, strict: true, unit: 'px' });
      expect(r.blank, `${label}: blank frames`).toBe(0);
      expectBudget(r.p95, 16.7 + 0.5, `pivot scroll ${label}: p95 frame`);
    }
  });

  test('open the field list <= 50 ms to painted', async ({ page }) => {
    await firstPaint(page, 'case=large&worker');
    const action = 'window.__pivotApi.openFieldList()';
    const target = '.salmon-pivot-table-dialog [role="listbox"][aria-label="Rows"] [data-pivot-field]';
    // Warm-up: loads the dialogs chunk.
    await toPainted(page, action, target);
    await closeDialog(page);
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      times.push(await toPainted(page, action, target));
      await closeDialog(page);
    }
    console.log(`[perf] pivot open field list to painted: p95=${round(p95(times))}ms all=${times.map(round).join(',')}`);
    expectBudget(p95(times), 50, 'pivot open field list to painted p95');
  });

  test('open the member editor of a field with 100,000 members <= 50 ms to painted', async ({ page }) => {
    await firstPaint(page, 'case=large&worker');
    const members = await page.evaluate(async () => (await window.__pivot.getMembersAsync('customer')).length);
    expect(members).toBe(100_000);
    const action = "window.__pivot.openDialog({ kind: 'memberEditor', field: 'customer' })";
    const target = '.salmon-pivot-table-dialog .salmon-pivot-table-member-option';
    await toPainted(page, action, target);
    await closeDialog(page);
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      times.push(await toPainted(page, action, target));
      await closeDialog(page);
    }
    console.log(`[perf] pivot member editor (100,000 members) to painted, Worker: p95=${round(p95(times))}ms all=${times.map(round).join(',')}`);
    // Main-thread engine, reported.
    await firstPaint(page, 'case=large');
    await toPainted(page, action, target);
    await closeDialog(page);
    const main: number[] = [];
    for (let i = 0; i < 5; i++) {
      main.push(await toPainted(page, action, target));
      await closeDialog(page);
    }
    console.log(`[perf] pivot member editor (100,000 members) to painted, main thread: p95=${round(p95(main))}ms all=${main.map(round).join(',')}`);
    await expect(page.locator('.salmon-pivot-table')).toBeVisible();
    expectBudget(p95(times), 50, 'pivot member editor (100,000 members) to painted, Worker p95');
  });
});
