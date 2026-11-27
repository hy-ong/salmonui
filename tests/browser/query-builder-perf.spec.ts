import { expect, test } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// QueryBuilder performance budgets on the production
// build: a 200-rule QueryBuilder mounts in ≤ 50 ms (click to layout effect,
// median of 7), and a single rule edit re-renders only that rule and stays
// within 8 ms of work (two frames of paint slack, as in
// select-combobox-perf.spec.ts). Page: inputs.html?only=query-perf.

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;

test.describe('QueryBuilder budgets', () => {
  test('200 rules mount in ≤ 50 ms; one edit re-renders one rule', async ({ page }) => {
    await page.goto(`${PROD_URL}inputs.html?only=query-perf`);
    await page.waitForFunction(() => window.__inputsReady === true);
    const mount = page.locator('#qb-perf-mount');
    // Warm up once (module evaluation, JIT), then measure mount / unmount cycles.
    await mount.click();
    await expect(page.locator('#qb-perf [data-node-id="p199"]')).toBeVisible();
    await mount.click();
    const times: number[] = [];
    for (let run = 0; run < 7; run++) {
      await mount.click();
      await expect(page.locator('#qb-perf [data-node-id="p199"]')).toBeVisible();
      times.push(await page.evaluate(() => window.__qbMountMs as number));
      if (run < 6) await mount.click();
    }
    console.log(`mount median ${median(times).toFixed(1)} ms`);
    expectBudget(median(times), 50, 'query builder 200 rules mount median');
    expect(await page.locator('#qb-perf .salmon-query-builder__rule').count()).toBe(200);

    // One edit: only the edited rule renders again.
    const input = page.locator('#qb-perf [data-node-id="p10"] input[aria-label="Value"]');
    const edits: number[] = [];
    for (const text of ['a', 'ab', 'abc', 'ab', 'a']) {
      await page.evaluate(() => (window.__qbRenders = {}));
      const ms = await input.evaluate(
        (el: HTMLInputElement, t: string) =>
          new Promise<number>((resolve) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (v: string) => void;
            const t0 = performance.now();
            setter.call(el, t);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
          }),
        text,
      );
      edits.push(ms);
      expect(await page.evaluate(() => window.__qbRenders)).toEqual({ p10: 1 });
    }
    console.log(`edit median ${median(edits).toFixed(1)} ms (two frames included)`);
    expectBudget(median(edits), 8 + 33.4, 'query builder one edit to painted median');
  });
});
