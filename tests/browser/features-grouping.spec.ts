import { expect, test } from '@playwright/test';
import { collectProblems, DEV_URL, waitForGridReady } from './helpers.ts';

// Render feature gate: a client-only grid with `grouping` and `aggregates`
// loads both feature chunks in parallel behind one placeholder, then renders
// the group panel, caption rows and footer rows.

test.describe('grouping and aggregates render features, client-only first use', () => {
  test('placeholder until both chunks arrive (requested in parallel), then the grouped grid with its footer', async ({ page }) => {
    const problems = collectProblems(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const requested = new Set<string>();
    await page.route(/feature-(grouping|aggregates)/, async (route) => {
      requested.add(/feature-grouping/.test(route.request().url()) ? 'grouping' : 'aggregates');
      await held;
      await route.continue();
    });
    await page.goto(`${DEV_URL}?sort&group=s0&aggs`);
    const placeholder = page.locator('[data-salmon-pending]');
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toHaveAttribute('aria-busy', 'true');
    expect(await page.locator('[role="grid"]').count()).toBe(0);
    await expect.poll(() => [...requested].sort()).toEqual(['aggregates', 'grouping']);

    release();
    await waitForGridReady(page);
    await expect(page.getByRole('grid')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-group-panel .salmon-data-grid-group-chip')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-group-caption').first()).toBeVisible();
    await expect(page.locator('.salmon-data-grid-footer-row').first()).toBeVisible();
    // The caption toggle works once the grid is ready.
    const first = page.locator('.salmon-data-grid-group-caption').first();
    await expect(first).toHaveAttribute('data-expanded', 'true');
    await first.locator('.salmon-data-grid-group-toggle').click();
    await expect(page.locator('.salmon-data-grid-group-caption').first()).toHaveAttribute('data-expanded', 'false');
    expect(problems).toEqual([]);
  });

  test('a grid without grouping or aggregates requests neither chunk', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      if (/feature-(grouping|aggregates)/.test(request.url())) requested.push(request.url());
    });
    await page.goto(`${DEV_URL}?rows=500&cols=6&sort`);
    await waitForGridReady(page);
    await page.waitForFunction(() => (window as { __gridApi?: unknown }).__gridApi);
    expect(requested).toEqual([]);
  });
});
