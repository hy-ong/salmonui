import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// Menubar and ContextMenu accessibility:
// ARIA snapshots of the bar and the
// open menus, keyboard-only operation, and axe with menus open in light, dark
// and RTL. The file name matches the `test:a11y` filter (`a11y.spec`).

const URL = `${DEV_URL}menubar.html`;
// axe reports aria-controls on an aria-haspopup item as needs-review (it cannot tell whether a popup
// id must exist yet), as for the Menu family (a11y.spec.ts); menubar.spec.ts asserts the id.
const reviewed = ['aria-valid-attr-value'];

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(page.locator('#bar')).toBeVisible();
}

test.describe('Menubar and ContextMenu accessibility', () => {
  test('ARIA snapshot: menubar with menuitems, an open menu labelled by its top-level item', async ({ page }) => {
    await open(page);
    await expect(page.locator('#bar')).toMatchAriaSnapshot(`
      - menubar "Editor":
        - menuitem "File"
        - menuitem "Edit":
          - emphasis: Edit
        - menuitem "View"
        - menuitem "Locked"
        - menuitem "Disabled" [disabled]
        - menuitem "Save"
        - menuitem "Help"
    `);
    await page.focus('#m-file');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#m-file')).toHaveAttribute('aria-expanded', 'true');
    const controls = await page.locator('#m-file').getAttribute('aria-controls');
    const popup = page.locator(`[id="${controls}"]`);
    await expect(popup).toHaveAttribute('aria-labelledby', 'm-file');
    await expect(popup).toMatchAriaSnapshot(`
      - menu "File":
        - menuitem "New"
        - menuitem "Open…"
        - menuitem "Recent"
        - separator
        - menuitem "Quit"
    `);
  });

  test('ARIA snapshot: the open context menu with its items, separator and submenu trigger', async ({ page }) => {
    await open(page);
    await page.focus('#canvas');
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu', { name: 'Canvas actions' });
    await expect(menu).toBeVisible();
    await expect(menu).toMatchAriaSnapshot(`
      - menu "Canvas actions":
        - menuitem "Cut"
        - menuitem /Copy/
        - menuitem "Paste" [disabled]
        - menuitem "Docs"
        - separator
        - menuitem "Arrange"
    `);
  });

  test('keyboard only: Tab reaches the bar once, the menu is operable, Escape and focus return', async ({ page }) => {
    await open(page);
    await page.focus('#before');
    await page.keyboard.press('Tab');
    await expect(page.locator('#m-file')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('[role="menu"][aria-labelledby="m-edit"] [role="menuitem"]').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#m-edit')).toBeFocused();
    await page.focus('#canvas');
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu', { name: 'Canvas actions' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Cut' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#canvas')).toBeFocused();
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations with a menubar menu and a context menu open (${variant || 'light'})`, async ({ page }) => {
      await open(page, variant);
      await expectClean(page, 'closed', reviewed);
      await page.focus('#m-file');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press(variant === 'dir=rtl' ? 'ArrowLeft' : 'ArrowRight');
      await expect(page.locator('[role="menu"][aria-labelledby="recent"]')).toBeVisible();
      await expectClean(page, 'menubar menu and submenu open', reviewed);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.focus('#canvas');
      await page.keyboard.press('Shift+F10');
      await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeVisible();
      await expectClean(page, 'context menu open', reviewed);
    });
  }
});
