import { expect, test, type Page } from '@playwright/test';

// Sorting demo on a touch screen: a header tap shows the
// Multi-sort toggle; while it is pressed, taps add columns to the sort.

test.use({ hasTouch: true });

const grid = (page: Page) => page.locator('.salmon-data-grid').first();
const header = (page: Page, id: string) => grid(page).locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);

test('sorting demo: touch Multi-sort toggle adds tapped columns to the sort', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/sorting');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await header(page, 'customer').tap();
  await expect(header(page, 'customer')).toHaveAttribute('aria-sort', 'ascending');
  await expect(header(page, 'priority')).toHaveAttribute('aria-sort', 'none');
  const toggle = page.getByRole('button', { name: 'Multi-sort' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await header(page, 'amount').tap();
  await expect(header(page, 'customer')).toHaveAttribute('aria-sort', 'ascending');
  await expect(header(page, 'amount')).toHaveAttribute('aria-sort', 'ascending');
  await expect(header(page, 'amount').locator('.salmon-data-grid-sort-indicator__order')).toHaveText('2');
  expect(problems).toEqual([]);
});
