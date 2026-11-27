import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Mention accessibility: ARIA on the field and the list, an ARIA snapshot, and
// axe with the list open in light, dark, RTL and on an <input>. The file
// name matches the `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

const field = (page: Page) => page.locator('#field');
const popup = (page: Page) => page.locator('.salmon-mention-popup');
const options = (page: Page) => page.locator('.salmon-mention-popup [role="option"]');

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}mention.html${query ? `?${query}` : ''}`);
  await field(page).click();
}

test.describe('Mention accessibility', () => {
  test('ARIA: the field carries combobox attributes only while the list is open', async ({ page }) => {
    await open(page);
    const f = field(page);
    await expect(f).not.toHaveAttribute('aria-controls');
    await page.keyboard.type('@');
    await expect(f).toHaveAttribute('aria-autocomplete', 'list');
    // aria-expanded is not allowed on a textbox (axe aria-allowed-attr): the field keeps its role, so it is not set.
    await expect(f).not.toHaveAttribute('aria-expanded');
    const controls = (await f.getAttribute('aria-controls'))!;
    expect(await popup(page).getAttribute('id')).toBe(controls);
    await expect(popup(page).getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    const activeId = (await f.getAttribute('aria-activedescendant'))!;
    const activeOption = page.locator(`[id="${activeId}"]`);
    await expect(activeOption).toHaveText('Bob Jones');
    await expect(activeOption).toHaveAttribute('aria-selected', 'true');
    await expect(options(page).first()).toHaveAttribute('aria-selected', 'false');
    await expect(options(page).nth(2)).toHaveAttribute('aria-disabled', 'true');
    expect(await f.evaluate((el) => el.getAttribute('role'))).toBeNull();
    await page.keyboard.press('Escape');
    for (const attr of ['aria-autocomplete', 'aria-controls', 'aria-activedescendant']) await expect(f).not.toHaveAttribute(attr);
  });

  test('ARIA snapshot of the open list', async ({ page }) => {
    await open(page);
    await page.keyboard.type('@a');
    await expect(popup(page)).toMatchAriaSnapshot(`
      - listbox "Suggestions":
        - option "Alice Smith" [selected]
        - option "Carol White" [disabled]
        - option "Dave Brown"
        - option "Élodie Martin"
        - option "Malik Ali"
    `);
    await page.keyboard.type('zz');
    await expect(popup(page)).toMatchAriaSnapshot(`
      - status: No results
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl', 'field=input']) {
    test(`axe: no violations with the list open (${variant || 'light'})`, async ({ page }) => {
      await open(page, variant);
      await page.keyboard.type('@');
      await page.keyboard.press('ArrowDown');
      await expect(popup(page)).toBeVisible();
      await page.addScriptTag({ path: AXE });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const result = await axe.run({ include: [['.salmon-mention'], ['.salmon-mention-popup']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
    });
  }
});
