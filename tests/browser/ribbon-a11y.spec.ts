import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// Ribbon recipe accessibility: axe over the classic and simplified layouts, the overflow menu
// with group popups and the minimized ribbon's popup, in LTR and RTL. The file
// name matches the `test:a11y` filter (`a11y.spec`).

const URL = `${DEV_URL}ribbon.html`;
// aria-controls on aria-haspopup triggers (More, File, SplitButton) is needs-review for axe, as in toolbar-a11y.spec.ts.
const reviewed = ['aria-valid-attr-value'];

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${URL}?${query}`);
  await expect(page.locator('#rb')).toBeVisible();
}

test.describe('Ribbon accessibility', () => {
  test('roles: tablist and tabs, the panel toolbar with named groups, the launcher', async ({ page }) => {
    await open(page, 'width=1200');
    await expect(page.getByRole('tablist', { name: 'Ribbon tabs' })).toBeVisible();
    const panel = page.getByRole('tabpanel', { name: 'Home' });
    await expect(panel.getByRole('toolbar', { name: 'Home commands' })).toHaveAttribute('aria-orientation', 'horizontal');
    await expect(panel.getByRole('group', { name: 'Clipboard' }).getByRole('button', { name: 'Clipboard options' })).toBeVisible();
  });

  for (const variant of ['', 'dir=rtl']) {
    test(`axe: classic, overflow menu open, simplified and minimized (${variant || 'ltr'})`, async ({ page }) => {
      await open(page, `width=1200${variant ? `&${variant}` : ''}`);
      await expectClean(page, `ribbon ${variant} classic`, reviewed);
      await page.evaluate(() => (window as unknown as { __setWidth: (n: number) => void }).__setWidth(420));
      await expect(page.locator('#rb .salmon-toolbar-more')).toBeVisible();
      await page.locator('#rb .salmon-toolbar-more').click();
      await expect(page.locator('.salmon-toolbar-menu [role="menu"]')).toBeVisible();
      await expectClean(page, `ribbon ${variant} overflow menu`, reviewed);
      await page.keyboard.press('Escape');
      await page.locator('#layout').click();
      await expectClean(page, `ribbon ${variant} simplified`, reviewed);
      await page.locator('#collapse').click();
      await page.getByRole('tab', { name: 'Insert' }).click();
      await expect(page.getByRole('dialog', { name: 'Ribbon commands' })).toBeVisible();
      await expectClean(page, `ribbon ${variant} minimized popup`, reviewed);
    });
  }
});
