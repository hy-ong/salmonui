import { expect, test, type Page } from '@playwright/test';

// Batch editing over 100,000 virtualized rows: drafts survive scrolling the
// row out of the DOM; group captions never edit.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/batch-virtual');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('.salmon-data-grid');
const cell = (page: Page, rowId: string, columnId: string) => grid(page).locator(`[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);

test('a batch draft survives virtualization and saves', async ({ page }) => {
  const problems = await open(page);
  await cell(page, 'ORD-10001', 'customer').dblclick();
  await cell(page, 'ORD-10001', 'customer').locator('input').fill('Draft customer');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(cell(page, 'ORD-10001', 'customer')).toHaveAttribute('data-dirty', /.*/);

  await page.getByRole('button', { name: 'Scroll to the last row' }).click();
  await expect(grid(page).locator('[data-row-id="ORD-109999"]')).toBeVisible();
  await expect(grid(page).locator('[data-row-id="ORD-10001"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Scroll to the first row' }).click();
  await expect(cell(page, 'ORD-10001', 'customer')).toHaveText('Draft customer');
  await expect(cell(page, 'ORD-10001', 'customer')).toHaveAttribute('data-dirty', /.*/);

  await page.getByRole('button', { name: 'Read pending changes' }).click();
  await expect(page.getByRole('log')).toContainText('pending: 1 dirty cells');
  await page.getByRole('toolbar').getByRole('button', { name: 'Save' }).click();
  // confirmSave defaults on: accept the save prompt.
  await page.locator('dialog.salmon-data-grid-confirm[data-kind="save"] [data-confirm="ok"]').click();
  await expect(page.getByRole('log')).toContainText('saved: ~1 rows');
  await expect(cell(page, 'ORD-10001', 'customer')).not.toHaveAttribute('data-dirty', /.*/);
  expect(problems).toEqual([]);
});

test('group captions are not editable', async ({ page }) => {
  const problems = await open(page);
  await page.getByRole('checkbox', { name: 'Group by country' }).check();
  const caption = grid(page).locator('.salmon-data-grid-group-caption').first();
  await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'true');
  await caption.locator('.salmon-data-grid-group-caption__cell').click();
  // F2 opens no editor on a caption; Enter toggles it instead of editing.
  await page.keyboard.press('F2');
  await expect(grid(page).locator('.salmon-data-grid-editor')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'false');
  await expect(grid(page).locator('.salmon-data-grid-editor')).toHaveCount(0);
  expect(problems).toEqual([]);
});
