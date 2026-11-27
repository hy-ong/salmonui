import { expect, test, type Page } from '@playwright/test';

// Virtual scrolling cases Salmon UI supports without restrictions, on
// 100,000 rows x 101 columns: row spans through virtualized rows,
// cell range selection across unrendered rows, Ctrl+Home / Ctrl+End
// under column virtualization (the Desktop Chrome device reports
// Windows, so the Ctrl variant applies), and pinned columns kept out of the
// virtual column range.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/virtual-interactions');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('[role="grid"]').first();
const cell = (page: Page, rowId: string, columnId: string) => grid(page).locator(`[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const log = (page: Page) => page.getByRole('log', { name: 'Event log' });

test('virtual-interactions: row spans render deep in the virtualized rows', async ({ page }) => {
  const problems = await open(page);
  await expect(cell(page, '0', 'block')).toHaveAttribute('aria-rowspan', '10');
  await page.getByRole('button', { name: 'Scroll to row 60,005' }).click();
  await expect(cell(page, '60005', 'n2')).toBeVisible();
  // The span of block B6000 starts above the window (row 60,000) and is drawn from the first rendered row.
  const spans = grid(page).locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="block"]');
  await expect(spans.filter({ hasText: 'B6000' })).toHaveCount(1);
  await expect(spans.filter({ hasText: 'B6001' })).toHaveAttribute('aria-rowspan', '10');
  expect(problems).toEqual([]);
});

test('virtual-interactions: a cell range spans unrendered rows', async ({ page }) => {
  const problems = await open(page);
  await cell(page, '3', 'n2').click();
  await page.getByRole('button', { name: 'Scroll to row 60,005' }).click();
  await cell(page, '60005', 'n4').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Read the selection' }).click();
  await expect(log(page)).toContainText('"anchor":{"rowId":"3","columnId":"n2"}');
  await expect(log(page)).toContainText('"focus":{"rowId":"60005","columnId":"n4"}');
  await expect(cell(page, '60004', 'n2')).toHaveAttribute('aria-selected', 'true');
  await expect(cell(page, '60005', 's3')).toHaveAttribute('aria-selected', 'true');
  await expect(cell(page, '60006', 'n2')).not.toHaveAttribute('aria-selected', 'true');
  await expect(cell(page, '60005', 'n5')).not.toHaveAttribute('aria-selected', 'true');
  expect(problems).toEqual([]);
});

test('virtual-interactions: Ctrl+End and Ctrl+Home reach unrendered corners; pinned columns stay rendered', async ({ page }) => {
  const problems = await open(page);
  await cell(page, '1', 'n2').click();
  await page.keyboard.press('Control+End');
  // The last row and the last column (pinned at the end).
  await expect(cell(page, '99999', 's99')).toBeFocused();
  // Scrolled to the far end: the start-pinned row number and the end-pinned column are rendered, the first center columns are not.
  await page.keyboard.press('ArrowLeft');
  await expect(cell(page, '99999', 'n98')).toBeFocused();
  await expect(cell(page, '99999', 'row')).toBeVisible();
  await expect(cell(page, '99999', 's99')).toBeVisible();
  await expect(cell(page, '99999', 'n4')).toHaveCount(0);
  await page.keyboard.press('Control+Home');
  await expect(cell(page, '0', 'row')).toBeFocused();
  expect(problems).toEqual([]);
});
