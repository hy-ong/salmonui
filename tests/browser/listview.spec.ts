import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Layout ListView fold onto the Dropdowns Listbox: the ListView
// capabilities the shipped Listbox API covers beyond its own. Page: examples/vite-spa/listbox.html?case=listview.

const open = async (page: Page, query = ''): Promise<void> => {
  await page.goto(`${DEV_URL}listbox.html?case=listview${query}`);
  await expect(page.locator('#lv-end')).toBeAttached();
};
const events = (page: Page) => page.evaluate(() => (window as unknown as { __lbEvents: { type: string; detail: unknown }[] }).__lbEvents);

test.describe('ListView on Listbox', () => {
  test('checkboxes at the inline end through classNames.option, mirrored in RTL; clicking toggles', async ({ page }) => {
    for (const query of ['', '&dir=rtl']) {
      await open(page, query);
      const option = page.locator('#lv-end').getByRole('option', { name: 'Banana' });
      const box = (await option.locator('.salmon-listbox-checkbox').boundingBox())!;
      const label = (await option.locator('.salmon-listbox-label').boundingBox())!;
      if (query) expect(box.x, query).toBeLessThan(label.x);
      else expect(box.x).toBeGreaterThan(label.x + label.width);
      await option.click();
      await expect(option).toHaveAttribute('aria-selected', 'true');
      await expect(option.locator('.salmon-listbox-checkbox')).toHaveAttribute('data-checked', '');
      await expect(page.locator('#lv-end [aria-selected="true"]')).toHaveCount(2);
    }
  });

  test('the native onScroll reaches the application with the scroll offset', async ({ page }) => {
    await open(page);
    await page.locator('#lv-end').evaluate((el) => {
      el.scrollTop = 64;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(async () => (await events(page)).filter((e) => e.type === 'scroll').at(-1)?.detail).toBe(64);
  });

  test('a disabled list is out of the tab order and ignores clicks', async ({ page }) => {
    await open(page);
    const list = page.locator('#lv-disabled');
    await expect(list).toHaveAttribute('aria-disabled', 'true');
    await expect(list).toHaveAttribute('tabindex', '-1');
    await list.getByRole('option', { name: 'Apricot' }).click({ force: true });
    await expect(list.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'true');
    await expect(list.getByRole('option', { name: 'Apricot' })).not.toHaveAttribute('aria-selected', 'true');
  });
});
