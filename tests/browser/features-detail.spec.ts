import { expect, test } from '@playwright/test';
import { collectProblems, DEV_URL, waitForGridReady } from './helpers.ts';

// Render feature gate and placeholder for the `detail` feature: a
// client-only grid with `renderDetail` or `childGrid` shows the sized
// placeholder until the detail chunk arrives (held here), then the grid
// with its toggle column; child grids reuse the loaded chunk.

test.describe('detail render feature, client-only first use', () => {
  test('renderDetail: placeholder until the detail chunk arrives, then the toggle column and detail rows', async ({ page }) => {
    const problems = collectProblems(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const requested: string[] = [];
    await page.route(/features\/feature-detail/, async (route) => {
      requested.push(route.request().url());
      await held;
      await route.continue();
    });
    await page.goto(`${DEV_URL}hierarchy.html?mode=detail&rows=200`);
    const placeholder = page.locator('[data-salmon-pending]');
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toHaveAttribute('aria-busy', 'true');
    expect(await page.locator('[role="grid"]').count()).toBe(0);
    expect(Math.round((await placeholder.boundingBox())?.height ?? 0)).toBe(600);
    expect(requested.length).toBe(1);

    release();
    await waitForGridReady(page);
    const row = page.locator('#customers [data-row-id="c1"]');
    await expect(row).toHaveAttribute('data-expanded', 'false');
    await row.locator('.salmon-data-grid-detail-toggle').click();
    await expect(row).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('#customers .salmon-data-grid-detail-row')).toHaveCount(1);
    expect(problems).toEqual([]);
  });

  test('childGrid: the nested child grids render without a second chunk wait', async ({ page }) => {
    const problems = collectProblems(page);
    const requested: string[] = [];
    page.on('request', (request) => {
      if (/features\/feature-detail/.test(request.url())) requested.push(request.url());
    });
    await page.goto(`${DEV_URL}hierarchy.html?mode=child&rows=20`);
    await waitForGridReady(page);
    await page.locator('#customers [data-row-id="c1"] .salmon-data-grid-detail-toggle').click();
    const child = page.locator('[id="customers/c1"]');
    await expect(child).toHaveAttribute('role', 'grid');
    await expect(page.locator('[data-salmon-pending]')).toHaveCount(0);
    // The nested level (lines of an order) has a toggle column of its own.
    await expect(child.locator('.salmon-data-grid-detail-toggle').first()).toBeVisible();
    expect(requested.length).toBe(1);
    expect(problems).toEqual([]);
  });
});
