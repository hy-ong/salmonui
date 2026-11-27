import { expect, test, type Page } from '@playwright/test';
import { openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Interaction budgets, measured on the production build of the
// 100k x 100 fixture (1280 x 800, DPR 2, grid height 600, row height 36).
//
// Methodology (Chromium):
// - keydown-to-paint: the key event is dispatched at the start of a frame
//   (inside requestAnimationFrame) and the end marker is a MessageChannel
//   task posted from the same callback, which runs after that frame's style,
//   layout, and paint. The number is handler + commit + rendering work of the
//   frame that shows the move, without the wait for the next vsync.
// - held ArrowDown: one keydown every 33 ms (30/s auto-repeat). Every frame
//   checks that the rows covering the viewport are in the DOM (blank frame
//   otherwise) and records the frame interval.
// - Shift+click range: real pointer input; from the click event (capture on
//   window) to the end of synchronous work (bubble on window, after React)
//   including a forced style and layout; the next paint is reported too.

const round = (v: number) => Math.round(v * 100) / 100;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] as number;
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

/** Dispatches `key` at the start of `count` frames; returns work-until-painted per press (ms). */
async function framedKeys(page: Page, key: string, count: number, init: KeyboardEventInit = {}): Promise<number[]> {
  return page.evaluate(
    ([k, n, extra]) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        const step = () => {
          requestAnimationFrame(() => {
            const t0 = performance.now();
            const target = document.activeElement as HTMLElement;
            target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
            const ch = new MessageChannel();
            ch.port1.onmessage = () => {
              out.push(performance.now() - t0);
              if (out.length >= n) resolve(out);
              else setTimeout(step, 20);
            };
            ch.port2.postMessage(0);
          });
        };
        step();
      }),
    [key, count, init] as const,
  );
}

interface HoldResult {
  presses: number;
  frames: number;
  blankFrames: number;
  p50: number;
  p95: number;
  max: number;
  over16_7: number;
  /** Intervals longer than 1.5 vsyncs (a missed frame). */
  dropped: number;
  focusedRow: string;
}

/** Holds ArrowDown (30/s) for `ms`; samples every frame for blank rows and frame intervals. */
async function holdArrowDown(page: Page, ms: number): Promise<HoldResult> {
  return page.evaluate(
    (duration) =>
      new Promise<HoldResult>((resolve) => {
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const rowsEl = document.querySelector('.salmon-data-grid-rows') as HTMLElement;
        const rowHeight = 36;
        const bodyExtent = vp.clientHeight - 40;
        const stamps: number[] = [];
        let blank = 0;
        let presses = 0;
        let running = true;
        const frame = (ts: number) => {
          stamps.push(ts);
          const top = vp.scrollTop;
          const first = Math.floor(top / rowHeight);
          const last = Math.floor((top + bodyExtent - 1) / rowHeight);
          const rows = rowsEl.children;
          const a = Number((rows[0] as HTMLElement | undefined)?.dataset['rowIndex'] ?? -1);
          const b = Number((rows[rows.length - 1] as HTMLElement | undefined)?.dataset['rowIndex'] ?? -1);
          if (first < a || last > b) blank++;
          if (running) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        const timer = setInterval(() => {
          presses++;
          (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, repeat: presses > 1 }));
        }, 33);
        setTimeout(() => {
          clearInterval(timer);
          running = false;
          const d: number[] = [];
          for (let i = 1; i < stamps.length; i++) d.push((stamps[i] as number) - (stamps[i - 1] as number));
          const sorted = [...d].sort((x, y) => x - y);
          const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] as number;
          const el = document.activeElement as HTMLElement;
          resolve({
            presses,
            frames: d.length,
            blankFrames: blank,
            p50: Math.round(pct(50) * 100) / 100,
            p95: Math.round(pct(95) * 100) / 100,
            max: Math.round((sorted[sorted.length - 1] as number) * 100) / 100,
            over16_7: d.filter((x) => x > 16.7).length,
            dropped: d.filter((x) => x > 25).length,
            focusedRow: (el.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'] ?? el.className,
          });
        }, duration);
      }),
    ms,
  );
}

test.describe('interaction timing (production build)', () => {
  test('arrow key focus move: keydown to painted <= 8 ms', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?sel=single`);
    await page.evaluate(() => window.__gridApi.focusCell('r1000', 's1'));
    await settle(page);
    await framedKeys(page, 'ArrowDown', 10); // warm-up
    const down = await framedKeys(page, 'ArrowDown', 60);
    const right = await framedKeys(page, 'ArrowRight', 30);
    const pageDown = await framedKeys(page, 'PageDown', 20);
    const report = {
      arrowDown: { p50: round(percentile(down, 50)), p95: round(percentile(down, 95)), max: round(Math.max(...down)) },
      arrowRight: { p50: round(percentile(right, 50)), p95: round(percentile(right, 95)) },
      pageDown: { p50: round(percentile(pageDown, 50)), p95: round(percentile(pageDown, 95)) },
    };
    console.log(`[perf] keydown-to-paint ${JSON.stringify(report)}`);
    expectBudget(report.arrowDown.p95, 8, 'keydown-to-paint arrowDown p95');
    expectBudget(report.arrowRight.p95, 8, 'keydown-to-paint arrowRight p95');
    // PageDown jumps one viewport: rows mount in the same frame (no blank), budget 16 ms.
    expectBudget(report.pageDown.p95, 16, 'keydown-to-paint pageDown p95');
  });

  test('held ArrowDown at 30/s: 0 blank frames, 0 dropped, p95 frame at vsync (top, middle, bottom of 100k rows)', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?sel=single`);
    const results: Record<string, HoldResult> = {};
    for (const [name, rowId] of [['top', 'r0'], ['middle', 'r50000'], ['bottom', 'r99850']] as const) {
      await page.evaluate((id) => window.__gridApi.focusCell(id, 's0'), rowId);
      await settle(page);
      results[name] = await holdArrowDown(page, 6000);
    }
    console.log(`[perf] hold ArrowDown ${JSON.stringify(results)}`);
    for (const [name, r] of Object.entries(results)) {
      expect(r.blankFrames, name).toBe(0);
      expectBudget(r.dropped, 0, `hold ArrowDown ${name} dropped frames`, { unit: 'frames' });
      expectBudget(r.presses, 170, `hold ArrowDown ${name} presses`, { atLeast: true, unit: 'presses' });
      // Frame intervals are vsync-quantized; 16.7 ms plus 0.3 ms of timer jitter.
      expectBudget(r.p95, 17, `hold ArrowDown ${name} frame p95`);
    }
    expectBudget(Number(results['top']!.focusedRow.slice(1)), 170, 'hold ArrowDown top focused row', { atLeast: true, unit: 'rows' });
    expect(results['bottom']!.focusedRow).toBe('r99999');
  });

  test('Shift+click range select of 50k rows <= 16 ms; Ctrl+A on 100k <= 20 ms', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?sel=multiple`);
    await page.locator('.salmon-data-grid-row[data-row-id="r0"] .salmon-data-grid-cell[data-column-id="s0"]').click();
    await page.evaluate(() => window.__gridApi.scrollToRow('r50000', { align: 'center' }));
    await settle(page);
    await page.evaluate(() => {
      const w = window as unknown as { __click: { t0: number; t1: number; t2: number } };
      w.__click = { t0: 0, t1: 0, t2: 0 };
      window.addEventListener('click', () => (w.__click.t0 = performance.now()), { capture: true, once: true });
      window.addEventListener(
        'click',
        () => {
          document.querySelector('.salmon-data-grid-row[data-selected]')?.getBoundingClientRect();
          w.__click.t1 = performance.now();
          requestAnimationFrame(() => {
            const ch = new MessageChannel();
            ch.port1.onmessage = () => (w.__click.t2 = performance.now());
            ch.port2.postMessage(0);
          });
        },
        { once: true },
      );
    });
    await page.locator('.salmon-data-grid-row[data-row-id="r50000"] .salmon-data-grid-cell[data-column-id="s0"]').click({ modifiers: ['Shift'] });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __click: { t2: number } }).__click.t2)).toBeGreaterThan(0);
    const click = await page.evaluate(() => (window as unknown as { __click: { t0: number; t1: number; t2: number } }).__click);
    expect(await page.evaluate(() => window.__gridApi.getSelectionSummary().count)).toBe(50_001);
    const work = round(click.t1 - click.t0);
    const toPaint = round(click.t2 - click.t0);

    // Ctrl+A over 100k rows (scope allFiltered: O(1)).
    const ctrlA = await framedKeys(page, 'a', 5, { ctrlKey: true });
    expect(await page.evaluate(() => window.__gridApi.getSelectionSummary().count)).toBe(100_000);
    console.log(`[perf] shift-click 50k range: work ${work} ms, to paint ${toPaint} ms; Ctrl+A 100k p95 ${round(percentile(ctrlA, 95))} ms`);
    expectBudget(work, 16, 'shift-click 50k range work');
    expectBudget(percentile(ctrlA, 95), 20, 'Ctrl+A 100k p95');
  });
});
