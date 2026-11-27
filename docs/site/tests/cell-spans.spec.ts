import { expect, test, type Page } from '@playwright/test';

// The cell-spans demo: with mergeCells "Both", spans are one focus
// stop at their anchor, and cell editing edits the anchor and re-merges.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/cell-spans');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('[role="grid"]').first();
const cell = (page: Page, rowId: string, columnId: string) => grid(page).locator(`[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.classList.contains('salmon-data-grid-cell') ? `${(el.closest('[data-row-id]') as HTMLElement).dataset['rowId']}:${el.dataset['columnId']}` : null;
  });

test('cell-spans: arrow keys treat a span as one cell and return to the aimed-at column', async ({ page }) => {
  const problems = await open(page);
  await cell(page, '09:00', 'thu').click();
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('10:00:tue'); // the Tuesday-to-Thursday offsite
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('11:00:thu');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  // Leaves the span from its right edge into Friday's Retro, merged from 09:00.
  expect(await focused(page)).toBe('09:00:fri');
  expect(problems).toEqual([]);
});

test('cell-spans: editing a span edits its anchor cell and re-merges equal values', async ({ page }) => {
  const problems = await open(page);
  await cell(page, '10:00', 'tue').dblclick();
  const input = cell(page, '10:00', 'tue').locator('input');
  await expect(input).toBeFocused();
  await input.fill('Hackathon');
  await page.keyboard.press('Enter');
  await expect(cell(page, '10:00', 'tue')).toContainText('Hackathon');
  await expect(cell(page, '10:00', 'tue')).toHaveAttribute('aria-colspan', '3');
  // Pairing merges Monday 13:00 and 14:00; a changed value ends the merge.
  await expect(cell(page, '13:00', 'mon')).toHaveAttribute('aria-rowspan', '2');
  await cell(page, '13:00', 'mon').dblclick({ position: { x: 20, y: 10 } });
  await cell(page, '13:00', 'mon').locator('input').fill('Solo');
  await page.keyboard.press('Enter');
  await expect(cell(page, '13:00', 'mon')).toContainText('Solo');
  await expect(cell(page, '13:00', 'mon')).not.toHaveAttribute('aria-rowspan', /.*/);
  expect(problems).toEqual([]);
});
