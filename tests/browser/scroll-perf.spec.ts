import { expect, test, type Page } from '@playwright/test';
import { openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Scroll budgets on the production build (1280 x 800, DPR 2,
// grid height 600, row height 36):
//
// - 5 s vertical scroll at 2,000 px/s on `large` (100k x 100), plain grid (no
//   grouping, no wrap): p95 frame <= one 60 Hz interval, dropped <= 2 %, 0
//   blank frames. Two inputs: programmatic `scrollTop` per frame (the
//   reference harness method) and real wheel input (Playwright `mouse.wheel`, compositor scrolling).
// - Scroll handler main-thread time <= 1 ms p95 per event: every `scroll`
//   listener is wrapped (init script) and the synchronous time of all listeners
//   of one event is recorded, for the real scroll events of the runs above.
// - 5 s horizontal scroll at 2,000 px/s on `wide` (10,000 x 500).
// - `api.scrollToRow` of the row at view index 90,000 to painted <= 50 ms.
// - Blank cells after a one-frame jump of one viewport: 0.
// - The same vertical gate with column and row spans (`?span&rowSpan`, row and
//   column virtualization on) and with a row template (`?rowTemplate`).
// - The horizontal gate under column virtualization with grouping, a row
//   template and expanded detail rows (`?group=s0&rowTemplate&detail`).
//
// Frame intervals are rAF timestamp deltas (quantized: one 60 Hz vsync reads
// 16.7-16.8 ms, gated at 16.7 + 0.5 ms); a dropped frame is an interval over
// 25 ms (1.5 vsyncs). A frame is blank when any sample point of the body
// (every 36 px down, every 150 px across, right of the pinned id column) does
// not hit a body cell; points are sampled in the rAF callback of the frame
// after each scroll step, so a cell counts only if it was rendered within one
// frame. The sampling forces a hit test per frame (the same cost for every
// renderer in the reference harness). Recorded reference medians
// (Chromium): V-scroll 2,000 px/s p95 16.8 ms, 0 dropped, 94.02 % blank
// frames (mask rows) or 0.33 % (without mask rows); H-scroll p95 16.7 ms,
// 91.71 % blank frames. Frame time is
// vsync-quantized at 60 Hz for both renderers, so 0.5 x the reference cannot be
// shown on frame time; the comparable difference is the blank frame share.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;

interface ScrollResult {
  frames: number;
  blank: number;
  p50: number;
  p95: number;
  max: number;
  dropped: number;
  distance: number;
  handlerP95: number;
  handlerMax: number;
  scrollEvents: number;
}

/** Wraps every `scroll` listener; the synchronous time of all listeners per scroll event lands in `window.__scrollMs`. */
async function instrumentScroll(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __scrollMs: number[] };
    w.__scrollMs = [];
    const wrapped = new WeakMap<object, EventListener>();
    let last: Event | null = null;
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      if (type !== 'scroll' || !listener) return add.call(this, type, listener, options);
      let fn = wrapped.get(listener);
      if (!fn) {
        fn = function (this: unknown, event: Event) {
          const t = performance.now();
          if (typeof listener === 'function') listener.call(this, event);
          else listener.handleEvent(event);
          // Per event: listeners of one dispatch run back to back and add up.
          if (event === last) w.__scrollMs[w.__scrollMs.length - 1]! += performance.now() - t;
          else w.__scrollMs.push(performance.now() - t);
          last = event;
        };
        wrapped.set(listener, fn);
      }
      return add.call(this, type, fn, options);
    };
    EventTarget.prototype.removeEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
      return remove.call(this, type, (listener && wrapped.get(listener)) ?? listener, options);
    };
  });
}

/** Installs the per-frame monitor (frame intervals, blank sampling); `axis` steps scroll per frame unless null (wheel). */
async function startMonitor(page: Page, axis: 'y' | 'x' | null, speed: number, duration: number): Promise<void> {
  await page.evaluate(
    ([ax, pxPerS, ms]) => {
      const w = window as unknown as { __scrollMs: number[]; __monitor: Promise<unknown>; __stopMonitor: () => void };
      const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
      const rect = vp.getBoundingClientRect();
      const header = (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect();
      const pinned = document.querySelector<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-pin--left');
      const left = (pinned ? pinned.getBoundingClientRect().right : rect.left) + 8;
      const top = header.bottom + 4;
      const right = rect.left + vp.clientWidth - 8;
      const bottom = rect.top + vp.clientHeight - 4;
      const points: [number, number][] = [];
      for (let y = top; y < bottom; y += 36) for (let x = left; x < right; x += 150) points.push([x, y]);
      const covered = (): boolean => {
        // Body cells, cells of pinned rows in the frozen row bands, and full-width
        // group captions and detail rows: a point on any of them is painted content.
        for (const [x, y] of points) if (!document.elementFromPoint(x, y)?.closest(':is(.salmon-data-grid-rows, .salmon-data-grid-frozen-rows) :is(.salmon-data-grid-cell, .salmon-data-grid-group-caption, .salmon-data-grid-detail-row)')) return false;
        return true;
      };
      w.__scrollMs.length = 0;
      const startTop = vp.scrollTop;
      const startLeft = vp.scrollLeft;
      let stop = false;
      w.__stopMonitor = () => (stop = true);
      w.__monitor = new Promise((resolve) => {
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
          if (stop || (ax !== null && t - start >= ms)) {
            const sorted = [...deltas].sort((a, b) => a - b);
            const handler = [...w.__scrollMs].sort((a, b) => a - b);
            const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(xs.length * p) - 1))] ?? 0;
            resolve({
              frames: deltas.length,
              blank,
              p50: pct(sorted, 0.5),
              p95: pct(sorted, 0.95),
              max: sorted[sorted.length - 1] ?? 0,
              dropped: deltas.filter((d) => d > 25).length,
              distance: Math.abs(vp.scrollTop - startTop) + Math.abs(vp.scrollLeft - startLeft),
              handlerP95: pct(handler, 0.95),
              handlerMax: handler[handler.length - 1] ?? 0,
              scrollEvents: handler.length,
            });
            return;
          }
          if (ax === 'y') vp.scrollTop = startTop + ((t - start) / 1000) * pxPerS;
          else if (ax === 'x') vp.scrollLeft = startLeft + ((t - start) / 1000) * pxPerS;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    [axis, speed, duration] as const,
  );
}

const finish = (page: Page) => page.evaluate(() => (window as unknown as { __monitor: Promise<ScrollResult> }).__monitor);

async function programmaticScroll(page: Page, axis: 'y' | 'x', speed = 2000, duration = 5000): Promise<ScrollResult> {
  await startMonitor(page, axis, speed, duration);
  return finish(page);
}

/** Real wheel input at about `speed` px/s for `duration` ms (one wheel event per ~16 ms). */
async function wheelScroll(page: Page, speed = 2000, duration = 5000): Promise<ScrollResult> {
  const box = (await page.locator('.salmon-data-grid-viewport').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await startMonitor(page, null, speed, duration);
  const t0 = Date.now();
  let sent = 0;
  while (Date.now() - t0 < duration) {
    const owed = Math.round(((Date.now() - t0) / 1000) * speed) - sent;
    if (owed > 0) {
      await page.mouse.wheel(0, owed);
      sent += owed;
    }
    await new Promise((r) => setTimeout(r, 16));
  }
  await page.evaluate(() => (window as unknown as { __stopMonitor: () => void }).__stopMonitor());
  return finish(page);
}

function report(name: string, r: ScrollResult): string {
  return `[perf] ${name}: p50=${round(r.p50)}ms p95=${round(r.p95)}ms max=${round(r.max)}ms handlerP95=${round(r.handlerP95)}ms handlerMax=${round(r.handlerMax)}ms (frames ${r.frames}, blank ${r.blank}, dropped ${r.dropped}, scroll events ${r.scrollEvents}, distance ${Math.round(r.distance)} px)`;
}

function expectSmooth(r: ScrollResult, label: string): void {
  expectBudget(r.frames, 200, `grid scroll ${label}: frames`, { atLeast: true, strict: true, unit: 'frames' });
  expect(r.blank, `${label}: blank frames`).toBe(0);
  expectBudget(r.p95, 16.7 + 0.5, `grid scroll ${label}: p95 frame`);
  expectBudget(r.dropped / r.frames, 0.02, `grid scroll ${label}: dropped share`, { unit: 'x' });
  expectBudget(r.scrollEvents, 100, `grid scroll ${label}: scroll events`, { atLeast: true, strict: true, unit: 'events' });
  expectBudget(r.handlerP95, 1, `grid scroll ${label}: scroll handler p95`);
}

/** `api.scrollToRow(id)` to the painted frame after the row is in the DOM, in ms. */
const scrollToRowPainted = (page: Page, id: string) =>
  page.evaluate(
    (rowId) =>
      new Promise<number>((resolve) => {
        const t0 = performance.now();
        window.__gridApi.scrollToRow(rowId, { align: 'start' });
        let done = false;
        const check = (): void => {
          if (done || !document.querySelector(`.salmon-data-grid-rows [data-row-id="${rowId}"] .salmon-data-grid-cell`)) return;
          done = true;
          obs.disconnect();
          requestAnimationFrame(() => {
            const ch = new MessageChannel();
            ch.port1.onmessage = () => resolve(performance.now() - t0);
            ch.port2.postMessage(0);
          });
        };
        const obs = new MutationObserver(check);
        obs.observe(document.querySelector('.salmon-data-grid-rows') as HTMLElement, { childList: true, subtree: true });
        const frame = (): void => {
          check();
          if (!done) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    id,
  );

test.describe('scroll timing (production build)', () => {
  test('vertical scroll at 2,000 px/s for 5 s on 100k x 100 (programmatic and wheel): p95 frame <= 16.7 ms, dropped <= 2 %, 0 blank, scroll handler p95 <= 1 ms', async ({ page }) => {
    await instrumentScroll(page);
    await openGrid(page, PROD_URL);
    await page.waitForTimeout(300);
    await programmaticScroll(page, 'y', 2000, 1000); // warm-up
    await page.evaluate(() => ((document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop = 0));
    const programmatic = await programmaticScroll(page, 'y');
    console.log(report('vertical scroll 2000px/s programmatic 100k x 100', programmatic));
    const wheel = await wheelScroll(page);
    console.log(report('vertical scroll 2000px/s wheel 100k x 100', wheel));
    expectSmooth(programmatic, 'programmatic');
    expectBudget(programmatic.distance, 9000, 'grid scroll programmatic: distance', { atLeast: true, strict: true, unit: 'px' });
    expectSmooth(wheel, 'wheel');
    // Wheel input is delivered in ~16 ms steps from the test process; at least 60 % of the nominal distance.
    expectBudget(wheel.distance, 6000, 'grid scroll wheel: distance', { atLeast: true, strict: true, unit: 'px' });
  });

  test('horizontal scroll at 2,000 px/s for 5 s on wide (10,000 x 500): p95 frame <= 16.7 ms, dropped <= 2 %, 0 blank, scroll handler p95 <= 1 ms', async ({ page }) => {
    await instrumentScroll(page);
    await openGrid(page, `${PROD_URL}?rows=10000&cols=500`);
    await page.waitForTimeout(300);
    const max = await page.evaluate(() => {
      const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
      return vp.scrollWidth - vp.clientWidth;
    });
    expect(max).toBeGreaterThan(20_000);
    await programmaticScroll(page, 'x', 2000, 1000); // warm-up
    await page.evaluate(() => ((document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollLeft = 0));
    const r = await programmaticScroll(page, 'x');
    console.log(report('horizontal scroll 2000px/s wide 10k x 500', r));
    expectSmooth(r, 'horizontal');
    expectBudget(r.distance, 9000, 'grid scroll horizontal: distance', { atLeast: true, strict: true, unit: 'px' });
  });

  test('scrollToRow(view index 90,000) to painted <= 50 ms', async ({ page }) => {
    await openGrid(page, PROD_URL);
    const jump = (id: string) => scrollToRowPainted(page, id);
    const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    // View index 90,000 is r90000 (no sort); alternate with a far row so every jump renders a new window.
    expect(await page.evaluate(() => window.__gridApi.getRowInfo('r90000')?.rowIndex)).toBe(90_000);
    for (let i = 0; i < 3; i++) {
      await jump('r90000');
      await jump('r1000');
    }
    const samples: number[] = [];
    for (let i = 0; i < 11; i++) {
      samples.push(await jump('r90000'));
      await settle();
      await jump(`r${1000 + i * 37}`);
      await settle();
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1] as number;
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] as number;
    console.log(`[perf] scrollToRow view index 90000 to painted: median=${round(median)}ms p95=${round(p95)}ms (samples ${sorted.map(round).join(', ')})`);
    expectBudget(p95, 50, 'scrollToRow view index 90000 to painted p95');
  });

  test('one-frame jump of one viewport: 0 blank frames (overscan and same-frame render cover it)', async ({ page }) => {
    await openGrid(page, PROD_URL);
    await page.waitForTimeout(300);
    const result = await page.evaluate(
      () =>
        new Promise<{ jumps: number; blank: number; lastTop: number }>((resolve) => {
          const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
          const rect = vp.getBoundingClientRect();
          const header = (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect();
          const pinned = document.querySelector<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-pin--left');
          const left = (pinned ? pinned.getBoundingClientRect().right : rect.left) + 8;
          const extent = vp.clientHeight - header.height;
          const points: [number, number][] = [];
          for (let y = header.bottom + 4; y < rect.top + vp.clientHeight - 4; y += 36) for (let x = left; x < rect.left + vp.clientWidth - 8; x += 150) points.push([x, y]);
          const covered = () => points.every(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.salmon-data-grid-rows .salmon-data-grid-cell'));
          let jumps = 0;
          let blank = 0;
          const step = (): void => {
            if (jumps > 0 && !covered()) blank++;
            if (jumps >= 40) return resolve({ jumps, blank, lastTop: vp.scrollTop });
            // Down for 30 jumps, then back up for 10 (both directions).
            vp.scrollTop += jumps < 30 ? extent : -extent;
            jumps++;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
    );
    console.log(`[perf] one-viewport jump per frame: ${JSON.stringify(result)}`);
    expect(result.blank).toBe(0);
    expect(result.lastTop).toBeGreaterThan(10_000);
  });

  test('vertical scroll with column and row spans under virtualization: p95 frame <= 16.7 ms, dropped <= 2 %, 0 blank, handler p95 <= 1 ms', async ({ page }) => {
    await instrumentScroll(page);
    await openGrid(page, `${PROD_URL}?span&rowSpan`);
    await page.waitForTimeout(300);
    expect(await page.locator('.salmon-data-grid-rows .salmon-data-grid-cell[aria-colspan="3"]').count()).toBeGreaterThan(0);
    expect(await page.locator('.salmon-data-grid-rows .salmon-data-grid-cell[aria-rowspan="3"]').count()).toBeGreaterThan(0);
    await programmaticScroll(page, 'y', 2000, 1000); // warm-up
    const vertical = await programmaticScroll(page, 'y');
    console.log(report('vertical scroll 2000px/s with spans', vertical));
    await page.evaluate(() => ((document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollLeft = 0));
    const horizontal = await programmaticScroll(page, 'x', 2000, 3000);
    console.log(report('horizontal scroll 2000px/s with spans', horizontal));
    expectSmooth(vertical, 'spans vertical');
    expect(horizontal.blank, 'spans horizontal: blank frames').toBe(0);
    expectBudget(horizontal.p95, 16.7 + 0.5, 'grid scroll spans horizontal: p95 frame');
    expectBudget(horizontal.dropped / horizontal.frames, 0.02, 'grid scroll spans horizontal: dropped share', { unit: 'x' });
  });

  test('vertical scroll with every detail row expanded, pinned rows and pinned columns: p95 frame <= 16.7 ms, dropped <= 2 %, 0 blank, handler p95 <= 1 ms', async ({ page }) => {
    await instrumentScroll(page);
    await openGrid(page, `${PROD_URL}?detail&pinRows=r3,r7&frozenCols=2&frozenRight`);
    await page.evaluate(() => window.__gridApi.expandAllDetails());
    await page.waitForTimeout(300);
    const rows = page.locator('.salmon-data-grid-rows');
    expect(await rows.locator('.app-detail').count()).toBeGreaterThan(3);
    // Pinned rows carry no detail toggle or detail row; the detail cell spans every column.
    await expect(page.locator('[data-row-id="__detail:r3"]')).toHaveCount(0);
    expect(await rows.locator('[data-row-id^="__detail:"] [role="gridcell"][aria-colspan]').count()).toBeGreaterThan(3);
    await programmaticScroll(page, 'y', 2000, 1000); // warm-up
    const r = await programmaticScroll(page, 'y');
    console.log(report('vertical scroll 2000px/s with detail rows, pinned rows and columns', r));
    expectSmooth(r, 'detail rows with pinned rows');
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r3"]')).toBeVisible();
  });

  test('vertical scroll with a row template (renderRow): p95 frame <= 16.7 ms, dropped <= 2 %, 0 blank, handler p95 <= 1 ms', async ({ page }) => {
    await instrumentScroll(page);
    await openGrid(page, `${PROD_URL}?rowTemplate`);
    await page.waitForTimeout(300);
    expect(await page.locator('.salmon-data-grid-rows [data-template][role="row"]').count()).toBeGreaterThan(10);
    await programmaticScroll(page, 'y', 2000, 1000); // warm-up
    const r = await programmaticScroll(page, 'y');
    console.log(report('vertical scroll 2000px/s with renderRow', r));
    expectSmooth(r, 'row template');
    // Rows stay virtualized: the template renders only the window.
    expect(await page.locator('.salmon-data-grid-rows [data-template]').count()).toBeLessThanOrEqual(30);
  });

  test('vertical scroll deep inside row spans that start far above the window: cold jump <= 50 ms, then p95 frame <= 16.7 ms, dropped <= 2 %, 0 blank, handler p95 <= 1 ms', async ({ page }) => {
    // `?longRowSpan`: s1 spans 20,000 rows from every 20,000th row; with `?span&rowSpan`, three span columns.
    await instrumentScroll(page);
    await openGrid(page, `${PROD_URL}?span&rowSpan&longRowSpan`);
    await page.waitForTimeout(300);
    // A cold jump: the anchor index scans the 90,000 rows above once.
    const cold = await scrollToRowPainted(page, 'r90000');
    const carried = () => page.evaluate(() => document.querySelector<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row .salmon-data-grid-cell[data-column-id="s1"]')?.dataset['rowId'] ?? null);
    expect(await carried()).toBe('r80000');
    // Scroll from row 30,000, 10,000 rows into a span.
    await page.evaluate(() => ((document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop = 36 * 30_000));
    await page.waitForTimeout(100);
    expect(await carried()).toBe('r20000');
    await programmaticScroll(page, 'y', 2000, 1000); // warm-up
    await page.evaluate(() => ((document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop = 36 * 30_000));
    const r = await programmaticScroll(page, 'y');
    console.log(`[perf] cold scrollToRow r90000 with long row spans: ${round(cold)}ms`);
    console.log(report('vertical scroll 2000px/s inside a 20,000-row span', r));
    expect(await carried()).toBe('r20000');
    expectBudget(cold, 50, 'cold scrollToRow r90000 with long row spans');
    expectSmooth(r, 'long row spans');
  });

  test('horizontal scroll under column virtualization with grouping, a row template and expanded detail rows: p95 frame <= 16.7 ms, dropped <= 2 %, 0 blank, handler p95 <= 1 ms', async ({ page }) => {
    await instrumentScroll(page);
    await openGrid(page, `${PROD_URL}?group=s0&rowTemplate&detail`);
    await page.waitForTimeout(300);
    // Expand the detail rows of the rendered data rows: captions, template rows and detail rows share the viewport.
    await page.evaluate(() => {
      const ids = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows [data-template][role="row"]')].map((r) => r.dataset['rowId'] as string);
      for (const id of ids.slice(0, 6)) window.__gridApi.expandDetail(id);
    });
    await page.waitForTimeout(100);
    expect(await page.locator('.salmon-data-grid-rows .salmon-data-grid-group-caption').count()).toBeGreaterThan(0);
    expect(await page.locator('.salmon-data-grid-rows .salmon-data-grid-detail-row').count()).toBeGreaterThan(0);
    expect(await page.locator('.salmon-data-grid-rows [data-template][role="row"]').count()).toBeGreaterThan(0);
    await programmaticScroll(page, 'x', 2000, 1000); // warm-up
    await page.evaluate(() => ((document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollLeft = 0));
    const r = await programmaticScroll(page, 'x');
    console.log(report('horizontal scroll 2000px/s with grouping, renderRow and detail rows', r));
    expectSmooth(r, 'grouped template detail horizontal');
    expectBudget(r.distance, 9000, 'grid scroll grouped template detail horizontal: distance', { atLeast: true, strict: true, unit: 'px' });
    // Columns stay virtualized: the window, never the 100 columns.
    const range = await page.evaluate(() => window.__gridApi.getRenderedRange().columns as { start: number; end: number });
    expect(range.end - range.start).toBeLessThan(30);
  });
});
