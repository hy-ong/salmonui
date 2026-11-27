import { expect, test } from '@playwright/test';
import { collectProblems, DEV_URL, waitForGridReady } from './helpers.ts';

// Render feature gate and placeholder: on a client-only render, a grid whose
// props turn on a render feature shows a sized placeholder for one chunk
// round trip, then the real grid. The feature chunk is held here so the
// placeholder can be observed.

test.describe('render features, client-only first use', () => {
  test('paging: placeholder until the paging chunk arrives, then the grid with its pager', async ({ page }) => {
    const problems = collectProblems(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const requested: string[] = [];
    await page.route(/feature-paging/, async (route) => {
      requested.push(route.request().url());
      await held;
      await route.continue();
    });
    await page.goto(`${DEV_URL}?rows=500&cols=6&paging=50`);
    const placeholder = page.locator('[data-salmon-pending]');
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toHaveAttribute('aria-busy', 'true');
    await expect(placeholder).toHaveClass(/salmon-data-grid/);
    expect(await page.locator('[role="grid"]').count()).toBe(0);
    // Sized like the grid (height 600 in the example), so the layout does not shift.
    expect(Math.round((await placeholder.boundingBox())?.height ?? 0)).toBe(600);
    expect(requested.length).toBe(1);

    release();
    await waitForGridReady(page);
    await expect(page.locator('[data-salmon-pending]')).toHaveCount(0);
    await expect(page.getByRole('grid')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-pager')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-pager')).toHaveAttribute('data-page', '1');
    await page.locator('.salmon-data-grid-pager__next').click();
    await expect(page.locator('.salmon-data-grid-pager')).toHaveAttribute('data-page', '2');
    expect(problems).toEqual([]);
  });

  test('a grid without render feature props renders directly (no placeholder, no feature chunk)', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      if (/features\/feature-/.test(request.url())) requested.push(request.url());
    });
    await page.goto(`${DEV_URL}?rows=500&cols=6`);
    await waitForGridReady(page);
    await page.waitForFunction(() => (window as { __gridApi?: unknown }).__gridApi);
    expect(requested).toEqual([]);
  });
});
