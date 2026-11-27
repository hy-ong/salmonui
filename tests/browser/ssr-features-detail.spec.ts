import { expect, test } from '@playwright/test';
import { collectProblems, placeholdersIn, SSR_URL } from './helpers.ts';

// SSR gate for the `detail` render feature on the Vite SSR example
// (`?features=detail`: child grids with two parents expanded from the
// start): the server renders the toggle column and the default-expanded
// child grids as plain markup, and hydration keeps them in place until the
// detail chunk arrives, with no hydration warning.

for (const mode of ['string', 'stream'] as const) {
  test(`${mode} SSR: default-expanded child grids render on the server and hydrate after the detail chunk`, async ({ page }) => {
    const problems = collectProblems(page);
    const url = `${SSR_URL}?features=detail${mode === 'stream' ? '&stream' : ''}`;
    const html = await (await page.request.get(url)).text();
    expect(html).toContain('class="salmon-data-grid-detail-toggle"');
    expect(html.match(/class="salmon-data-grid-child"/g)?.length).toBe(2);
    expect(html).toContain('data-row-id="l0"');
    expect(placeholdersIn(html)).toBe(0);
    expect(html).not.toContain('$RC');
    expect(html).not.toContain('<template id="B:');

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const requested: string[] = [];
    await page.route(/features\/feature-detail/, async (route) => {
      requested.push(route.request().url());
      await held;
      await route.continue();
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => requested.length).toBeGreaterThan(0);
    await page.waitForTimeout(150);
    // While the chunk is held the server grid and its child grids stay (no placeholder).
    expect(await page.locator('[data-salmon-pending]:not([role="grid"])').count()).toBe(0);
    await expect(page.locator('.salmon-data-grid-child')).toHaveCount(2);
    release();
    await page.waitForFunction(() => (window as { __gridReady?: boolean }).__gridReady === true);
    await expect(page.locator('[data-salmon-pending]')).toHaveCount(0);
    await expect(page.locator('.salmon-data-grid-child')).toHaveCount(2);
    const toggle = page.locator('[data-row-id="o0"] .salmon-data-grid-detail-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(page.locator('.salmon-data-grid-child')).toHaveCount(1);
    expect(problems).toEqual([]);
  });
}
