import { expect, test } from '@playwright/test';
import { bodyCellCount, collectProblems, openGrid, PROD_URL, scrollViewport } from './helpers.ts';
import { expectBudget } from './budget.ts';

// `million` fixture gate (mount and data budgets; the 1M rows local fixture
// renders and scrolls within budget): 1,000,000 local rows x 20 columns in the production build.
// `__mountMs` is the time from `createRoot().render()` to the first painted
// viewport (examples/vite-spa/src/main.tsx); fixture generation is excluded.
const MILLION = `${PROD_URL}?rows=1000000&cols=20`;
/** Budget: client mount to first painted viewport, `million`, best of 3 page loads. */
const MOUNT_BUDGET_MS = 500;

test.describe('1M x 20 local rows', () => {
  test('mounts to the first painted viewport within budget and scrolls to the last row', async ({ page }) => {
    test.setTimeout(180_000);
    const problems = collectProblems(page);
    const samples: number[] = [];
    for (let run = 0; run < 3; run++) {
      await openGrid(page, MILLION);
      samples.push(await page.evaluate(() => window.__mountMs as number));
    }
    const best = Math.min(...samples);
    console.log(`[perf] million mount=${samples.map((s) => s.toFixed(1)).join('/')}ms (best ${best.toFixed(1)}ms, budget ${MOUNT_BUDGET_MS}ms)`);
    expectBudget(best, MOUNT_BUDGET_MS, 'million mount best', { strict: true });

    // Every row is addressable: aria-rowcount counts the header row plus 1M rows.
    await expect(page.locator('[role="grid"]')).toHaveAttribute('aria-rowcount', '1000001');
    const atTop = await bodyCellCount(page);
    // Scaled scroll mapping: the physical height is capped, the last row is reachable.
    await scrollViewport(page, 1e9, null);
    await expect(page.locator('.salmon-data-grid-rows [data-row-id="r999999"]')).toHaveCount(1);
    // DOM stays bounded by the rendered window at either end.
    expect(await bodyCellCount(page)).toBeLessThanOrEqual(atTop + 40);
    expect(problems).toEqual([]);
  });
});
