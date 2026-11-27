import { expect, test, type Page } from '@playwright/test';
import { loadDemos, loadDocs, sitePaths } from '../lib/catalog.mjs';

// Pivot Table section: /docs/pivot-table,
// /docs/pivot-table/<slug>, /demos/pivot-table and /demos/pivot-table/<id>
// server-render and hydrate with zero console errors; the sidebar shows the
// current section's pages.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const docs = loadDocs(`${paths.content}/pivot-table`, 'pivot-table');
const demos = loadDemos(paths.demos).filter((d) => d.category === 'pivot-table');

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === 'localhost' && response.status() >= 400) problems.push(`HTTP ${response.status()}: ${url.pathname}`);
  });
  return problems;
}

async function openHydrated(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBe(200);
  await page.waitForFunction(() => window.__hydrated === true);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Documentation' });

test('the pivot table section has docs pages and demos', () => {
  expect(docs.length).toBeGreaterThan(0);
  expect(demos.length).toBe(17);
});

for (const demo of demos) {
  test(`pivot table demo ${demo.id} server-renders and hydrates cleanly`, async ({ page, request }) => {
    // The server renders the first report (local data computes synchronously).
    const html = await (await request.get(`/demos/pivot-table/${demo.id}`)).text();
    expect(html).toMatch(/role="(treegrid|grid)"/);
    expect(html).toContain('salmon-pivot-table');
    const problems = collectProblems(page);
    await openHydrated(page, `/demos/pivot-table/${demo.id}`);
    await expect(page.locator('h1')).toHaveText(demo.title);
    expect(problems).toEqual([]);
  });
}

for (const doc of docs) {
  test(`pivot table docs page ${doc.slug} hydrates cleanly with its demos`, async ({ page }) => {
    const problems = collectProblems(page);
    await openHydrated(page, `/docs/pivot-table/${doc.slug}`);
    await expect(page.locator('h1')).toHaveText(doc.title);
    for (const id of doc.demos) await expect(page.locator(`[data-demo-id="${id}"]`)).toBeVisible();
    await expect(sidebar(page).locator('[aria-current="page"]')).toHaveAttribute('href', `/docs/pivot-table/${doc.slug}`);
    expect(problems).toEqual([]);
  });
}

test('the overview demo keeps the shared store in sync', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-overview');
  const stage = page.locator('[data-demo-id="pivot-table-overview"]');
  // The table, the axis bar and the field list show the same report.
  await expect(stage.locator('.salmon-pivot-table-axis-bar .salmon-pivot-table-axis[data-axis="rows"] [data-pivot-field="region"]')).toBeVisible();
  await expect(stage.locator('.salmon-pivot-table-field-list .salmon-pivot-table-field[data-pivot-field="region"]')).toHaveAttribute('aria-selected', 'true');
  // Unchecking a field in the standalone field list removes it from the axis bar.
  await stage.locator('.salmon-pivot-table-field-list .salmon-pivot-table-field[data-pivot-field="country"]').click();
  await expect(stage.locator('.salmon-pivot-table-axis-bar .salmon-pivot-table-axis[data-axis="rows"] [data-pivot-field="country"]')).toHaveCount(0);
  await expect(stage.locator('.demo-log')).toContainText('country');
  expect(problems).toEqual([]);
});

test('the layouts demo switches between treegrid and grid', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-layouts');
  const stage = page.locator('[data-demo-id="pivot-table-layouts"]');
  await expect(stage.locator('[role="treegrid"]')).toHaveCount(1);
  await stage.getByLabel('Tabular').check();
  await expect(stage.locator('[role="grid"]')).toHaveCount(1);
  await expect(stage.locator('[role="treegrid"]')).toHaveCount(0);
  await stage.getByRole('button', { name: 'Expand all' }).click();
  await expect(stage.locator('.demo-status')).toContainText('expandAll');
  expect(problems).toEqual([]);
});

test('the drill-through demo opens the raw rows of a value cell', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-drill-through');
  const stage = page.locator('[data-demo-id="pivot-table-drill-through"]');
  await stage.locator('[role="gridcell"]').filter({ hasText: /\d/ }).first().dblclick();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[role="grid"]')).toBeVisible();
  await expect(stage.locator('.demo-status')).toContainText('Drill through');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('docs home, demos home and the pivot table indexes list the section', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs');
  await expect(page.locator('main .home-cards a', { hasText: /^Pivot Table$/ })).toHaveAttribute('href', '/docs/pivot-table');
  await openHydrated(page, '/docs/pivot-table');
  await expect(page.locator('h1')).toHaveText('Salmon UI Pivot Table documentation');
  for (const doc of docs) await expect(page.locator(`main a[href="/docs/pivot-table/${doc.slug}"]`)).toBeVisible();
  await openHydrated(page, '/demos');
  await expect(page.locator('main .home-cards a', { hasText: /^All Pivot Table demos$/ })).toHaveAttribute('href', '/demos/pivot-table');
  await openHydrated(page, '/demos/pivot-table');
  for (const demo of demos) await expect(page.locator(`a[href="/demos/pivot-table/${demo.id}"]`).first()).toBeVisible();
  expect(problems).toEqual([]);
});

// One interaction test per demo of the Pass rows it lists (docs coverage).
const stageOf = (page: Page, id: string) => page.locator(`[data-demo-id="${id}"]`);
const valueCells = (stage: ReturnType<typeof stageOf>) => stage.locator('[role="gridcell"]').filter({ hasText: /\d/ });
// Demo toolbars use the Salmon Select (a combobox with a popup listbox): open it, then pick the option.
const choose = async (page: Page, stage: ReturnType<typeof stageOf>, name: string, option: string) => {
  await stage.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

test('the data binding demo parses CSV, replaces data, reads the result and keeps a controlled model', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-data-binding');
  const stage = stageOf(page, 'pivot-table-data-binding');
  const status = stage.locator('.demo-status').first();
  await expect(status).toContainText('12 raw rows');
  await stage.getByRole('button', { name: 'Add a 2026 Japan bike sale' }).click();
  await expect(status).toContainText('13 raw rows');
  await stage.getByLabel('CSV source').fill('id,region,country,product,year,amount,units\n1,Asia,Japan,Bikes,2025,100,1\n2,Europe,France,Bikes,2026,200,2');
  await stage.getByRole('button', { name: 'Parse CSV' }).click();
  await expect(status).toContainText('2 raw rows');
  await stage.getByRole('button', { name: 'Read result' }).click();
  await expect(stage.locator('.demo-status').nth(1)).toContainText('grand total $300 from 2 raw rows');
  await stage.getByRole('button', { name: 'Products by region' }).click();
  await expect(status).toContainText('rows product');
  // The hidden id field is in neither the fields panel nor the axes.
  await expect(stage.locator('.salmon-pivot-table-axis-bar [data-pivot-field="id"]')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('the totals demo changes grand totals, values placement and empty members', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-totals');
  const stage = stageOf(page, 'pivot-table-totals');
  const grid = stage.locator('[role="treegrid"]');
  await expect(grid).toContainText('Grand total');
  await choose(page, stage, 'Grand totals', 'None');
  await expect(grid).not.toContainText('Grand total');
  await expect(stage.locator('[role="gridcell"]').filter({ hasText: /^-$/ }).first()).toBeVisible();
  const before = await grid.getAttribute('aria-rowcount');
  await stage.getByLabel('Show empty members').check();
  await expect(grid).not.toHaveAttribute('aria-rowcount', before ?? '');
  await choose(page, stage, 'Values on', 'Rows');
  await expect(stage.locator('[role="rowheader"]').filter({ hasText: /^units$/i }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('the aggregation demo switches aggregates and show-values-as and edits the aggregate menu', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-aggregation');
  const stage = stageOf(page, 'pivot-table-aggregation');
  await choose(page, stage, 'Aggregate', 'average');
  await expect(stage.locator('.demo-status').first()).toContainText('"aggregate":"average"');
  await choose(page, stage, 'Show values as', 'percentOfGrandTotal');
  await expect(valueCells(stage).filter({ hasText: '%' }).first()).toBeVisible();
  // The value field menu offers aggregateOptions only.
  await stage.locator('.salmon-pivot-table-axis[data-axis="values"] [data-pivot-field="amount"]').click();
  await expect(stage.locator('.demo-status').nth(1)).toContainText('offers sum, count, average, min, max, median');
  await page.keyboard.press('Escape');
  const shown = await valueCells(stage).count();
  await stage.getByLabel(/getCellValue/).check();
  await choose(page, stage, 'Show values as', 'none');
  await choose(page, stage, 'Aggregate', 'sum');
  await expect.poll(async () => valueCells(stage).count()).toBeLessThan(shown);
  expect(problems).toEqual([]);
});

test('the axis bar demo hides menu commands and refuses moves to filters', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-axis-bar');
  const stage = stageOf(page, 'pivot-table-axis-bar');
  const country = stage.locator('.salmon-pivot-table-axis[data-axis="rows"] [data-pivot-field="country"]');
  await country.click();
  await expect(page.getByRole('menuitem', { name: 'Sort ascending' })).toBeVisible();
  await page.keyboard.press('Escape');
  await stage.getByLabel('showSort').uncheck();
  await country.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sort ascending' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Move to Columns' }).click();
  await expect(stage.locator('.salmon-pivot-table-axis[data-axis="columns"] [data-pivot-field="country"]')).toBeVisible();
  await expect(stage.locator('.demo-log')).toContainText('country: rows → columns');
  await stage.getByLabel('Refuse moves to Filters').check();
  await stage.locator('.salmon-pivot-table-axis[data-axis="columns"] [data-pivot-field="country"]').click();
  await page.getByRole('menuitem', { name: 'Move to Filters' }).click();
  await expect(stage.locator('.demo-log')).toContainText('refused country → filters');
  // Keyboard reorder on the bar.
  await stage.locator('.salmon-pivot-table-axis[data-axis="rows"] [data-pivot-field="region"]').focus();
  await page.keyboard.press('Delete');
  await expect(stage.locator('.salmon-pivot-table-axis[data-axis="rows"] [data-pivot-field="region"]')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('the filtering demo applies member, label and value filters and opens the member editor', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-filtering');
  const stage = stageOf(page, 'pivot-table-filtering');
  const grid = stage.locator('[role="treegrid"]');
  await stage.getByRole('button', { name: 'Include Europe' }).click();
  await expect(grid).toContainText('France');
  await expect(grid).not.toContainText('Japan');
  await stage.getByRole('button', { name: 'Label filter' }).click();
  await expect(grid).toContainText('France');
  await expect(grid).not.toContainText('Brazil');
  await stage.getByRole('button', { name: 'Top countries by amount' }).click();
  await expect(stage.locator('.demo-log')).toContainText('"operator":"top"');
  await stage.getByRole('button', { name: 'Clear' }).click();
  await expect(grid).toContainText('Japan');
  // The member editor of a 2,500-member field renders a window of its list.
  await stage.locator('.salmon-pivot-table-axis[data-axis="filters"] [data-pivot-field="customer"]').click();
  await page.getByRole('menuitem', { name: 'Filter…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const options = dialog.getByRole('option');
  await expect(options.first()).toBeVisible();
  expect(await options.count()).toBeLessThan(200);
  await page.keyboard.press('Escape');
  await stage.getByLabel('Refuse the Product member editor').check();
  await stage.locator('.salmon-pivot-table-axis[data-axis="filters"] [data-pivot-field="product"]').click();
  await page.getByRole('menuitem', { name: 'Filter…' }).click();
  await expect(stage.locator('.demo-log')).toContainText('member editor of product refused');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('the sorting and grouping demo sorts members and values and groups dates, numbers and members', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-sorting-grouping');
  const stage = stageOf(page, 'pivot-table-sorting-grouping');
  const firstRow = stage.locator('[role="rowheader"]').first();
  await stage.getByRole('button', { name: 'Descending' }).click();
  await expect(firstRow).toContainText('Japan');
  await stage.getByRole('button', { name: 'Japan, India, Germany first' }).click();
  await expect(stage.locator('.demo-status')).toContainText('{"order":["Japan","India","Germany"]}');
  await stage.getByRole('button', { name: 'Rows by grand total', exact: true }).click();
  await expect(stage.locator('.demo-status')).toContainText('rows by grand total desc');
  await stage.getByRole('button', { name: 'Placed: months' }).click();
  await expect(stage.locator('[role="columnheader"]').filter({ hasText: /^Jan/ }).first()).toBeVisible();
  await stage.getByRole('button', { name: 'Countries into regions' }).click();
  await expect(stage.locator('[role="rowheader"]').filter({ hasText: 'Europe' })).toHaveCount(1);
  await stage.getByRole('button', { name: 'Rows: unit price bands of 100' }).click();
  await expect(stage.locator('[role="rowheader"]').filter({ hasText: '100-199' })).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('the editors demo opens the popup field list and the three editors', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-editors');
  const stage = stageOf(page, 'pivot-table-editors');
  await expect(stage.locator('[role="columnheader"]').filter({ hasText: 'Average price' }).first()).toBeVisible();
  await stage.getByRole('button', { name: 'openFieldList()' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.salmon-pivot-table-field-list')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await stage.getByRole('button', { name: 'Edit "Average price"' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Formula' })).toHaveValue('"Sum(amount)" / "Sum(units)"');
  await dialog.getByRole('textbox', { name: 'Formula' }).fill('"Sum(amount)" / "Sum(units)" * 2');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(stage.locator('.demo-log')).toContainText('calculated field avgPrice: "Sum(amount)" / "Sum(units)" * 2');
  await stage.getByRole('button', { name: 'Format Amount' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await stage.getByRole('button', { name: 'openConditionalFormatEditor()' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
});

test('the toolbar and export demo exports, cancels exports and saves and loads reports', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-toolbar-export');
  const stage = stageOf(page, 'pivot-table-toolbar-export');
  const log = stage.locator('.demo-log');
  const csv = page.waitForEvent('download');
  await stage.getByRole('button', { name: 'exportToCsv()' }).click();
  expect((await csv).suggestedFilename()).toBe('sales.csv');
  await expect(log).toContainText('exported csv: sales');
  const xlsx = page.waitForEvent('download');
  await stage.getByRole('button', { name: 'exportToExcel()' }).click();
  expect((await xlsx).suggestedFilename()).toBe('sales.xlsx');
  await stage.getByLabel('Cancel exports in onBeforeExport').check();
  await stage.getByRole('button', { name: 'exportToPdf()' }).click();
  await expect(log).toContainText('pdf export cancelled');
  await stage.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(log).toContainText('saved "My report"');
  await stage.getByRole('button', { name: 'New report' }).click();
  await expect(stage.locator('[role="treegrid"]')).not.toContainText('Asia');
  await stage.getByRole('button', { name: 'Load' }).click();
  await expect(log).toContainText('loaded "My report"');
  await expect(stage.locator('[role="treegrid"]')).toContainText('Asia');
  expect(problems).toEqual([]);
});

test('the performance demo times the aggregation, a sort, an exact average and pages', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-performance');
  const stage = stageOf(page, 'pivot-table-performance');
  const timings = stage.getByRole('table', { name: 'Measured engine times' });
  await choose(page, stage, 'Rows', '200,000');
  await stage.getByRole('button', { name: 'Generate and aggregate' }).click();
  await expect(timings.locator('tbody tr').first()).toContainText('200,000');
  await stage.getByRole('button', { name: 'Sort countries descending' }).click();
  await expect(timings.locator('tbody tr').first()).toContainText('sort');
  await stage.getByRole('button', { name: 'Average instead of sum' }).click();
  const status = stage.locator('.demo-status');
  await expect(status).toContainText('Grand total average');
  const text = (await status.textContent()) ?? '';
  const [engine, direct] = [...text.matchAll(/(\d+\.\d{4})/g)].map((m) => m[1]);
  expect(engine).toBe(direct);
  await stage.getByLabel(/Paging/).check();
  await expect(stage.locator('.salmon-pager, [aria-label*="Pag" i]').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('the accessibility demo localizes, flips to right to left and drills by keyboard', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-accessibility');
  const stage = stageOf(page, 'pivot-table-accessibility');
  await stage.getByLabel(/French/).check();
  await expect(stage.locator('[role="treegrid"]')).toContainText('Total général');
  await expect(stage.getByRole('button', { name: 'Tout développer' })).toBeVisible();
  await expect(valueCells(stage).filter({ hasText: '€' }).first()).toBeVisible();
  await stage.getByLabel('Right to left').check();
  await expect(stage.locator('[dir="rtl"] .salmon-pivot-table')).toBeVisible();
  const header = stage.locator('[role="rowheader"]').filter({ hasText: 'Asia' }).first();
  await header.click();
  await page.keyboard.press('Enter');
  await expect(stage.locator('[role="rowheader"]').filter({ hasText: 'Japan' })).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('the remote demo aggregates on the server, sends the token and exports the server result', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/pivot-table/pivot-table-remote');
  const stage = stageOf(page, 'pivot-table-remote');
  await expect(stage.locator('[role="treegrid"]')).toContainText('Asia');
  await expect(stage.locator('.demo-log')).toContainText('← pivot');
  // The loading template shows while a request is pending.
  await stage.locator('[role="rowheader"]').filter({ hasText: 'Asia' }).first().click();
  await page.keyboard.press('Enter');
  await expect(stage.locator('.salmon-pivot-table-loading')).toContainText('Aggregating on the server');
  await expect(stage.locator('[role="rowheader"]').filter({ hasText: 'Japan' })).toHaveCount(1);
  const xlsx = page.waitForEvent('download');
  await stage.getByRole('button', { name: 'Export Excel from the server result' }).click();
  expect((await xlsx).suggestedFilename()).toBe('remote-sales.xlsx');
  await stage.getByLabel('Bearer token').fill('wrong');
  await stage.getByRole('button', { name: 'Refresh' }).click();
  await expect(stage.locator('.demo-log')).toContainText('✕');
  expect(problems.filter((p) => !p.includes('401'))).toEqual([]);
});

test('a pivot table docs page has a Markdown version', async ({ request }) => {
  const doc = docs[0]!;
  const response = await request.get(`/docs/pivot-table/${doc.slug}.md`);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(doc.title);
});
