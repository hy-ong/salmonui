import { expect, test } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, waitForGridReady } from './helpers.ts';

// Render feature gate and late enable: the `search` and `toolbar` render
// features on a client-only render. First use shows the sized placeholder
// until both chunks arrive; a toolbar turned on after creation loads its
// chunk without a placeholder and without a creation-only warning.

declare global {
  interface Window {
    __setExtra(patch: unknown): void;
  }
}

test.describe('search and toolbar render features, client-only', () => {
  test('first use: placeholder until the search and toolbar chunks arrive, then the searched grid and its toolbar', async ({ page }) => {
    const problems = collectProblems(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const requested: string[] = [];
    await page.route(/features\/feature-(search|toolbar)|feature-(search|toolbar)-/, async (route) => {
      requested.push(route.request().url());
      await held;
      await route.continue();
    });
    await page.goto(`${DEV_URL}?rows=2000&cols=6&qsearch=word-3`);
    await expect(page.locator('[data-salmon-pending]')).toHaveCount(1);
    await expect(page.locator('[data-salmon-pending]')).toHaveAttribute('aria-busy', 'true');
    expect(await page.locator('[role="grid"]').count()).toBe(0);
    await expect.poll(() => requested.length).toBe(2);

    release();
    await waitForGridReady(page);
    await page.waitForFunction(() => window.__gridApi);
    // The initial search filters the first rows.
    expect(await page.evaluate(() => window.__gridApi.getViewRows().length)).toBeLessThan(2000);
    const box = page.getByRole('toolbar').getByRole('searchbox', { name: 'Search' });
    await expect(box).toHaveValue('word-3');
    await box.fill('');
    await box.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__gridApi.getViewRows().length)).toBe(2000);
    expect(problems).toEqual([]);
  });

  test('late enable: a toolbar turned on after creation appears without a placeholder or a warning', async ({ page }) => {
    const problems = collectProblems(page);
    const requested: string[] = [];
    page.on('request', (request) => {
      if (/feature-toolbar/.test(request.url())) requested.push(request.url());
    });
    await openGrid(page, `${DEV_URL}?rows=200&cols=6`);
    await expect(page.getByRole('toolbar')).toHaveCount(0);
    expect(requested).toEqual([]);
    // The grid stays mounted (no placeholder) while the chunk loads.
    await page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]');
      window.__setExtra({ toolbar: ['print', { id: 'mine', label: 'Mine' }] });
      (window as unknown as { __sameGrid: () => boolean }).__sameGrid = () => document.querySelector('[role="grid"]') === grid;
    });
    await expect(page.getByRole('toolbar')).toHaveCount(1);
    await expect(page.getByRole('toolbar').getByRole('button', { name: 'Mine' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sameGrid: () => boolean }).__sameGrid())).toBe(true);
    await expect(page.locator('[data-salmon-pending]')).toHaveCount(0);
    expect(requested.length).toBe(1);
    // Off and on again: the loaded feature is reused.
    await page.evaluate(() => window.__setExtra({ toolbar: [] }));
    await expect(page.getByRole('toolbar')).toHaveCount(0);
    await page.evaluate(() => window.__setExtra({ toolbar: ['print'] }));
    await expect(page.getByRole('toolbar')).toHaveCount(1);
    expect(requested.length).toBe(1);
    expect(problems).toEqual([]);
  });
});
