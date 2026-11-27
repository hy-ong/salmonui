import { expect, test, type Page } from '@playwright/test';

// Hierarchy print and export: `hierarchy: 'expanded' | 'all' | 'none'` for
// child grids and detail templates through the `detail` export
// hook. window.print is stubbed; the print container stays in the
// document until `afterprint`.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto('/demos/data-grid/hierarchy-output');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

/** Prints with one mode and returns the detail rows of the print table, then fires `afterprint`. */
async function printDetails(page: Page, button: string): Promise<{ details: number; nestedTables: number; text: string }> {
  await page.getByRole('button', { name: button, exact: true }).click();
  const container = page.locator('.salmon-data-grid-print').last();
  await expect(container).toBeAttached();
  const result = await container.evaluate((el) => ({
    details: el.querySelectorAll('tr.salmon-data-grid-print__detail').length,
    nestedTables: el.querySelectorAll('tr.salmon-data-grid-print__detail table').length,
    text: el.textContent ?? '',
  }));
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.salmon-data-grid-print')).toHaveCount(0);
  return result;
}

test('child grids print expanded, all or none', async ({ page }) => {
  const problems = await open(page);
  const expanded = await printDetails(page, 'Print customers (expanded)');
  expect(expanded.details).toBe(1);
  expect(expanded.nestedTables).toBe(1);
  const all = await printDetails(page, 'Print customers (all)');
  expect(all.details).toBeGreaterThan(1);
  expect(all.nestedTables).toBe(all.details);
  const none = await printDetails(page, 'Print customers (none)');
  expect(none.details).toBe(0);
  await expect(page.getByRole('log')).toContainText('printed customers (none)');
  expect(problems).toEqual([]);
});

test('detail templates print and export the expanded rows only in expanded mode', async ({ page }) => {
  const problems = await open(page);
  const expanded = await printDetails(page, 'Print orders (expanded)');
  expect(expanded.details).toBe(2);
  expect(expanded.nestedTables).toBe(0);
  const all = await printDetails(page, 'Print orders (all)');
  expect(all.details).toBe(8);
  const none = await printDetails(page, 'Print orders (none)');
  expect(none.details).toBe(0);
  await expect(page.getByRole('log')).toContainText('printed orders (none)');
  const size = async (mode: string): Promise<number> => {
    await page.getByRole('button', { name: `Excel orders (${mode})`, exact: true }).click();
    const entry = page.getByRole('log').locator('li').filter({ hasText: `orders Excel (${mode})` }).first();
    await expect(entry).toBeVisible({ timeout: 15_000 });
    return Number(/(\d+) bytes/.exec((await entry.textContent()) ?? '')?.[1]);
  };
  const dNone = await size('none');
  const dExpanded = await size('expanded');
  const dAll = await size('all');
  expect(dExpanded).toBeGreaterThan(dNone);
  expect(dAll).toBeGreaterThan(dExpanded);
  expect(problems).toEqual([]);
});

test('Excel export sizes follow the hierarchy mode for child grids and detail templates', async ({ page }) => {
  const problems = await open(page);
  const size = async (button: string, label: RegExp): Promise<number> => {
    await page.getByRole('button', { name: button, exact: true }).click();
    const entry = page.getByRole('log').locator('li').filter({ hasText: label }).first();
    await expect(entry).toBeVisible({ timeout: 15_000 });
    return Number(/(\d+) bytes/.exec((await entry.textContent()) ?? '')?.[1]);
  };
  const none = await size('Excel customers (none)', /customers Excel \(none\)/);
  const expanded = await size('Excel customers (expanded)', /customers Excel \(expanded\)/);
  const all = await size('Excel customers (all)', /customers Excel \(all\)/);
  expect(expanded).toBeGreaterThan(none);
  expect(all).toBeGreaterThan(expanded);
  const dNone = await size('Excel orders (none)', /orders Excel \(none\)/);
  const dAll = await size('Excel orders (all)', /orders Excel \(all\)/);
  expect(dAll).toBeGreaterThan(dNone);
  expect(problems).toEqual([]);
});
