import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Infinite scroll in tree mode on examples/vite-spa/tree-features.html?mode=infinite:
// a remote tree with `infiniteScroll` reads its root rows in
// blocks as the viewport nears the last tree row; detail rows, row editing and
// id-based selection work on loaded blocks.

async function open(page: Page): Promise<void> {
  await page.goto(`${DEV_URL}tree-features.html?mode=infinite`);
  await page.waitForFunction(() => document.querySelector('[data-salmon-pending]') === null && document.querySelector('#tasks [role="row"][data-row-id="r0"]') !== null && window.__gridApi);
}

const row = (page: Page, id: string) => page.locator(`#tasks [role="row"][data-row-id="${id}"]`);
const cell = (page: Page, id: string, field = 'name') => row(page, id).locator(`[data-column-id="${field}"]`);
/** Distinct root block reads (StrictMode in development may mount the grid twice). */
const rootReads = (page: Page) => page.evaluate(() => [...new Set((window.__treeReads ?? []).filter((r) => r.parentRowId === null).map((r) => `${r.start}-${r.end}`))].map((k) => k.split('-').map(Number)));
const rowCount = (page: Page) => page.evaluate(() => window.__gridApi!.getVisibleRows().length);

async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('#tasks .salmon-data-grid-viewport');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  });
}

test.describe('tree mode: infinite scroll', () => {
  test('scrolling to the end of the loaded tree rows reads the next block of root rows', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    expect(await rootReads(page)).toEqual([[0, 40]]);
    expect(await rowCount(page)).toBe(40);
    await expect(row(page, 'r0')).toHaveAttribute('aria-expanded', 'false');
    await scrollToEnd(page);
    await expect.poll(() => rowCount(page)).toBe(60);
    expect((await rootReads(page))[1]).toEqual([40, 60]);
    await scrollToEnd(page);
    await expect.poll(() => rowCount(page)).toBe(80);
    await expect(row(page, 'r59')).toBeVisible();
    // Reading stops at the viewport: no block is read ahead of the scroll.
    await page.waitForTimeout(200);
    expect((await rootReads(page)).length).toBe(3);
    expect(problems).toEqual([]);
  });

  test('expansion, detail rows, row editing and selectRows by id work across root blocks', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    // Expand a root of the first block: its children load on demand.
    await row(page, 'r1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'r1-0')).toHaveAttribute('aria-level', '2');
    expect(await page.evaluate(() => window.__gridApi!.selectRows(['r1-0', 'r3']).status)).toBe('applied');
    await scrollToEnd(page);
    await expect.poll(() => rowCount(page)).toBe(62);
    // The expanded parent and the selection survive the block load.
    expect(await page.evaluate(() => window.__gridApi!.getTreeRow('r1')?.expanded)).toBe(true);
    expect(await page.evaluate(() => [...window.__gridApi!.getSelectedRowIds()].sort())).toEqual(['r1-0', 'r3']);
    // Select a row of the new block by id.
    expect(await page.evaluate(() => window.__gridApi!.selectRows(['r50'], { mode: 'add' }).status)).toBe('applied');
    await page.evaluate(() => window.__gridApi!.scrollToRow('r50'));
    await expect(row(page, 'r50')).toHaveAttribute('aria-selected', 'true');
    // Detail row of a root in the second block.
    await row(page, 'r50').locator('.salmon-data-grid-detail-toggle:not(.salmon-data-grid-tree-toggle)').click();
    await expect(page.locator('#tasks [data-row-id="__detail:r50"]')).toContainText('Detail of Root 50');
    expect(await page.evaluate(() => [...window.__gridApi!.getSelectedRowIds()].sort())).toEqual(['r1-0', 'r3', 'r50']);
    // Row editing in the second block: the write lands and the cell shows the echo.
    await cell(page, 'r51').dblclick();
    const editor = cell(page, 'r51').locator('input');
    await expect(editor).toBeVisible();
    await editor.fill('Renamed root');
    await page.keyboard.press('Enter');
    await expect(cell(page, 'r51')).toContainText('Renamed root');
    await expect(editor).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi!.getTreeRow('r1')?.expanded)).toBe(true);
    await expect(page.locator('#tasks [data-row-id="__detail:r50"]')).toHaveCount(1);
    expect(await page.evaluate(() => window.__events.filter((e) => e.type === 'save').length)).toBe(1);
    expect(problems).toEqual([]);
  });
});
