import { expect, test } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Chart timing budgets on the production
// build (examples/vite-spa/chart-features.html?perf=..., 1280 x 800, DPR 2):
//
// - Hover over a 100,000-point line chart: pointer handler (hit-test and
//   store write) <= 1 ms p95.
// - Wheel zoom on 100,000 points: frame <= 16.7 ms p95, measured as
//   rAF deltas while one wheel event is dispatched per frame.
// - Live append of 1 point to a 1,000-point window: render and commit
//   (flushSync) <= 2 ms, median of 30.
// - Line chart, 1,000,000 points, canvas: mount to first painted frame
//   <= 300 ms; the decimation half (<= 50 ms) is
//   packages/charts/tests/chart-performance.test.ts.

test.describe.configure({ retries: 1 });

const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] as number;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

test.describe('Chart timing', () => {
  test('hover over 100,000 points: pointer handler <= 1 ms p95', async ({ page }) => {
    await page.goto(`${PROD_URL}chart-features.html?perf=hover`);
    await page.waitForSelector('#perf .salmon-chart-overlay');
    const box = await page.locator('#perf .salmon-viz-plot').boundingBox();
    if (!box) throw new Error('no plot');
    const times = await page.evaluate(async (b) => {
      const el = document.querySelector('#perf .salmon-viz-plot') as HTMLElement;
      const out: number[] = [];
      for (let i = 0; i < 200; i++) {
        const x = b.x + 2 + ((b.width - 4) * i) / 200;
        const t0 = performance.now();
        el.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: b.y + b.height / 2, bubbles: true, pointerType: 'mouse' }));
        out.push(performance.now() - t0);
        if (i % 10 === 0) await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      return out;
    }, box);
    await expect(page.locator('#perf .salmon-viz-tooltip')).toBeVisible();
    const v = p95(times.slice(10));
    console.log(`[perf] chart hover handler p95: ${r2(v)}ms`);
    expectBudget(v, 1, 'chart hover handler p95');
  });

  test('wheel zoom on 100,000 points: frame <= 16.7 ms p95', async ({ page }) => {
    await page.goto(`${PROD_URL}chart-features.html?perf=zoom`);
    await page.waitForSelector('#perf .salmon-viz-plot[data-interactive]');
    const box = await page.locator('#perf .salmon-viz-plot').boundingBox();
    if (!box) throw new Error('no plot');
    const frames = await page.evaluate(async (b) => {
      const el = document.querySelector('#perf .salmon-viz-plot') as HTMLElement;
      const deltas: number[] = [];
      let last = await new Promise<number>((r) => requestAnimationFrame(r));
      for (let i = 0; i < 60; i++) {
        el.dispatchEvent(new WheelEvent('wheel', { clientX: b.x + b.width / 2, clientY: b.y + b.height / 2, deltaY: i < 30 ? -60 : 60, bubbles: true, cancelable: true }));
        const now = await new Promise<number>((r) => requestAnimationFrame(r));
        deltas.push(now - last);
        last = now;
      }
      return deltas;
    }, box);
    const v = p95(frames.slice(2));
    console.log(`[perf] chart wheel zoom 100k frame p95: ${r2(v)}ms`);
    expectBudget(v, 16.7 + 0.5, 'chart wheel zoom 100k frame p95');
  });

  test('live append of 1 point to a 1,000-point window: <= 2 ms', async ({ page }) => {
    await page.goto(`${PROD_URL}chart-features.html?perf=append`);
    await page.waitForSelector('#perf .salmon-chart-overlay');
    const times = await page.evaluate(async () => {
      const out: number[] = [];
      for (let i = 0; i < 40; i++) {
        out.push((window.__append as () => number)());
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      return out;
    });
    const sorted = times.slice(10).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] as number;
    console.log(`[perf] chart live append median: ${r2(median)}ms`);
    expectBudget(median, 2, 'chart live append median');
  });

  test('line chart, 1,000,000 points, canvas: mount to first paint <= 300 ms', async ({ page }) => {
    await page.goto(`${PROD_URL}chart-features.html?perf=million`);
    await page.waitForSelector('#warm canvas');
    // The warm-up chart has loaded the canvas chunk once it has drawn.
    await page.waitForFunction(() => {
      const c = document.querySelector<HTMLCanvasElement>('#warm canvas');
      const d = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
      return Boolean(d && d.some((v, i) => i % 4 === 3 && v > 0));
    });
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        await page.reload();
        await page.waitForSelector('#warm canvas');
        await page.waitForTimeout(300);
      }
      times.push(await page.evaluate(() => (window.__mountMillion as () => Promise<number>)()));
      console.log(`[perf] chart 1M render + commit: ${r2((await page.evaluate(() => window.__millionCommit)) ?? 0)}ms`);
    }
    const median = [...times].sort((a, b) => a - b)[1] as number;
    console.log(`[perf] chart 1M canvas mount to paint median: ${r2(median)}ms (${times.map(r2).join(', ')})`);
    expectBudget(median, 300, 'chart 1M canvas mount to paint median');
  });
});
