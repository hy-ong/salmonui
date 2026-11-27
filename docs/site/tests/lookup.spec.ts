import { expect, test, type Page } from '@playwright/test';

// Lookup columns demo: sorting and grouping by a lookup
// column follow the display text, not the stored key (the department keys
// D1..D5 are in a different order than their titles).

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/lookup-columns');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('.salmon-data-grid').first();
const firstDepartment = (page: Page) => grid(page).locator('.salmon-data-grid-rows [data-row-id] .salmon-data-grid-cell[data-column-id="department"]').first();

test('sorting a lookup column orders by the display text', async ({ page }) => {
  const problems = await open(page);
  const header = grid(page).getByRole('columnheader', { name: /Department/ });
  await header.click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect(firstDepartment(page)).toHaveText('Engineering');
  await header.click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect(firstDepartment(page)).toHaveText('Operations');
  expect(problems).toEqual([]);
});

test('grouping by a lookup column groups and orders by the display text', async ({ page }) => {
  const problems = await open(page);
  await page.getByRole('button', { name: 'Group by Department' }).click();
  const captions = grid(page).locator('.salmon-data-grid-group-caption');
  await expect(captions.first()).toContainText('Engineering');
  const texts = await captions.allInnerTexts();
  const order = ['Engineering', 'Finance', 'Human resources', 'Marketing', 'Operations'];
  const seen = texts.map((t) => order.find((name) => t.includes(name))).filter((name): name is string => name !== undefined);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen).toEqual(order.slice(0, seen.length));
  expect(problems).toEqual([]);
});
