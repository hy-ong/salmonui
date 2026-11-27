import { expect, test } from '@playwright/test';
import { collectProblems, placeholdersIn } from '../browser/helpers.ts';

// Structural budget "Hydration warnings (Vite SSR, Next App
// Router): 0" and "Console errors or warnings during any browser test: 0".
// Runs against `next dev` (StrictMode development build, where React and Next
// report hydration mismatches loudly) started by playwright.ssr.config.ts.
export const NEXT_URL = `http://localhost:${Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730) + 50}/`;

test.describe('SSR and hydration (Next.js App Router, development)', () => {
  test('server HTML holds the initial range and hydration reports nothing', async ({ page }) => {
    const problems = collectProblems(page);
    const html = await (await page.request.get(NEXT_URL)).text();
    expect(html).toContain('role="grid"');
    expect(html).toMatch(/data-row-id="o0"/);
    const serverRows = [...html.matchAll(/role="row"/g)].length;
    expect(serverRows).toBeGreaterThan(1);
    expect(serverRows).toBeLessThanOrEqual(41);
    expect([...html.matchAll(/<style[^>]*salmonui-theme/g)].length).toBe(1);

    await page.goto(NEXT_URL);
    await page.waitForFunction(() => (window as { __hydrated?: boolean }).__hydrated === true);
    await page.waitForTimeout(300);
    expect(await page.locator('[role="grid"]').count()).toBe(1);
    expect(await page.locator('.salmon-data-grid-row[data-row-id="o0"]').count()).toBe(1);
    // The Next dev indicator in <nextjs-portal> turns into an error badge with
    // an issues button when it caught an error (hydration errors included).
    const overlay = await page.evaluate(() => {
      const shadow = document.querySelector('nextjs-portal')?.shadowRoot;
      return {
        errorBadge: shadow?.querySelectorAll('[data-next-badge][data-error="true"]').length ?? 0,
        issues: shadow?.querySelector('[data-issues-open]')?.textContent?.trim() ?? '',
      };
    });
    expect(overlay).toEqual({ errorBadge: 0, issues: '' });
    expect(problems).toEqual([]);
  });

  test('the hydrated grid scrolls and renders deep rows', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(NEXT_URL);
    await page.waitForFunction(() => (window as { __hydrated?: boolean }).__hydrated === true);
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

  // `/features` (static) and `/features/dynamic` (rendered per request) stream a grid with
  // `paging` as plain markup: no placeholder, no boundary of the grid's own to outline and swap. Hydration waits
  // for the paging chunk, then the grid is interactive.
  for (const path of ['features', 'features/dynamic']) test(`a render feature (paging) streams plain markup and hydrates after its chunk (/${path})`, async ({ page }) => {
    const problems = collectProblems(page);
    const url = `${NEXT_URL}${path}`;
    const html = await (await page.request.get(url)).text();
    expect(html).toContain('role="grid"');
    expect(html).toContain('class="salmon-data-grid-pager"');
    expect(placeholdersIn(html)).toBe(0);
    // The grid is in the shell, not in an outlined segment swapped in by $RC.
    expect(html).not.toMatch(/<div hidden id="S:\d+">[\s\S]*role="grid"/);
    expect(html).toMatch(/role="grid"[^>]*data-salmon-pending=""/);
    const chunks: string[] = [];
    page.on('response', async (response) => {
      if (!/\/_next\/static\/.*\.js/.test(response.url())) return;
      const body = await response.text().catch(() => '');
      // Dev chunks are named by path; the paging controller (paging-ui.js) is only in the feature chunk.
      if (/feature-paging/.test(response.url()) || body.includes('createPagingUi')) chunks.push(response.url());
    });
    await page.goto(url);
    await page.waitForFunction(() => (window as { __gridReady?: boolean }).__gridReady === true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(await page.locator('[data-salmon-pending]').count()).toBe(0);
    await page.locator('.salmon-data-grid-pager__next').click();
    await expect(page.locator('.salmon-data-grid-pager')).toHaveAttribute('data-page', '2');
    const overlay = await page.evaluate(() => document.querySelector('nextjs-portal')?.shadowRoot?.querySelectorAll('[data-next-badge][data-error="true"]').length ?? 0);
    expect(overlay).toBe(0);
    expect(problems).toEqual([]);
  });
});
