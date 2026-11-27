import { expect, test, type Page } from '@playwright/test';
import { collectProblems, placeholdersIn, SSR_URL } from './helpers.ts';

// SSR gate for render features: a grid whose props turn on a render feature renders its
// plain markup on the server in every SSR mode (no placeholder, no Suspense
// boundary of its own, nothing to outline or swap), and hydration keeps the
// server HTML until the feature chunk arrives: the nearest ancestor boundary,
// or the root, waits. React 19 does not replay a discrete event on a tree
// that stays blocked after its synchronous hydration attempt: a click during
// the wait is dropped (as it was with the grid's own boundary), and the grid
// responds once hydrated.

/**
 * Server markup checks shared by every mode. With `appBoundary` the app's own
 * Suspense boundary may be outlined by a streaming renderer (its fallback is
 * the app's, `null` here); the grid itself never adds a boundary.
 */
function expectPlainGridMarkup(html: string, appBoundary = false): void {
  expect(html).toContain('role="grid"');
  expect(html).toContain('class="salmon-data-grid-pager"');
  // No placeholder (a pending element without role="grid").
  expect(placeholdersIn(html)).toBe(0);
  if (appBoundary) return;
  // No outlined boundary and no swap script.
  expect(html).not.toContain('$RC');
  expect(html).not.toContain('<template id="B:');
  expect(html).not.toContain('<!--$?-->');
}

async function holdPagingChunk(page: Page): Promise<{ release: () => void; requested: string[] }> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested: string[] = [];
  await page.route(/features\/feature-paging/, async (route) => {
    requested.push(route.request().url());
    await held;
    await route.continue();
  });
  return { release, requested };
}

for (const mode of ['string', 'stream'] as const) {
  for (const ancestor of ['root', 'suspense'] as const) {
    const query = `features=paging${mode === 'stream' ? '&stream' : ''}${ancestor === 'suspense' ? '&suspense' : ''}`;
    test(`${mode} SSR, ${ancestor === 'root' ? 'no app boundary' : 'app Suspense boundary'}: plain markup, hydration keeps it until the chunk`, async ({ page }) => {
      const problems = collectProblems(page);
      const url = `${SSR_URL}?${query}`;
      expectPlainGridMarkup(await (await page.request.get(url)).text(), ancestor === 'suspense');

      const { release, requested } = await holdPagingChunk(page);
      // `load` would wait for the held chunk.
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await expect.poll(() => requested.length).toBeGreaterThan(0);
      await page.waitForTimeout(150);
      // While the chunk is held: the server grid stays (no placeholder), still marked pending.
      expect(await page.locator('[data-salmon-pending]:not([role="grid"])').count()).toBe(0);
      await expect(page.locator('[role="grid"][data-salmon-pending]')).toHaveCount(1);
      expect(await page.locator('.salmon-data-grid-row[data-row-id="o0"]').count()).toBe(1);
      // A click before hydration is dropped by React 19 (no error, no page change).
      await page.locator('.salmon-data-grid-pager__next').click();
      release();
      await page.waitForFunction(() => (window as { __gridReady?: boolean }).__gridReady === true);
      await expect(page.locator('[data-salmon-pending]')).toHaveCount(0);
      await expect(page.locator('.salmon-data-grid-pager')).toHaveAttribute('data-page', '1');
      await page.locator('.salmon-data-grid-pager__next').click();
      await expect(page.locator('.salmon-data-grid-pager')).toHaveAttribute('data-page', '2');
      expect(problems).toEqual([]);
    });
  }
}

test('the features prop removes the wait: no gate on the server or the client', async ({ page }) => {
  const problems = collectProblems(page);
  const url = `${SSR_URL}?features=paging,preload&stream`;
  const html = await (await page.request.get(url)).text();
  expectPlainGridMarkup(html);
  // Not gated: no pending mark in the server markup.
  expect(html).not.toContain('data-salmon-pending');
  await page.goto(url);
  await page.waitForFunction(() => (window as { __gridReady?: boolean }).__gridReady === true);
  await page.locator('.salmon-data-grid-pager__next').click();
  await expect(page.locator('.salmon-data-grid-pager')).toHaveAttribute('data-page', '2');
  expect(problems).toEqual([]);
});
