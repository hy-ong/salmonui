import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// Name-table features added after the code rename: the row number column,
// `selection.cellRange: 'boxWithBorder'`, `onViewChange`,
// menu and toolbar event sources, and the header group toggle.

type Recorded = { type: string; [k: string]: unknown };
const queryEvents = (page: Page) => page.evaluate(() => (window as unknown as { __queryEvents: Recorded[] }).__queryEvents);
const chromeEvents = (page: Page) => page.evaluate(() => (window as unknown as { __chromeEvents: Recorded[] }).__chromeEvents);
const rowNumberAt = (page: Page, index: number) =>
  page.locator(`.salmon-data-grid-rows [role="row"][data-row-index="${index}"] .salmon-data-grid-cell[data-row-number]`).textContent();
const cell = (page: Page, rowIndex: number, columnId: string) => page.locator(`.salmon-data-grid-rows [role="row"][data-row-index="${rowIndex}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);

test.describe('rowNumber column', () => {
  test('numbers follow the visible position through sort, paging and virtual scrolling', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=5000&cols=8&rowNumber&sort&paging=50`);
    expect(await rowNumberAt(page, 0)).toBe('1');
    expect(await rowNumberAt(page, 9)).toBe('10');
    const firstId = await page.locator('.salmon-data-grid-rows [role="row"]').first().getAttribute('data-row-id');
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]').click();
    await expect.poll(() => page.locator('.salmon-data-grid-rows [role="row"]').first().getAttribute('data-row-id')).not.toBe(firstId);
    expect(await rowNumberAt(page, 0)).toBe('1');
    await page.evaluate(() => window.__gridApi.goToPage(3));
    await expect.poll(() => rowNumberAt(page, 0)).toBe('101');
    expect(problems).toEqual([]);
  });

  test('under row virtualization only rendered rows carry numbers, matching their index', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=20000&cols=6&rowNumber`);
    await scrollViewport(page, 36 * 5000, null);
    const rows = page.locator('.salmon-data-grid-rows [role="row"][data-row-index]');
    const count = await rows.count();
    expect(count).toBeLessThan(80);
    for (const i of [0, Math.floor(count / 2), count - 1]) {
      const row = rows.nth(i);
      const index = Number(await row.getAttribute('data-row-index'));
      await expect(row.locator('.salmon-data-grid-cell[data-row-number]')).toHaveText(String(index + 1));
    }
  });
});

test.describe("selection.cellRange: 'boxWithBorder'", () => {
  test('one outline around the range: edge attributes on the border cells only', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=8&sel=cell&cellMode=boxWithBorder`);
    await cell(page, 1, 's1').click();
    await cell(page, 3, 's3').click({ modifiers: ['Shift'] });
    await expect(cell(page, 1, 's1')).toHaveAttribute('data-range-edge', 'top start');
    await expect(cell(page, 1, 's2')).toHaveAttribute('data-range-edge', 'top');
    await expect(cell(page, 2, 's2')).toHaveAttribute('data-range-edge', '');
    await expect(cell(page, 3, 's3')).toHaveAttribute('data-range-edge', 'bottom end');
    await expect(cell(page, 0, 's1')).not.toHaveAttribute('data-range-edge');
    // Interior cells drop the per-cell outline; edge cells draw a 2px side.
    const interior = await cell(page, 2, 's2').evaluate((el) => getComputedStyle(el).boxShadow);
    expect(interior).not.toContain('2px');
    const corner = await cell(page, 1, 's1').evaluate((el) => getComputedStyle(el).boxShadow);
    expect(corner).toContain('2px');
    // Growing the range moves the edges.
    await cell(page, 4, 's3').click({ modifiers: ['Shift'] });
    await expect(cell(page, 3, 's3')).toHaveAttribute('data-range-edge', 'end');
    await expect(cell(page, 4, 's3')).toHaveAttribute('data-range-edge', 'bottom end');
    expect(problems).toEqual([]);
  });

  test("'box' keeps the per-cell outline (no edge attributes)", async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=8&sel=cell&cellMode=box`);
    await cell(page, 1, 's1').click();
    await cell(page, 2, 's2').click({ modifiers: ['Shift'] });
    await expect(cell(page, 2, 's2')).toHaveAttribute('data-selected', '');
    await expect(page.locator('.salmon-data-grid-cell[data-range-edge]')).toHaveCount(0);
  });
});

test.describe('onViewChange', () => {
  test('once per committed view change with its reason; never on scroll or selection', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=3000&cols=8&sort&paging=100&viewEvents`);
    await expect.poll(async () => (await queryEvents(page)).length).toBe(1);
    expect((await queryEvents(page))[0]).toEqual({ type: 'viewChange', reason: 'data', rowCount: 100, totalRowCount: 3000, source: 'api' });
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]').click();
    await expect.poll(async () => (await queryEvents(page)).length).toBe(2);
    expect((await queryEvents(page))[1]).toMatchObject({ reason: 'sort', source: 'pointer' });
    await scrollViewport(page, 1200, null);
    await cell(page, 40, 's2').click();
    await page.waitForTimeout(100);
    expect(await queryEvents(page)).toHaveLength(2);
    await page.evaluate(() => window.__gridApi.goToPage(4));
    await expect.poll(async () => (await queryEvents(page)).length).toBe(3);
    expect((await queryEvents(page))[2]).toMatchObject({ reason: 'page', source: 'api', rowCount: 100 });
    expect(problems).toEqual([]);
  });
});

test.describe('menu and toolbar event sources', () => {
  test("Enter / Space report 'keyboard', clicks report 'pointer'", async ({ page }) => {
    const problems = collectProblems(page);
    // The `chrome` harness toolbar carries every built-in item; with the 32px /
    // 12px chrome control metrics it no longer fits 1280px and the trailing
    // items (collapseAll, custom) move into the "More" overflow menu. A wider
    // viewport keeps the custom button inline so it can be focused and clicked.
    await page.setViewportSize({ width: 1600, height: 800 });
    await openGrid(page, `${DEV_URL}?rows=200&cols=8&chrome&sort`);
    const header = page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]');
    await header.focus();
    await page.keyboard.press('Shift+Alt+ArrowDown');
    const menu = page.locator('.salmon-data-grid-column-menu');
    await expect(menu).toBeVisible();
    // Pointer hover makes the item active; Enter activates it from the keyboard.
    await menu.locator('[data-item-id="sortAscending"]').hover();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await header.focus();
    await page.keyboard.press('Shift+Alt+ArrowDown');
    await expect(menu).toBeVisible();
    await menu.locator('[data-item-id="sortDescending"]').click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    const clicks = (await chromeEvents(page)).filter((e) => e.type === 'columnMenu');
    expect(clicks).toEqual([
      { type: 'columnMenu', id: 'sortAscending', field: 's1', source: 'keyboard' },
      { type: 'columnMenu', id: 'sortDescending', field: 's1', source: 'pointer' },
    ]);
    // Toolbar buttons: Enter on a focused button is a keyboard activation.
    const custom = page.locator('[data-toolbar-item="custom"]');
    await expect(custom).toBeVisible();
    await custom.focus();
    await page.keyboard.press('Enter');
    await custom.click();
    const toolbar = (await chromeEvents(page)).filter((e) => e.type === 'toolbar' && e.id === 'custom');
    expect(toolbar.map((e) => e.source)).toEqual(['keyboard', 'pointer']);
    expect(problems).toEqual([]);
  });
});

test.describe('header group toggle', () => {
  test('grouping.showHeaderToggle: the header button groups and ungroups; aria-pressed follows', async ({ page }) => {
    const problems = collectProblems(page);
    // The example turns on showHeaderToggle with grouping.
    await openGrid(page, `${DEV_URL}?sort&group=`);
    const toggle = page.locator('.salmon-data-grid-header-cell[data-column-id="s1"] .salmon-data-grid-group-toggle-button');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.locator('.salmon-data-grid-group-chip[data-column-id="s1"]')).toHaveCount(1);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // The header click did not sort the column.
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]')).toHaveAttribute('aria-sort', 'none');
    await toggle.click();
    await expect(page.locator('.salmon-data-grid-group-chip')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
