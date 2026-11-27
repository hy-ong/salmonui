import { expect, test, type Page } from '@playwright/test';

// Methods and Commands: part elements, fine-grained cell
// subscriptions, a serializable, replayable command stream,
// a custom core module and dispose.

async function open(page: Page, id: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`/demos/data-grid/${id}`);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('[role="grid"]').first();
const rows = (page: Page) => grid(page).locator('.salmon-data-grid-rows [data-row-id]');
const log = (page: Page) => page.getByRole('log', { name: 'Event log' });

test('grid-internals: part elements, cell subscription and dispose', async ({ page }) => {
  const problems = await open(page, 'grid-internals');
  await expect(rows(page).first()).toBeVisible();
  await page.getByRole('button', { name: 'Read part elements' }).click();
  await expect(log(page)).toContainText(/element: salmon-data-grid; header: salmon-data-grid-\S+; body: salmon-data-grid-\S+; Amount header: Amount/);

  await page.getByRole('button', { name: 'Add 1 to ORD-10001 amount' }).click();
  await expect(log(page).locator('li', { hasText: 'subscribeCell ORD-10001/amount: $' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Dispose a standalone engine' }).click();
  await expect(log(page)).toContainText(/standalone engine: 3 rows, disposed=true, dispatch after dispose: (rejected|throws)/);
  expect(problems).toEqual([]);
});

test('grid-internals: custom module command and command replay', async ({ page }) => {
  const problems = await open(page, 'grid-internals');
  await expect(rows(page).first()).toBeVisible();
  await page.getByRole('button', { name: 'Keep amounts ≥ 500 (custom module)' }).click();
  await expect(log(page)).toContainText(/minAmount\.set: applied; \d+ view rows/);
  const filtered = Number((await log(page).locator('li').first().textContent())?.match(/(\d+) view rows/)?.[1]);
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(500);

  await grid(page).locator('[role="columnheader"][data-column-id="amount"]').click();
  const recorded = page.getByLabel('Recorded commands');
  await expect(recorded).toContainText('"type":"minAmount.set"');
  await expect(recorded).toContainText('"type":"sort.');
  const firstSorted = await rows(page).first().getAttribute('data-row-id');

  await page.getByRole('button', { name: 'Reset and replay' }).click();
  await expect(log(page)).toContainText(`first row ${firstSorted}`);
  await expect(grid(page).locator('[role="columnheader"][data-column-id="amount"]')).toHaveAttribute('aria-sort', 'ascending');
  expect(problems).toEqual([]);
});
