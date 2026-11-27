import { expect, type Page } from '@playwright/test';
import { collectProblems } from './helpers.ts';

// The server HTML and hydration contract of the dropdown SSR pages
// (examples/vite-ssr `?dropdowns`, examples/next-app /dropdowns):
// triggers with their labels, hidden form elements and the Listbox lists,
// never a popup, no option of a long list, and a clean hydration.
export async function assertDropdownSsr(page: Page, url: string, waitHydrated: () => Promise<void>): Promise<void> {
  // Markup only: a framework's serialized props (the Next flight payload) carry the data, not rendered options.
  const html = (await (await page.request.get(url)).text()).replace(/<script[\s\S]*?<\/script>/g, '');
  expect(html).toMatch(/role="combobox"[^>]*>[\s\S]*?Kiwi/);
  expect(html).toContain('Apple, Mango');
  expect(html).toContain('Item 9999');
  expect(html).toMatch(/<select[^>]*name="fruit"/);
  expect(html).toMatch(/role="listbox"[^>]*aria-label="Basket"|aria-label="Basket"[^>]*role="listbox"/);
  expect(html).toMatch(/role="grid"/);
  expect(html).toContain('CV.pdf');
  expect(html).not.toContain('salmon-dropdown-popup');
  expect(html).not.toContain('salmon-mention-popup');
  expect(html).not.toContain('salmon-tree-select-popup');
  // Server work does not scale with data: no option of the 10,000-item Select is rendered.
  expect(html).not.toContain('Item 5000');

  const problems = collectProblems(page);
  await page.goto(url);
  await waitHydrated();
  await page.waitForTimeout(200);
  // The hydrated controls work.
  await page.getByRole('combobox', { name: 'Fruit', exact: true }).click();
  await expect(page.locator('.salmon-dropdown-popup').getByRole('option', { name: 'Kiwi' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
}
