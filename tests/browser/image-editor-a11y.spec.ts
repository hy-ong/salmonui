import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// ImageEditor accessibility: ARIA snapshot and axe in light, dark and RTL for the editor
// with a panel and the quick-access toolbar open. The file name matches the
// `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function axe(page: Page, include: string[]): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (selectors) => {
    const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const present = selectors.filter((s) => document.querySelector(s));
    const result = await run.run({ include: present.map((s) => [s]) }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  }, include);
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${DEV_URL}image-editor.html?${query}`);
  await expect(page.locator('.salmon-image-editor')).toHaveAttribute('data-status', 'ready');
  await expect(page.locator('.salmon-image-editor-canvas')).toHaveAttribute('data-interactive', '');
}

test.describe('ImageEditor accessibility', () => {
  test('ARIA: labelled toolbar, canvas image with a description, live region', async ({ page }) => {
    await open(page, 'annotations');
    const canvas = page.getByRole('img', { name: 'Edited image' });
    await expect(canvas).toHaveAttribute('aria-describedby', /.+/);
    await expect(canvas).toHaveAccessibleDescription(/Arrow keys move the selection/);
    await expect(page.getByRole('toolbar', { name: 'Image editing' })).toBeVisible();
    await expect(page.locator('.salmon-image-editor [role="status"][aria-live="polite"]')).toHaveCount(1);
    // Selecting by keyboard opens the style panel and the quick-access toolbar.
    await canvas.focus();
    await page.keyboard.press(']');
    await expect(page.getByRole('toolbar', { name: 'Selection actions' })).toMatchAriaSnapshot(`
      - toolbar "Selection actions":
        - button "Duplicate"
        - button "Bring forward"
        - button "Send backward"
        - button "Bring to front"
        - button "Send to back"
        - button "Delete"
    `);
    await expect(page.getByRole('group', { name: 'Rectangle' })).toBeVisible();
    await expect(page.locator('.salmon-image-editor [role="status"]')).toHaveText(/Selected: Rectangle 1 \/ 2/);
  });

  for (const query of ['annotations', 'annotations&scheme=dark', 'annotations&dir=rtl']) {
    test(`axe: toolbar, canvas, panels and the quick toolbar (${query})`, async ({ page }) => {
      await open(page, query);
      expect(await axe(page, ['.salmon-image-editor'])).toEqual([]);
      await page.getByRole('img', { name: 'Edited image' }).focus();
      await page.keyboard.press(']');
      await expect(page.getByRole('toolbar', { name: 'Selection actions' })).toBeVisible();
      expect(await axe(page, ['.salmon-image-editor'])).toEqual([]);
      for (const tool of ['Crop', 'Finetune', 'Filter', 'Frame', 'Resize', 'Straighten', 'Redact', 'Text']) {
        await page.getByRole('toolbar', { name: 'Image editing' }).getByRole('button', { name: tool, exact: true }).click();
        await expect(page.locator('.salmon-image-editor-panel')).toBeVisible();
        expect(await axe(page, ['.salmon-image-editor']), tool).toEqual([]);
      }
    });
  }
});
