import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// Pager accessibility: navigation landmarks with names, aria-current, labelled
// first/previous/next/last buttons, an ARIA snapshot, keyboard focus, and
// axe in light, dark and RTL. The file name matches the `test:a11y` filter.

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}pager.html${query ? `?${query}` : ''}`);
  await expect(page.locator('#basic')).toBeVisible();
}

test.describe('Pager accessibility', () => {
  test('landmarks, current page and labelled buttons', async ({ page }) => {
    await open(page);
    for (const name of ['Basic pages', 'Controlled pages', 'Unknown total', 'Template pages', 'Narrow pages']) await expect(page.getByRole('navigation', { name })).toBeVisible();
    const basic = page.getByRole('navigation', { name: 'Basic pages' });
    await expect(basic.locator('[aria-current="page"]')).toHaveAccessibleName('Page 1');
    await expect(basic.locator('[aria-current]')).toHaveCount(1);
    for (const name of ['First page', 'Previous page', 'Next page', 'Last page', 'Next pages']) await expect(basic.getByRole('button', { name, exact: true })).toHaveCount(1);
    await expect(basic.getByRole('button', { name: 'First page', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await expect(basic.getByRole('combobox', { name: 'Items per page' })).toBeVisible();
  });

  test('ARIA snapshot of a pager', async ({ page }) => {
    await open(page);
    await expect(page.locator('#controlled')).toMatchAriaSnapshot(`
      - navigation "Controlled pages":
        - button "First page" [disabled]
        - button "Previous page" [disabled]
        - button "Page 1": "1"
        - button "Page 2": "2"
        - button "Page 3": "3"
        - button "Page 4": "4"
        - button "Page 5": "5"
        - button "Page 6": "6"
        - button "Page 7": "7"
        - button "Page 8": "8"
        - button "Next pages"
        - button "Next page"
        - button "Last page"
        - combobox "Items per page":
          - option "10" [selected]
          - option "20"
          - option "50"
          - option "100"
          - option "All"
        - text: Items per page 1 of 20 pages (200 items)
    `);
  });

  test('keyboard: focus is visible and follows the current page', async ({ page }) => {
    await open(page);
    await page.locator('#basic [data-part="first"]').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = page.locator('#basic [aria-current="page"]');
    await expect(focused).toBeFocused();
    expect(await focused.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    await page.keyboard.press('PageDown');
    await expect(page.locator('#basic [aria-current="page"]')).toBeFocused();
    await expect(page.locator('#basic [aria-current="page"]')).toHaveAccessibleName('Page 2');
    const outline = await page.locator('#basic [aria-current="page"]').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations (${variant || 'light'})`, async ({ page }) => {
      await open(page, variant);
      await page.locator('#basic [data-part="next"]').click();
      // label-content-name-mismatch (needs review): the "Next pages" ellipsis button, as in the Data Grid pager (a11y.spec.ts).
      await expectClean(page, `pager ${variant || 'light'}`, ['label-content-name-mismatch']);
    });
  }
});
