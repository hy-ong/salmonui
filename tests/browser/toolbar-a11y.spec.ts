import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// Toolbar accessibility: APG Toolbar roles and states, ARIA snapshots,
// and axe with the overflow menu open in light, dark and RTL. The file name
// matches the `test:a11y` filter (`a11y.spec`).

const URL = `${DEV_URL}toolbar.html`;
// axe reports aria-controls on an aria-haspopup trigger as needs-review (it cannot tell whether a popup
// id must exist yet), as for the Menu family (a11y.spec.ts); toolbar.spec.ts asserts the id.
const reviewed = ['aria-valid-attr-value'];

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${URL}?${query}`);
  await expect(page.locator('#main .salmon-toolbar-item[hidden]').first()).toBeAttached();
}

test.describe('Toolbar accessibility', () => {
  test('ARIA: role, orientation, names, separators and the overflow button state', async ({ page }) => {
    await open(page, 'width=340');
    const main = page.getByRole('toolbar', { name: 'Formatting' });
    await expect(main).toHaveAttribute('aria-orientation', 'horizontal');
    await expect(page.getByRole('toolbar', { name: 'Vertical' })).toHaveAttribute('aria-orientation', 'vertical');
    await expect(page.locator('#vertical [role="separator"]')).toHaveAttribute('aria-orientation', 'horizontal');
    await expect(page.locator('#main [role="separator"]').first()).toHaveAttribute('aria-orientation', 'vertical');
    const more = main.getByRole('button', { name: 'More' });
    await expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('toolbar', { name: 'Disabled' })).toHaveAttribute('aria-disabled', 'true');
    // Overflowed controls are out of the accessibility tree (hidden), not duplicated.
    await expect(main.getByRole('button', { name: 'Redo' })).toHaveCount(0);
  });

  test('ARIA snapshot of a wide toolbar and of the overflow menu', async ({ page }) => {
    await open(page, 'width=900');
    await expect(page.locator('#main')).toMatchAriaSnapshot(`
      - toolbar "Formatting":
        - button "Bold"
        - button "Italic"
        - separator
        - textbox "Find": abc
        - button "Cut"
        - button "Copy" [disabled]
        - button "Paste"
        - separator
        - button "Undo"
        - button "Redo"
        - button "More"
    `);
    await page.locator('#main .salmon-toolbar-more').click();
    await expect(page.locator('.salmon-toolbar-menu')).toMatchAriaSnapshot(`
      - menu "More":
        - menuitem "Settings"
    `);
  });

  test('the app bar header is the banner landmark and contains a named toolbar', async ({ page }) => {
    await open(page, 'width=900');
    await expect(page.getByRole('banner').getByRole('toolbar', { name: 'Application' })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('toolbar', { name: 'Bottom bar' })).toBeVisible();
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations with the overflow menu open (${variant || 'light'})`, async ({ page }) => {
      await open(page, `width=340${variant ? `&${variant}` : ''}`);
      await expectClean(page, `toolbar ${variant || 'light'} closed`);
      await page.locator('#main .salmon-toolbar-more').click();
      await expect(page.locator('.salmon-toolbar-menu [role="menu"]')).toBeVisible();
      await expectClean(page, `toolbar ${variant || 'light'} menu open`, reviewed);
    });
  }
});
