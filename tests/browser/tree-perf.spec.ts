import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Tree mode browser budgets on the production build of
// examples/vite-spa/tree-perf.html: the shared `tree-large` fixture
// (tooling/bench/fixtures/tree-large.ts: 1,000,000 rows, depth 6, flat
// `parentId`, 10 columns of the `large` mix) in a fully expanded
// `<DataGrid tree={{ parentIdField: 'parentId' }}>`. Viewport 1280 x 800,
// DPR 2, grid height 600, row height 36.
//
// - Vertical scroll at 2,000 px/s for 5 s, fully expanded: the existing scroll
//   budgets (0 blank frames, p95 frame <= one 60 Hz interval, dropped <= 2 %,
//   scroll handler p95 <= 1 ms). The harness is scroll-perf.spec.ts's,
//   unchanged (programmatic `scrollTop` per frame and real wheel input; rAF
//   interval percentiles; blank = any body sample point not on a cell in the
//   frame after the step). The programmatic run is repeated from the middle
//   of the tree (row 500,000): the handler work must not depend on the
//   position (range lookup O(log k), "Scroll handler work independent of n").
// - Indent, outdent and drop `into` one row (local) <= 16 ms to painted: the
//   API call runs at the start of a frame (inside requestAnimationFrame) and
//   the end marker is a MessageChannel task posted from the same callback,
//   which runs after that frame's style, layout and paint
//   (interaction-perf.spec.ts method); median and p95 of 9 per move after 2
//   warm-ups; each sample checks the painted row moved. Gated on `hierarchy`
//   (`?levels=20,180,1800,48000`, same generator) and on `tree-large`.
//
// Metric names: `tree-large vertical scroll 2000px/s ...` (core path
// `scroll`, tooling/bench/core-paths.mjs) and `tree-large move ...`.

test.describe.configure({ retries: 1 });

const TREE_LARGE = `${PROD_URL}tree-perf.html`;
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

// ---------------------------------------------------------------------------
// Scroll harness: copied from scroll-perf.spec.ts (same sampling, same gates).
// ---------------------------------------------------------------------------

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

/** `minScrollEvents` is the only change to scroll-perf.spec.ts's `expectSmooth` (wheel on a scaled height, see below). */
function expectSmooth(r: ScrollResult, label: string, minScrollEvents = 100): void {
  expectBudget(r.frames, 200, `${label}: frames`, { atLeast: true, strict: true, unit: 'frames' });
  expect(r.blank, `${label}: blank frames`).toBe(0);
  expectBudget(r.p95, 16.7 + 0.5, `${label}: p95 frame`);
  expectBudget(r.dropped / r.frames, 0.02, `${label}: dropped share`, { unit: 'x' });
  expectBudget(r.scrollEvents, minScrollEvents, `${label}: scroll events`, { atLeast: true, strict: true, unit: 'events' });
  expectBudget(r.handlerP95, 1, `${label}: scroll handler p95`);
}

// ---------------------------------------------------------------------------
// Moves: frame-start call to the end of that frame's rendering.
// ---------------------------------------------------------------------------

/** Runs `code` (with `api` bound to the grid API) at the start of a frame; returns its work until painted (ms). */
const framed = (page: Page, code: string) =>
  page.evaluate(
    (body) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const t0 = performance.now();
          // eslint-disable-next-line no-new-func
          const result = new Function('api', body)(window.__gridApi) as { status: string } | undefined;
          if (result && result.status !== 'applied') throw new Error(`move not applied: ${JSON.stringify(result)}`);
          const ch = new MessageChannel();
          ch.port1.onmessage = () => resolve(performance.now() - t0);
          ch.port2.postMessage(0);
        });
      }),
    code,
  );

/** `openGrid` for tree mode: the grid's role is `treegrid` (helpers.ts `waitForGridReady` waits for `grid`). */
async function openTree(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi && document.querySelector('[data-salmon-pending]') === null && document.querySelector('[role="treegrid"]') !== null, undefined, { timeout: 120_000 });
}

const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const level = (page: Page, id: string) => page.locator(`.salmon-data-grid-rows [role="row"][data-row-id="${id}"]`).first().getAttribute('aria-level');
const stats = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return { median: s[s.length >> 1] as number, p95: s[Math.ceil(s.length * 0.95) - 1] as number };
};

test.describe('tree mode timing on tree-large (production build)', () => {
  test('fully expanded tree-large: vertical scroll at 2,000 px/s for 5 s (programmatic from the top and the middle, wheel): p95 frame <= 16.7 ms, dropped <= 2 %, 0 blank, scroll handler p95 <= 1 ms', async ({ page }) => {
    test.setTimeout(240_000);
    await instrumentScroll(page);
    await openTree(page, TREE_LARGE);
    // Fully expanded: every row is a visible row (header row + 1M), depth 6 at the top.
    await expect(page.locator('[role="treegrid"]')).toHaveAttribute('aria-rowcount', '1000001');
    expect(await page.locator('.salmon-data-grid-rows [role="row"][aria-level="6"]').count()).toBeGreaterThan(5);
    await page.waitForTimeout(300);
    await programmaticScroll(page, 'y', 2000, 1000); // warm-up
    await page.evaluate(() => ((document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop = 0));
    const top = await programmaticScroll(page, 'y');
    console.log(report('tree-large vertical scroll 2000px/s programmatic fully expanded', top));
    const rowBefore = await page.evaluate(() => window.__gridApi.getRenderedRange().rows.start as number);
    const wheel = await wheelScroll(page);
    console.log(report('tree-large vertical scroll 2000px/s wheel fully expanded', wheel));
    // 1M x 36 px exceeds the physical scroll height, so the scaled mapping moves fewer
    // physical px than the wheel deltas; the distance check is in rows (logical px).
    const wheelRows = (await page.evaluate(() => window.__gridApi.getRenderedRange().rows.start as number)) - rowBefore;
    console.log(`[perf] tree-large wheel logical distance: ${wheelRows} rows (${wheelRows * 36} px), physical ${Math.round(wheel.distance)} px`);
    // The middle of the tree: half the (scaled) scroll range, about row 500,000.
    await page.evaluate(() => {
      const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
      vp.scrollTop = (vp.scrollHeight - vp.clientHeight) / 2;
    });
    await settle(page);
    const firstRow = await page.evaluate(() => window.__gridApi.getRenderedRange().rows.start as number);
    expect(firstRow).toBeGreaterThan(400_000);
    const middle = await programmaticScroll(page, 'y');
    console.log(report('tree-large vertical scroll 2000px/s programmatic fully expanded (middle)', middle));
    expectSmooth(top, 'tree-large programmatic');
    expectBudget(top.distance, 9000, 'tree-large programmatic: distance', { atLeast: true, strict: true, unit: 'px' });
    // Wheel input on a scaled scroll height (1M x 36 px > the 15M px physical cap):
    // Chromium delivers about 100 wheel scrolls in 5 s and half the logical distance, the same
    // on the flat `million` grid (?rows=1000000&cols=20: 101 scroll events, 138 rows, measured
    // 2026-11-24), so the input-volume checks are halved; the frame budgets are unchanged.
    expectSmooth(wheel, 'tree-large wheel', 50);
    expectBudget(wheelRows * 36, 3000, 'tree-large wheel: logical distance', { atLeast: true, strict: true, unit: 'px' });
    expectSmooth(middle, 'tree-large programmatic (middle)');
  });

  test('hierarchy (50,000 rows, depth 4): indent, outdent and drop into one row (local) <= 16 ms to painted', async ({ page }) => {
    test.setTimeout(240_000);
    const result = await measureMoves(page, 'hierarchy', `${TREE_LARGE}?drag&levels=20,180,1800,48000`);
    for (const [name, s] of Object.entries(result)) expectBudget(s.median, 16, `hierarchy move ${name} one row to painted median`);
  });

  // A move on 1M rows carries the tree index (the moved subtree is spliced in the typed-array
  // pre-order, no parent is re-resolved; tree-index.ts `spliceTreeLayout`), so the same budget
  // holds as on `hierarchy` (was 125-176 ms with a full rebuild).
  test('tree-large (1,000,000 rows): indent, outdent and drop into one row (local) <= 16 ms to painted', async ({ page }) => {
    test.setTimeout(240_000);
    const result = await measureMoves(page, 'tree-large', `${TREE_LARGE}?drag`);
    for (const [name, s] of Object.entries(result)) expectBudget(s.median, 16, `tree-large move ${name} one row to painted median`);
  });
});

/** Indent / outdent and drop `into` of one rendered row, 11 each (2 warm-ups dropped); median and p95 to painted. */
async function measureMoves(page: Page, fixture: string, url: string): Promise<Record<'indent' | 'outdent' | 'into', { median: number; p95: number }>> {
  {
    await openTree(page, url);
    await settle(page);
    // A rendered row with a previous sibling (indent target) and a different rendered row to drop into.
    const pick = await page.evaluate(() => {
      const api = window.__gridApi;
      const ids = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows [role="row"][data-row-id]')].map((r) => r.dataset['rowId'] as string);
      const row = ids.find((id) => {
        const info = api.getTreeRow(id);
        return info && info.depth >= 3 && info.posinset > 1;
      }) as string;
      const info = api.getTreeRow(row);
      const target = ids.find((id) => id !== row && id !== info.parentId && api.getTreeRow(id)?.depth === 1) as string;
      return { row, parentId: info.parentId as string, depth: info.depth as number, target };
    });
    expect(pick.row).toBeTruthy();
    expect(pick.target).toBeTruthy();
    const ariaLevel = String(pick.depth + 1);
    const deeper = String(pick.depth + 2);

    const indent: number[] = [];
    const outdent: number[] = [];
    const into: number[] = [];
    for (let i = 0; i < 11; i++) {
      indent.push(await framed(page, `return api.indentRows(${JSON.stringify(pick.row)})`));
      expect(await level(page, pick.row)).toBe(deeper);
      await settle(page);
      outdent.push(await framed(page, `return api.outdentRows(${JSON.stringify(pick.row)})`));
      expect(await level(page, pick.row)).toBe(ariaLevel);
      expect(await page.evaluate((id) => window.__gridApi.getTreeRow(id)?.parentId, pick.row)).toBe(pick.parentId);
      await settle(page);
    }
    for (let i = 0; i < 11; i++) {
      // Into a depth-1 row (the row becomes its last child, depth 2) and back into its parent.
      into.push(await framed(page, `return api.moveRows(${JSON.stringify(pick.row)}, { targetRowId: ${JSON.stringify(pick.target)}, position: 'into' })`));
      expect(await page.evaluate((id) => window.__gridApi.getTreeRow(id)?.parentId, pick.row)).toBe(pick.target);
      await settle(page);
      await framed(page, `return api.moveRows(${JSON.stringify(pick.row)}, { targetRowId: ${JSON.stringify(pick.parentId)}, position: 'into' })`);
      expect(await page.evaluate((id) => window.__gridApi.getTreeRow(id)?.parentId, pick.row)).toBe(pick.parentId);
      await settle(page);
    }
    // Two warm-ups dropped, 9 samples each.
    const result = { indent: stats(indent.slice(2)), outdent: stats(outdent.slice(2)), into: stats(into.slice(2)) };
    for (const [name, s] of Object.entries(result)) console.log(`[perf] ${fixture} move ${name} one row to painted: median=${round(s.median)}ms p95=${round(s.p95)}ms`);
    console.log(`[perf] ${fixture} move samples: ${JSON.stringify({ indent: indent.map(round), outdent: outdent.map(round), into: into.map(round) })}`);
    return result;
  }
}
