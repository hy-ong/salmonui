import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Breadcrumbs accessibility: the APG Breadcrumb landmark, list and current
// item, the ellipsis menu button and its menu, an ARIA snapshot, and axe in
// light, dark and RTL. The file name matches the `test:a11y` filter.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await run.run({ include: [['.salmon-breadcrumbs'], ['.salmon-menu']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

test.describe('Breadcrumbs accessibility', () => {
  test('ARIA snapshot: a named navigation landmark with an ordered list and the current page', async ({ page }) => {
    await page.goto(`${DEV_URL}breadcrumbs.html`);
    await expect(page.locator('#basic')).toMatchAriaSnapshot(`
      - navigation "Breadcrumb":
        - list:
          - listitem:
            - link "Home":
              - /url: "#home"
          - listitem:
            - link "Docs":
              - /url: "#docs"
          - listitem: Tabs
    `);
    await expect(page.locator('#basic [aria-current="page"]')).toHaveText('Tabs');
    expect(await page.locator('#basic').evaluate((el) => el.tagName)).toBe('NAV');
    expect(await page.locator('#basic > ol').count()).toBe(1);
  });

  test('ARIA snapshot: collapsed items are out of the tree; the ellipsis is a menu button', async ({ page }) => {
    await page.goto(`${DEV_URL}breadcrumbs.html`);
    await expect(page.locator('#max')).toMatchAriaSnapshot(`
      - navigation "max trail":
        - list:
          - listitem:
            - link "Home"
          - listitem:
            - button "Show hidden breadcrumbs"
          - listitem:
            - link "Gaming"
          - listitem: Model X
    `);
    const button = page.locator('#max .salmon-breadcrumbs-ellipsis');
    await expect(button).toHaveAttribute('aria-haspopup', 'menu');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const menuId = await button.getAttribute('aria-controls');
    await expect(page.locator(`[id="${menuId}"]`)).toMatchAriaSnapshot(`
      - menu "Show hidden breadcrumbs":
        - menuitem "Products"
        - menuitem "Electronics"
        - menuitem "Computers"
        - menuitem "Laptops"
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations, ellipsis menu open (${variant || 'light'})`, async ({ page }) => {
      await page.goto(`${DEV_URL}breadcrumbs.html${variant ? `?${variant}` : ''}`);
      await page.locator('#expand .salmon-breadcrumbs-ellipsis').click();
      await page.locator('#max .salmon-breadcrumbs-ellipsis').click();
      await expect(page.locator('.salmon-menu[role="menu"]')).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  }
});
