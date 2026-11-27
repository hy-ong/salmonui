import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// TreeSelect accessibility: axe over the closed triggers and the open popup (a selected
// deep node, checkbox mode with Select all and mixed checks, search with
// highlighted matches, a failed lazy load with Retry) in light, dark and
// RTL. The file name matches the `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const URL = `${DEV_URL}tree-select.html`;

const popup = (page: Page) => page.locator('.salmon-tree-select-popup');
const trigger = (page: Page, name: string) => page.locator(`#ts-${name} button[role="combobox"]`);
const row = (page: Page, label: string) => popup(page).locator('[role="treeitem"]', { has: page.locator('.salmon-dropdown-option-label', { hasText: new RegExp(`^${label}$`) }) });

async function load(page: Page, query = ''): Promise<void> {
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(trigger(page, 'single')).toBeVisible();
}

async function openBy(page: Page, name: string): Promise<void> {
  await trigger(page, name).click();
  await expect(popup(page).locator('[role="treeitem"]').first()).toBeVisible();
}

async function axe(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const include = [...document.querySelectorAll('.salmon-tree-select, .salmon-dropdown-popup')].map((el) => [el]);
    const result = await run.run({ include }, { resultTypes: ['violations'], rules: { region: { enabled: false }, 'page-has-heading-one': { enabled: false }, 'landmark-one-main': { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

test.describe('TreeSelect accessibility', () => {
  test('ARIA of the open tree: treeitem level / setsize / posinset / expanded / selected; checkbox rows carry aria-checked only', async ({ page }) => {
    await load(page);
    await openBy(page, 'single');
    const docs = row(page, 'Documents');
    await expect(docs).toHaveAttribute('aria-level', '1');
    await expect(docs).toHaveAttribute('aria-posinset', '1');
    await expect(docs).toHaveAttribute('aria-setsize', '14');
    await expect(docs).toHaveAttribute('aria-expanded', 'false');
    await expect(docs).toHaveAttribute('aria-selected', 'false');
    const target = row(page, 'Q4 report.pdf');
    await expect(target).toHaveAttribute('aria-level', '4');
    await expect(target).toHaveAttribute('aria-posinset', '2');
    await expect(target).toHaveAttribute('aria-setsize', '2');
    await expect(target).toHaveAttribute('aria-selected', 'true');
    await expect(target).not.toHaveAttribute('aria-expanded', /.*/);
    await expect(page.getByRole('tree', { name: 'Single' })).toBeVisible();
    await page.keyboard.press('Escape');
    await openBy(page, 'checkbox');
    await expect(page.getByRole('tree', { name: 'Checkbox' })).toHaveAttribute('aria-multiselectable', 'true');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-checked', 'false');
    await expect(row(page, 'Documents')).not.toHaveAttribute('aria-selected', /.*/);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations closed and open (${variant || 'light'})`, async ({ page }) => {
      await load(page, variant);
      expect(await axe(page)).toEqual([]);
      // Normal tree with a deep selected node.
      await openBy(page, 'single');
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      // Checkbox mode: Select all, mixed and checked rows, chips in the trigger.
      await openBy(page, 'checkbox');
      await row(page, 'Taxes').click();
      await row(page, 'CV.pdf').click();
      await expect(row(page, 'Documents')).toHaveAttribute('aria-checked', 'mixed');
      await expect(popup(page).locator('.salmon-tree-select-select-all')).toHaveAttribute('aria-checked', 'mixed');
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      expect(await axe(page)).toEqual([]);
      // Search with matches and with no match.
      await openBy(page, 'search');
      await page.keyboard.type('report');
      await expect(popup(page).locator('mark').first()).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.type('zzz');
      await expect(popup(page).locator('.demo-empty')).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      // Lazy loading: a failed load with Retry.
      await openBy(page, 'lazy');
      await row(page, 'Broken share').locator('[data-part="twisty"]').click();
      await expect(popup(page).locator('[data-part="retry"]')).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  }
});
