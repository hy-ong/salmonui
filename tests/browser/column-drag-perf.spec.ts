import { expect, test, type Page } from '@playwright/test';
import { DEV_URL, installDevtools, openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Interaction budgets: column resize drag frame <= 4 ms main thread
// and 0 React commits; column reorder drop <= 30 ms to settled layout; and the
// structural "0 React commits during a pointer-drag frame" for both drags.
// The 100k x 100 fixture (`?colEvents`
// records the column events with their time).
//
// Methods (Chromium):
// - Resize frame (production build): after a real pointer down on the s3
//   resize handle, each step dispatches one `pointermove` on the handle at the
//   start of a frame (inside requestAnimationFrame) and posts a MessageChannel
//   task from the same callback; the task runs after that frame's style,
//   layout and paint, so the number is handler + rendering work of the frame
//   that shows the new width, without the wait for the next vsync (same as
//   interaction-perf.spec.ts `framedKeys`). Then a real Playwright drag (120
//   awaited moves of +2 px, the reference harness pacing) measures frame
//   intervals and move-to-painted, the method of the recorded reference
//   medians: reference frame p50 / p95 16.7 / 16.8 ms, move to painted p50 / p95 15.9 / 16.7 ms,
//   pointerup to next paint 14.6 ms. That method is quantized to the 60 Hz
//   frame (both grids paint every move in the next frame), so 0.5 x
//   the reference cannot be shown on it; the gated number is the main-thread
//   frame work.
// - Reorder drop (production build): a real pointer drag of the s3 header
//   past n5, then pointer up; from the `pointerup` event (capture on window)
//   to the end of the frame in which the header and body cells sit at their
//   new place (checked with a forced layout, then a MessageChannel task).
//   There is no recorded reference median for reorder.
// - Commits (development build, `__SALMON_UI_DEVTOOLS__`): React commits
//   between the first and the last drag move are 0 for both drags, and the
//   per-frame events fire at most once per pointer move.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;
const pct = (values: number[], p: number) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * p) - 1))] as number;
};

interface ColEvent {
  type: string;
  field: string;
  at: number;
  width?: number;
  toIndex?: number;
}
const colEvents = (page: Page) => page.evaluate(() => ((window as unknown as { __colEvents: ColEvent[] }).__colEvents ?? []).map((e) => ({ ...e })));

async function handleBox(page: Page, field: string) {
  const box = await page.locator(`.salmon-data-grid-header-cell[data-column-id="${field}"] .salmon-data-grid-resize-handle`).boundingBox();
  if (!box) throw new Error(`no resize handle for ${field}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Rendered header cells in visual order (left to right). */
const headerOrder = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-header .salmon-data-grid-header-cell[data-column-id]')]
      .map((c) => [c.dataset['columnId'] as string, c.getBoundingClientRect().left] as const)
      .sort((a, b) => a[1] - b[1])
      .map((c) => c[0]),
  );

const headerWidth = (page: Page, field: string) => page.evaluate((f) => (document.querySelector(`.salmon-data-grid-header-cell[data-column-id="${f}"]`) as HTMLElement).getBoundingClientRect().width, field);

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

/** One synthetic pointermove per frame on the captured handle; ms of handler + rendering per frame. */
async function framedResizeMoves(page: Page, field: string, startX: number, steps: number, stepPx: number): Promise<number[]> {
  return page.evaluate(
    ([f, x0, n, dx]) =>
      new Promise<number[]>((resolve) => {
        const handle = document.querySelector(`.salmon-data-grid-header-cell[data-column-id="${f}"] .salmon-data-grid-resize-handle`) as HTMLElement;
        const out: number[] = [];
        let i = 0;
        const step = (): void => {
          requestAnimationFrame(() => {
            i++;
            const t0 = performance.now();
            handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x0 + i * dx, clientY: 0, buttons: 1 }));
            const ch = new MessageChannel();
            ch.port1.onmessage = () => {
              out.push(performance.now() - t0);
              if (out.length >= n) resolve(out);
              else step();
            };
            ch.port2.postMessage(0);
          });
        };
        step();
      }),
    [field, startX, steps, stepPx] as const,
  );
}

/** Frame intervals and move-to-painted during a real drag (reference harness method). */
async function armDragProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __probe: { frames: number[]; moveToPaint: number[]; stop: () => void; upToPaint: number } };
    const frames: number[] = [];
    const moveToPaint: number[] = [];
    let last = 0;
    let running = true;
    const tick = (t: number): void => {
      if (last) frames.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const painted = (from: number, sink: (ms: number) => void) =>
      requestAnimationFrame(() => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => sink(performance.now() - from);
        ch.port2.postMessage(0);
      });
    const onMove = (e: PointerEvent) => painted(e.timeStamp, (ms) => moveToPaint.push(ms));
    const onUp = (e: PointerEvent) => painted(e.timeStamp, (ms) => (w.__probe.upToPaint = ms));
    window.addEventListener('pointermove', onMove, { capture: true });
    window.addEventListener('pointerup', onUp, { capture: true, once: true });
    w.__probe = {
      frames,
      moveToPaint,
      upToPaint: -1,
      stop: () => {
        running = false;
        window.removeEventListener('pointermove', onMove, { capture: true });
      },
    };
  });
}

test.describe('column resize and reorder drags (interaction budgets)', () => {
  test('resize drag frame (production): main thread <= 4 ms p95; real drag paints every move in the next frame', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?colEvents`);
    const start = await handleBox(page, 's3');
    const before = await headerWidth(page, 's3');
    // Framed method: pointer down for real (pointer capture), then synthetic moves at frame start.
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await framedResizeMoves(page, 's3', start.x, 10, 2); // warm-up
    const work = await framedResizeMoves(page, 's3', start.x + 20, 120, 2);
    await page.mouse.up();
    await settle(page);
    const framedWidth = await headerWidth(page, 's3');
    expect(Math.round(framedWidth - before)).toBe(260);
    // Real drag, the reference method: 120 awaited moves of +2 px.
    const start2 = await handleBox(page, 's2');
    const before2 = await headerWidth(page, 's2');
    await page.mouse.move(start2.x, start2.y);
    await page.mouse.down();
    await armDragProbe(page);
    for (let i = 1; i <= 120; i++) await page.mouse.move(start2.x + i * 2, start2.y);
    await page.evaluate(() => (window as unknown as { __probe: { stop: () => void } }).__probe.stop());
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __probe: { upToPaint: number } }).__probe.upToPaint)).toBeGreaterThan(0);
    const probe = await page.evaluate(() => {
      const p = (window as unknown as { __probe: { frames: number[]; moveToPaint: number[]; upToPaint: number } }).__probe;
      return { frames: p.frames.slice(), moveToPaint: p.moveToPaint.slice(), upToPaint: p.upToPaint };
    });
    expect(Math.round((await headerWidth(page, 's2')) - before2)).toBe(240);
    const events = await colEvents(page);
    const resizes = events.filter((e) => e.type === 'columnResize' && e.field === 's2');
    const r = {
      workP50: round(pct(work, 0.5)),
      workP95: round(pct(work, 0.95)),
      workMax: round(Math.max(...work)),
      frameP50: round(pct(probe.frames, 0.5)),
      frameP95: round(pct(probe.frames, 0.95)),
      dropped: probe.frames.filter((d) => d > 25).length,
      moveToPaintP50: round(pct(probe.moveToPaint, 0.5)),
      moveToPaintP95: round(pct(probe.moveToPaint, 0.95)),
      upToPaint: round(probe.upToPaint),
    };
    console.log(
      `[perf] column resize drag frame: workP50=${r.workP50}ms workP95=${r.workP95}ms workMax=${r.workMax}ms frameP50=${r.frameP50}ms frameP95=${r.frameP95}ms moveToPaintP50=${r.moveToPaintP50}ms moveToPaintP95=${r.moveToPaintP95}ms upToPaint=${r.upToPaint}ms (dropped ${r.dropped} of ${probe.frames.length}; reference median frame 16.7/16.8, move to painted 15.9/16.7, pointerup to paint 14.6)`,
    );
    expectBudget(r.workP95, 4, 'column resize drag frame workP95');
    // Every move is painted in the next frame (one vsync plus timer jitter), as in the reference.
    expectBudget(r.moveToPaintP95, 16.7 + 1, 'column resize drag frame moveToPaintP95');
    expectBudget(r.frameP95, 16.7 + 0.5, 'column resize drag frame frameP95');
    expectBudget(r.dropped, Math.ceil(probe.frames.length * 0.02), 'column resize drag dropped frames', { unit: 'frames' });
    // onColumnResize: at most one per pointer move.
    expect(resizes.length).toBeGreaterThan(100);
    expect(resizes.length).toBeLessThanOrEqual(120);
  });

  test('reorder drop (production): pointerup to settled layout <= 30 ms p95', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?colEvents`);
    const cell = (f: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${f}"]`);
    /** Drags `field` onto the right half of `target`; returns pointerup to settled (ms). */
    const drop = async (field: string, target: string): Promise<number> => {
      const from = (await cell(field).boundingBox())!;
      const to = (await cell(target).boundingBox())!;
      await page.mouse.move(from.x + 30, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 2 });
      await page.mouse.move(to.x + to.width * 0.75, to.y + to.height / 2, { steps: 12 });
      await settle(page);
      await page.evaluate(
        ([f, t]) => {
          const w = window as unknown as { __drop: Promise<number> };
          w.__drop = new Promise<number>((resolve) => {
            window.addEventListener(
              'pointerup',
              () => {
                const t0 = performance.now();
                const placed = (): boolean => {
                  const a = document.querySelector(`.salmon-data-grid-header-cell[data-column-id="${f}"]`);
                  const b = document.querySelector(`.salmon-data-grid-header-cell[data-column-id="${t}"]`);
                  const ba = document.querySelector(`.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="${f}"]`);
                  const bb = document.querySelector(`.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="${t}"]`);
                  if (!a || !b || !ba || !bb) return false;
                  return a.getBoundingClientRect().left > b.getBoundingClientRect().left && ba.getBoundingClientRect().left > bb.getBoundingClientRect().left;
                };
                const check = (): void => {
                  if (placed()) {
                    const ch = new MessageChannel();
                    ch.port1.onmessage = () => resolve(performance.now() - t0);
                    ch.port2.postMessage(0);
                  } else setTimeout(check, 0);
                };
                queueMicrotask(check);
              },
              { capture: true, once: true },
            );
          });
        },
        [field, target] as const,
      );
      await page.mouse.up();
      return page.evaluate(() => (window as unknown as { __drop: Promise<number> }).__drop);
    };
    const orderOf = () => headerOrder(page);
    const samples: number[] = [];
    // s1 -> after n5, then back: s1 -> after s0 (alternating keeps the layout near the start).
    for (let i = 0; i < 12; i++) {
      const forward = i % 2 === 0;
      const ms = forward ? await drop('s1', 'n5') : await drop('s1', 's0');
      if (i >= 2) samples.push(ms);
      const order = await orderOf();
      expect(order.indexOf('s1')).toBe(forward ? order.indexOf('n5') + 1 : order.indexOf('s0') + 1);
      await settle(page);
    }
    const events = await colEvents(page);
    expect(events.filter((e) => e.type === 'columnDrop').length).toBe(12);
    console.log(`[perf] column reorder drop to settled layout: median=${round(pct(samples, 0.5))}ms p95=${round(pct(samples, 0.95))}ms (samples ${samples.map(round).join(', ')}; no reorder reference median)`);
    expectBudget(pct(samples, 0.95), 30, 'column reorder drop to settled layout p95');
  });

  test('0 React commits during resize and reorder drag frames; one event per pointer move (development build)', async ({ page }) => {
    await installDevtools(page);
    await openGrid(page, `${DEV_URL}?colEvents`);
    // Resize.
    const h = await handleBox(page, 's3');
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 2, h.y);
    await settle(page);
    let commits = await page.evaluate(() => window.__commits.length);
    for (let i = 2; i <= 60; i++) await page.mouse.move(h.x + i * 2, h.y);
    await settle(page);
    const resizeCommits = (await page.evaluate(() => window.__commits.length)) - commits;
    await page.mouse.up();
    // Reorder.
    const from = (await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]').boundingBox())!;
    const to = (await page.locator('.salmon-data-grid-header-cell[data-column-id="n4"]').boundingBox())!;
    await page.mouse.move(from.x + 30, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 2 });
    await settle(page);
    commits = await page.evaluate(() => window.__commits.length);
    const dragsBefore = (await colEvents(page)).filter((e) => e.type === 'columnDrag').length;
    const moves = 30;
    for (let i = 1; i <= moves; i++) await page.mouse.move(from.x + 40 + ((to.x + to.width * 0.75 - from.x - 40) * i) / moves, from.y + from.height / 2);
    await settle(page);
    const reorderCommits = (await page.evaluate(() => window.__commits.length)) - commits;
    await expect(page.locator('.salmon-data-grid[data-reordering]')).toHaveCount(1);
    await page.mouse.up();
    const events = await colEvents(page);
    const drags = events.filter((e) => e.type === 'columnDrag').length - dragsBefore;
    console.log(`[perf] column drag commits: resize ${resizeCommits} commits over 59 moves; reorder ${reorderCommits} commits over ${moves} moves, ${drags} onColumnDrag`);
    expect(resizeCommits).toBe(0);
    expect(reorderCommits).toBe(0);
    expect(drags).toBeGreaterThan(0);
    expect(drags).toBeLessThanOrEqual(moves);
    expect(events.filter((e) => e.type === 'columnResize' && e.field === 's3').length).toBeLessThanOrEqual(60);
    await expect.poll(async () => (await headerOrder(page)).indexOf('s1')).toBe((await headerOrder(page)).indexOf('n4') + 1);
  });
});
