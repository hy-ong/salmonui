import { expect, test } from '@playwright/test';
import { collectProblems, SSR_URL } from './helpers.ts';

// SSR and hydration: the server markup is
// the initial range, hydration in StrictMode development mode reports no
// warning or recoverable error, and the hydrated grid virtualizes normally.

test.describe('SSR and hydration (Vite SSR, development)', () => {
  test('hydrates without warnings and keeps the server markup', async ({ page }) => {
    const problems = collectProblems(page);
    const response = await page.request.get(SSR_URL);
    const html = await response.text();
    expect(html).toContain('role="grid"');
    expect(html).toMatch(/data-row-id="o0"/);
    const serverRows = [...html.matchAll(/class="salmon-data-grid-row[^"]*"[^>]*data-row-id="([^"]+)"|data-row-id="([^"]+)"[^>]*class="salmon-data-grid-row/g)].length;
    expect(serverRows).toBeGreaterThan(0);
    // The server renders the deterministic initial range, never the dataset.
    expect(serverRows).toBeLessThanOrEqual(40);

    await page.goto(SSR_URL);
    await page.waitForFunction(() => window.__hydrated === true);
    await page.waitForTimeout(100);
    expect(await page.locator('[role="grid"]').count()).toBe(1);
    expect(await page.locator('.salmon-data-grid-row[data-row-id="o0"]').count()).toBe(1);
    expect(problems).toEqual([]);
  });

  test('the hydrated grid scrolls and renders deep rows', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(SSR_URL);
    await page.waitForFunction(() => window.__hydrated === true);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop = 36 * 9_000;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(page.locator('.salmon-data-grid-row[data-row-id="o9000"]')).toHaveCount(1);
    expect(await page.locator('.salmon-data-grid-rows .salmon-data-grid-row').count()).toBeLessThanOrEqual(40);
    expect(problems).toEqual([]);
  });

  // SSR gate: the server renders render features synchronously; the client keeps the server HTML in the
  // grid's own Suspense boundary until the feature chunk arrives, then hydrates without a mismatch.
  test('a render feature (paging) hydrates after its chunk without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    const url = `${SSR_URL}?features=paging`;
    const html = await (await page.request.get(url)).text();
    expect(html).toContain('role="grid"');
    expect(html).toContain('class="salmon-data-grid-pager"');
    // The server markup is complete (no placeholder); the grid is marked pending until it hydrates.
    expect(html).not.toContain('aria-busy="true"');
    expect(html).toMatch(/role="grid"[^>]*data-salmon-pending=""/);
    const chunks: string[] = [];
    page.on('request', (request) => {
      if (/feature-paging/.test(request.url())) chunks.push(request.url());
    });
    await page.goto(url);
    await page.waitForFunction(() => (window as { __gridReady?: boolean }).__gridReady === true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(await page.locator('[data-salmon-pending]').count()).toBe(0);
    expect(await page.locator('.salmon-data-grid-pager').count()).toBe(1);
    // Hydrated: the pager responds.
    await page.locator('.salmon-data-grid-pager__next').click();
    await expect(page.locator('.salmon-data-grid-pager')).toHaveAttribute('data-page', '2');
    expect(problems).toEqual([]);
  });
});
