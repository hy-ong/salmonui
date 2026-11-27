import { expect, test, type Page } from '@playwright/test';

// Tree Grid demos (docs/site/content/tree.md): the controls of each tree-*
// demo drive DataGrid tree mode without console problems.

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

const row = (page: Page, id: string) => page.locator(`[role="treegrid"] [role="row"][data-row-id="${id}"]`);
const toggle = (page: Page, id: string) => row(page, id).locator('button.salmon-data-grid-tree-toggle');

test('tree-basic: toggle, methods, cancelable toggle and child summaries', async ({ page }) => {
  const problems = await open(page, 'tree-basic');
  await expect(row(page, 'plan')).toHaveAttribute('aria-expanded', 'true');
  await expect(row(page, 'interviews')).toHaveAttribute('aria-level', '3');
  await expect(page.locator('[role="treegrid"] [data-row-id="__tf:plan"]')).toContainText('Subtotal');
  await toggle(page, 'plan').click();
  await expect(row(page, 'scope')).toHaveCount(0);
  await expect(page.getByRole('log')).toContainText('Planning collapsed (depth 0, pointer)');
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(row(page, 'interviews')).toHaveCount(1);
  await page.getByLabel('Cancel collapsing Build').check();
  await toggle(page, 'build').click();
  await expect(page.getByRole('log')).toContainText('collapse of Build cancelled');
  await expect(row(page, 'build')).toHaveAttribute('aria-expanded', 'true');
  // A bulk toggle fires one cancelable event per changing parent; cancelling one (Build) cancels the command.
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(row(page, 'build')).toHaveAttribute('aria-expanded', 'true');
  await expect(row(page, 'scope')).toHaveCount(1);
  await page.getByLabel('Cancel collapsing Build').uncheck();
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(row(page, 'scope')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('tree-flat-filter: filter modes keep ancestors, descendants or matches only', async ({ page }) => {
  const problems = await open(page, 'tree-flat-filter');
  const grid = page.locator('[role="treegrid"]');
  await expect(row(page, 'e0')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('combobox', { name: 'Page by' }).click();
  await page.getByRole('option', { name: 'root (root rows with their subtrees)' }).click();
  await expect(row(page, 'e0')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Filter mode' }).click();
  await page.getByRole('option', { name: 'none', exact: true }).click();
  await expect(grid).toBeVisible();
  expect(problems).toEqual([]);
});

test('tree-checkbox: a folder checks its subtree; a partial folder is mixed', async ({ page }) => {
  const problems = await open(page, 'tree-checkbox');
  await row(page, 'docs').locator('.salmon-data-grid-tree-checkbox').click();
  await expect(row(page, 'docs/api.md').locator('.salmon-data-grid-tree-checkbox')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.demo-status')).toContainText('docs/guide.md');
  await row(page, 'docs/api.md').locator('.salmon-data-grid-tree-checkbox').click();
  await expect(row(page, 'docs').locator('.salmon-data-grid-tree-checkbox')).toHaveAttribute('aria-checked', 'mixed');
  await page.getByRole('combobox', { name: 'Checkbox mode' }).click();
  await page.getByRole('option', { name: 'self (cascade: false)' }).click();
  await row(page, 'src').locator('.salmon-data-grid-tree-checkbox').click();
  await expect(row(page, 'src/index.ts').locator('.salmon-data-grid-tree-checkbox')).toHaveAttribute('aria-checked', 'false');
  expect(problems).toEqual([]);
});

test('tree-indent: indent and outdent buttons move rows; a child row is added under the focused row', async ({ page }) => {
  const problems = await open(page, 'tree-indent');
  await expect(row(page, 's7')).toHaveAttribute('aria-level', '1');
  await page.getByRole('button', { name: 'Indent Accessibility pass' }).click();
  await expect(row(page, 's7')).toHaveAttribute('aria-level', '2');
  await page.getByRole('button', { name: 'Outdent Screens' }).click();
  await expect(row(page, 's6')).toHaveAttribute('aria-level', '1');
  // newRowPosition 'child' (the default selection): the added row joins the focused row.
  await row(page, 's5').locator('[data-column-id="name"]').click();
  await page.locator('.salmon-data-grid-toolbar').getByRole('button', { name: 'Add' }).click();
  await page.keyboard.press('Enter');
  await expect(row(page, 's10')).toHaveAttribute('aria-level', '3');
  expect(problems).toEqual([]);
});

test('tree-remote: children load on expand; a failed read reports onError and retries', async ({ page }) => {
  const problems = await open(page, 'tree-remote');
  await expect(row(page, 'r1')).toHaveAttribute('aria-expanded', 'false');
  await toggle(page, 'r1').click();
  await expect(row(page, 'r1/1')).toHaveCount(1);
  await expect(page.getByRole('log')).toContainText('read parentRowId=r1');
  await page.getByLabel('Fail the next child read').check();
  await toggle(page, 'r2').click();
  await expect(page.getByRole('log')).toContainText('onError treeChildren r2');
  await page.getByRole('button', { name: 'Retry r2' }).click();
  await expect(row(page, 'r2/1')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('tree-performance: a preview on load, nothing timed; the hierarchy fixture times every step next to its budget', async ({ page }) => {
  const problems = await open(page, 'tree-performance');
  const timings = page.getByRole('table', { name: 'Measured tree times' });
  // SSR-safe: a small preview tree and no timing before the click.
  await expect(page.locator('[role="treegrid"]')).toHaveCount(1);
  await expect(page.getByRole('treegrid', { name: 'Preview tree, 36 rows' })).toBeVisible();
  await expect(timings).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Fixture', exact: true })).toContainText('hierarchy: 50,000 rows');
  await page.getByRole('button', { name: 'Generate and measure' }).click();
  await expect(page.locator('.demo-status')).toContainText('Done: 50,000 rows', { timeout: 60_000 });
  await expect(page.locator('[role="treegrid"]')).toHaveCount(1);
  await expect(page.getByRole('treegrid', { name: 'Generated tree, 50,000 rows' })).toBeVisible();
  for (const action of ['Create the grid', 'Collapse all', 'Expand all', 'Expand one branch', 'Cascade-check root t0', 'Sort siblings by Number 4, cold', 'ascending, warm', '(warm)', 'Indent row', 'Outdent row']) {
    await expect(timings.getByRole('row').filter({ hasText: action }).first()).toContainText(/\d+\.\d ms/);
  }
  await expect(timings).toContainText('≤ 60 ms (hierarchy)');
  await expect(timings).toContainText('≤ 16 ms to painted');
  // Header plus 14 timed steps.
  await expect(timings.getByRole('row')).toHaveCount(15);
  expect(problems).toEqual([]);
});
