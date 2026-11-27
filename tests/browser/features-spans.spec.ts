import { expect, test } from '@playwright/test';
import { collectProblems, DEV_URL, waitForGridReady } from './helpers.ts';

// The `spans` render feature, including late enable:
// a client-only grid with spans shows the placeholder for one chunk round
// trip; spans that appear after creation never show it, render as if off
// until the chunk arrives, then the spanned cells re-render once.

test.describe('spans render feature', () => {
  test('client-only first use: placeholder until the spans chunk arrives, then spanned cells', async ({ page }) => {
    const problems = collectProblems(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const requested: string[] = [];
    await page.route(/feature-spans/, async (route) => {
      requested.push(route.request().url());
      await held;
      await route.continue();
    });
    await page.goto(`${DEV_URL}?rows=500&cols=8&span`);
    await expect(page.locator('[data-salmon-pending]')).toHaveCount(1);
    expect(await page.locator('[role="grid"]').count()).toBe(0);
    expect(requested.length).toBe(1);
    release();
    await waitForGridReady(page);
    // ?span: s3 spans three columns on every 5th row.
    await expect(page.locator('[data-row-id="r0"] [aria-colspan="3"]')).toHaveCount(1);
    expect(problems).toEqual([]);
  });

  test('late enable: spans that appear after creation load the chunk without a placeholder', async ({ page }) => {
    const problems = collectProblems(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const requested: string[] = [];
    await page.route(/feature-spans/, async (route) => {
      requested.push(route.request().url());
      await held;
      await route.continue();
    });
    await page.goto(`${DEV_URL}?rows=50&cols=6`);
    await waitForGridReady(page);
    await page.waitForFunction(() => window.__gridApi);
    expect(requested).toEqual([]);
    await expect(page.locator('[aria-colspan]')).toHaveCount(0);

    // Equal s0 and s1 values in every row, merged across columns.
    await page.evaluate(() => {
      const data = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, s0: 'same', s1: 'same', s2: `a${i}`, s3: `b${i}`, n4: i, n5: i * 2 + 1 }));
      (window as unknown as { __setExtra: (patch: object) => void }).__setExtra({ data, mergeCells: 'columns' });
    });
    await expect.poll(() => requested.length).toBe(1);
    // Rendered as if off while the chunk is held: no placeholder, the same grid, no spans yet.
    await expect(page.locator('[data-salmon-pending]')).toHaveCount(0);
    await expect(page.getByRole('grid')).toHaveCount(1);
    await expect(page.locator('[data-row-id="r0"] [data-column-id="s1"]')).toHaveCount(1);
    expect(await page.locator('[aria-colspan="2"]').count()).toBe(0);

    release();
    await expect(page.locator('[data-row-id="r0"] [aria-colspan="2"]')).toHaveCount(1);
    await expect(page.locator('[data-row-id="r0"] .salmon-data-grid-cell[data-column-id="s1"]')).toHaveCount(0);
    // No creation-only warning for spans, and no other console problem.
    expect(problems).toEqual([]);
  });
});
