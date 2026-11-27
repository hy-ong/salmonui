import { expect, test } from '@playwright/test';
import { collectProblems } from '../browser/helpers.ts';

const NEXT_URL = `http://localhost:${Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730) + 50}/`;

// A compact, tinted theme with sidebar, app bar and table header surfaces
// server-renders its one theme style and
// hydrates without a warning; the server HTML already carries the compact
// grid metrics, so nothing moves on hydration.
test.describe('SSR: theme appearance settings (Next.js App Router, development)', () => {
  test('compact density, font, tint and surfaces render on the server and hydrate silently', async ({ page }) => {
    const problems = collectProblems(page);
    const url = `${NEXT_URL}appearance`;
    const html = await (await page.request.get(url)).text();
    expect([...html.matchAll(/<style[^>]*salmonui-theme/g)].length).toBe(1);
    expect(html).toContain('--salmon-control-height-md: 28px;');
    expect(html).toContain('[data-salmon-surface="sidebar"]');
    expect(html).toContain('--salmon-data-grid-row-height:32px');
    expect(html).toMatch(/<nav[^>]*data-salmon-surface="sidebar"/);

    await page.goto(url);
    await page.waitForFunction(() => (window as { __hydrated?: boolean }).__hydrated === true);
    await page.waitForTimeout(300);
    const metrics = await page.evaluate(() => {
      const css = (selector: string) => getComputedStyle(document.querySelector(selector) as Element);
      return {
        sidebar: css('.salmon-sidebar-panel').backgroundColor,
        appBar: css('[data-salmon-surface="app-bar"]').backgroundColor,
        header: css('[data-salmon-surface="table-header"]').backgroundColor,
        button: (document.querySelector('.salmon-button') as HTMLElement).getBoundingClientRect().height,
        row: (document.querySelector('.salmon-data-grid-row') as HTMLElement).getBoundingClientRect().height,
        font: css('.salmon-button').fontFamily,
      };
    });
    expect(metrics.sidebar).toBe('rgb(25, 34, 37)');
    expect(metrics.appBar).toBe('rgb(255, 255, 255)');
    expect(metrics.header).toBe('rgb(14, 77, 92)');
    expect(metrics.button).toBe(28);
    expect(metrics.row).toBe(32);
    expect(metrics.font).toMatch(/^Inter/);
    const overlay = await page.evaluate(() => document.querySelector('nextjs-portal')?.shadowRoot?.querySelectorAll('[data-next-badge][data-error="true"]').length ?? 0);
    expect(overlay).toBe(0);
    expect(problems).toEqual([]);
  });
});
