import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Scheduler render-to-paint gates on the
// production build, scheduler.html?set=perf (examples/vite-spa/src/scheduler-perf.tsx): from the
// state change that mounts the Scheduler to the task after the next painted frame. Median of 5
// mounts after 1 warm-up mount (which also loads the lazy view chunks); one retry on a failing timing.

// Calibrated 2026-11-24 (development machine, Chromium, production build) with drag, context menu, tooltip
// and keyboard merged and the resize edge boxes on the hovered event only: the largest median of the
// calibration runs plus about 5 % (week 37.0 ms, month 17.8 ms; timeline 27.2 ms keeps its earlier 28 ms,
// budgets are only lowered).
const BUDGET = { week: 39, month: 19, timeline: 28 } as const;

async function measure(page: Page, kind: keyof typeof BUDGET): Promise<number> {
  const runs: number[] = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__schedPerf?.(null));
    await page.waitForFunction(() => window.__schedPerfMs != null);
    await page.evaluate((k) => window.__schedPerf?.(k), kind);
    await page.waitForFunction(() => window.__schedPerfMs != null && document.querySelector('[data-salmon-pending]') === null);
    // The warm-up mount loads the view chunk (a Suspense placeholder first); measure the mounts after it.
    if (i > 0) runs.push((await page.evaluate(() => window.__schedPerfMs)) as number);
  }
  runs.sort((a, b) => a - b);
  return runs[2] as number;
}

async function gate(page: Page, kind: keyof typeof BUDGET): Promise<number> {
  await page.goto(`${PROD_URL}scheduler.html?set=perf`);
  await page.waitForFunction(() => typeof window.__schedPerf === 'function');
  let ms = await measure(page, kind);
  if (ms > BUDGET[kind]) ms = await measure(page, kind);
  console.log(`scheduler ${kind} render to painted: median ${ms.toFixed(1)} ms (budget ${BUDGET[kind]} ms)`);
  expectBudget(ms, BUDGET[kind], `scheduler ${kind} render to painted median`);
  return ms;
}

test.describe('Scheduler render to painted', () => {
  test('Week view with 1,000 events renders to painted within budget', async ({ page }) => {
    await gate(page, 'week');
    await expect(page.locator('[data-scenario="sched-perf"] .salmon-scheduler__event--timed')).toHaveCount(1000);
  });

  test('Month view with 5,000 events renders to painted within budget; the DOM holds the visible lanes only', async ({ page }) => {
    await gate(page, 'month');
    const events = await page.locator('[data-scenario="sched-perf"] .salmon-scheduler__event').count();
    expect(events).toBeGreaterThan(0);
    expect(events).toBeLessThanOrEqual(35 * 3);
  });

  test('Timeline Month with 1,000 resources and 10,000 events renders a row window to painted within budget', async ({ page }) => {
    await gate(page, 'timeline');
    const rows = await page.locator('[data-scenario="sched-perf"] .salmon-scheduler__tl-body [role="row"]').count();
    expect(rows).toBeLessThanOrEqual(40);
    const events = await page.locator('[data-scenario="sched-perf"] .salmon-scheduler__event').count();
    expect(events).toBeLessThanOrEqual(rows * 31 * 2);
  });
});
