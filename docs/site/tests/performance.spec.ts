import { expect, test, type Page } from '@playwright/test';

// Performance demos, read through the
// dev-only __SALMON_UI_DEVTOOLS__ hook: a parent re-render with a stable
// `columns` identity re-renders no header or cell; focus moves and
// single-row selection re-render only the affected cells.

// The hook exists only in development builds (SITE_MODE=dev, the default).
test.skip(process.env.SITE_MODE === 'production' || process.env.SITE_MODE === 'export', 'the devtools hook is compiled out of production builds');

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/render-counts');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('[role="grid"]').first();
const cell = (page: Page, rowId: string, columnId: string) => grid(page).locator(`[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const COLUMNS = 5;

async function counts(page: Page): Promise<{ commits: number; cells: number; rows: number; headers: number }> {
  await page.waitForTimeout(150);
  const text = (await page.getByRole('status', { name: 'Render counts' }).textContent()) ?? '';
  const [commits, cells, rows, headers] = [...text.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  return { commits: commits!, cells: cells!, rows: rows!, headers: headers! };
}

async function reset(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Reset counters' }).click();
  await expect(page.getByRole('status', { name: 'Render counts' })).toContainText('0 grid commits, 0 cells');
}

test('render-counts: stable columns and a parent re-render re-render no cell or header', async ({ page }) => {
  const problems = await open(page);
  await expect(cell(page, 'ORD-10001', 'customer')).toBeVisible();
  await reset(page);
  await page.getByRole('button', { name: /Re-render the parent/ }).click();
  const after = await counts(page);
  expect(after.cells).toBe(0);
  expect(after.headers).toBe(0);
  expect(problems).toEqual([]);
});

test('render-counts: selection and focus re-render only the affected cells', async ({ page }) => {
  const problems = await open(page);
  await expect(cell(page, 'ORD-10003', 'customer')).toBeVisible();
  await reset(page);
  // Click: the focus moves to the cell and the row becomes selected.
  await cell(page, 'ORD-10003', 'customer').click();
  const click = await counts(page);
  // The hook is live: the click committed and re-rendered the touched cells.
  expect(click.commits).toBeGreaterThan(0);
  expect(click.cells).toBeGreaterThan(0);
  expect(click.cells).toBeLessThanOrEqual(COLUMNS + 2);

  await reset(page);
  await page.keyboard.press('ArrowRight');
  const move = await counts(page);
  expect(move.cells).toBeLessThanOrEqual(2);
  expect(move.headers).toBe(0);

  await reset(page);
  await cell(page, 'ORD-10005', 'country').click();
  const reselect = await counts(page);
  // Old row and new row (selection), old and new focused cell.
  expect(reselect.cells).toBeLessThanOrEqual(2 * COLUMNS + 2);
  expect(problems).toEqual([]);
});
