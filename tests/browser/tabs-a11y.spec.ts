import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Tabs accessibility: APG Tabs roles and states, an ARIA snapshot, and axe in light,
// dark, RTL and vertical placement, plus the overflow menu open. The file
// name matches the `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function axe(page: Page, include: string[][]): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (ctx) => {
    const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await run.run({ include: ctx }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  }, include);
}

test.describe('Tabs accessibility', () => {
  test('ARIA: tablist, tab and tabpanel roles, states and relationships', async ({ page }) => {
    await page.goto(`${DEV_URL}tabs.html`);
    const list = page.getByRole('tablist', { name: 'Settings' });
    await expect(list).toHaveAttribute('aria-orientation', 'horizontal');
    const general = list.getByRole('tab', { name: 'General' });
    await expect(general).toHaveAttribute('aria-selected', 'true');
    const panelId = (await general.getAttribute('aria-controls'))!;
    const panel = page.locator(`[id="${panelId}"]`);
    await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', (await general.getAttribute('id'))!);
    await expect(page.getByRole('tabpanel', { name: 'General' })).toBeVisible();
    await expect(list.getByRole('tab', { name: 'Disabled' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('ARIA snapshot of the tab list', async ({ page }) => {
    await page.goto(`${DEV_URL}tabs.html`);
    await expect(page.locator('#basic')).toMatchAriaSnapshot(`
      - tablist "Settings":
        - tab "General" [selected]
        - tab "Billing"
        - tab "Disabled" [disabled]
        - tab "Locked"
        - tab "Notifications"
      - tabpanel "General":
        - paragraph: Panel general
    `);
    await expect(page.locator('#closable [role="tablist"]')).toMatchAriaSnapshot(`
      - tablist "Documents":
        - tab "Doc one"
        - tab "Doc two" [selected]
        - tab "Doc three"
        - tab "Doc four"
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl', 'placement=start', 'placement=end&scheme=dark']) {
    test(`axe: no violations (${variant || 'light'})`, async ({ page }) => {
      await page.goto(`${DEV_URL}tabs.html${variant ? `?${variant}` : ''}`);
      await expect(page.locator('#menu .salmon-tab-more')).toBeVisible();
      await page.locator('#closable [role="tab"][data-value="two"]').focus();
      expect(await axe(page, [['.salmon-tabs']])).toEqual([]);
    });
  }

  test('axe: no violations with the overflow menu open', async ({ page }) => {
    await page.goto(`${DEV_URL}tabs.html`);
    await page.locator('#menu .salmon-tab-more').click();
    await expect(page.getByRole('menu', { name: 'More tabs' })).toBeVisible();
    await expect(page.locator('#menu .salmon-tab-more')).toHaveAttribute('aria-controls', (await page.getByRole('menu').getAttribute('id'))!);
    expect(await axe(page, [['#menu'], ['.salmon-tabs-menu-layer']])).toEqual([]);
  });
});
