import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// TreeView accessibility: the flat ARIA tree, an ARIA snapshot, the single
// tab stop, and axe in light, dark and RTL with checks, a selection, an
// error row and the rename editor. The file name matches the `test:a11y`
// filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const URL = `${DEV_URL}tree-view.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(page.locator('#main [role="treeitem"]').first()).toBeVisible();
}

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await run.run({ include: [['.salmon-tree-view']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

test.describe('TreeView accessibility', () => {
  test('ARIA: flat tree with level / setsize / posinset, multiselectable, tri-state checks, disabled items', async ({ page }) => {
    await open(page);
    const tree = page.getByRole('tree', { name: 'Files' });
    await expect(tree).toHaveAttribute('aria-multiselectable', 'true');
    const docs = page.locator('#main [role="treeitem"]').first();
    await expect(docs).toHaveAttribute('aria-level', '1');
    await expect(docs).toHaveAttribute('aria-setsize', '6');
    await expect(docs).toHaveAttribute('aria-posinset', '1');
    await expect(docs).toHaveAttribute('aria-expanded', 'true');
    await expect(docs).toHaveAttribute('aria-checked', 'mixed');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    const receipts = page.getByRole('treeitem', { name: 'Receipts' });
    await expect(receipts).toHaveAttribute('aria-disabled', 'true');
    await expect(receipts).toHaveAttribute('aria-level', '3');
    await expect(receipts).toHaveAttribute('aria-posinset', '3');
    // A disabled item is still focusable (APG) but does not change.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(receipts).toBeFocused();
    await page.keyboard.press('Space');
    await expect(receipts).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#main [tabindex="0"]')).toHaveCount(1);
  });

  test('ARIA snapshot of the expanded tree', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toMatchAriaSnapshot(`
      - tree "Files":
        - treeitem "Documents" [checked=mixed] [expanded] [level=1] [selected]
        - treeitem "CV.pdf" [level=2]
        - treeitem "Taxes" [checked=mixed] [level=2]
        - treeitem "Letters" [level=2]
        - treeitem "Pictures" [level=1]
        - treeitem "Broken share" [level=1]
        - treeitem "Music" [level=1]
        - treeitem "Website" [level=1]:
          - link "Website":
            - /url: "#site-link"
        - treeitem "Notes" [level=1]
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations (${variant || 'light'})`, async ({ page }) => {
      await open(page, variant);
      await page.locator('#main [role="treeitem"]').first().click();
      await page.keyboard.press('ArrowRight');
      await page.getByRole('treeitem', { name: /Broken share/ }).locator('.salmon-tree-view-twisty').click();
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.getByRole('treeitem', { name: /Notes/ }).click();
      await page.keyboard.press('F2');
      await expect(page.locator('.salmon-tree-view-rename')).toBeFocused();
      expect(await axe(page)).toEqual([]);
    });
  }
});
