import { expect, test, type Locator } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// in the browser: `classNames` / `styles` reach the parts that only
// render on the client (editors, menus) and the server-rendered parts after
// hydration. Fixture flag `?parts` (examples/vite-spa/src/main.tsx) sets
// class `part-<name>` and style `--part: <name>` on every `DataGridPart`.

const PARTS = `${DEV_URL}?rows=2000&cols=10&parts`;

async function expectPart(locator: Locator, part: string): Promise<void> {
  await expect(locator.first()).toHaveClass(new RegExp(`\\bpart-${part}\\b`));
  expect(await locator.first().evaluate((el) => (el as HTMLElement).style.getPropertyValue('--part').trim())).toBe(part);
}

test.describe('part classNames and styles', () => {
  test('classNames.editor and styles.editor apply to inline and dialog editors', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${PARTS}&edit=row`);
    await page.evaluate(() => window.__gridApi.startEdit('r1'));
    const inline = page.locator('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-editor');
    await expect(inline.first()).toBeVisible();
    expect(await inline.count()).toBeGreaterThan(1);
    for (const editor of await inline.all()) await expectPart(editor, 'editor');
    await openGrid(page, `${PARTS}&edit=dialog`);
    await page.evaluate(() => window.__gridApi.startEdit('r2'));
    const dialog = page.locator('dialog.salmon-data-grid-edit-dialog');
    await expect(dialog).toBeVisible();
    await expectPart(dialog.locator('.salmon-data-grid-editor'), 'editor');
    expect(problems).toEqual([]);
  });

  test('menus, toolbar, header, rows, cells and the pager carry their part class and style', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${PARTS}&chrome&filterUi=menu&paging=50`);
    await expectPart(page.locator('.salmon-data-grid'), 'root');
    await expectPart(page.locator('.salmon-data-grid-toolbar'), 'toolbar');
    await expectPart(page.locator('.salmon-data-grid-header'), 'header');
    await expectPart(page.locator('.salmon-data-grid-header-cell'), 'headerCell');
    await expectPart(page.locator('.salmon-data-grid-rows'), 'body');
    await expectPart(page.locator('.salmon-data-grid-rows .salmon-data-grid-row'), 'row');
    await expectPart(page.locator('.salmon-data-grid-rows .salmon-data-grid-cell'), 'cell');
    await expectPart(page.locator('.salmon-data-grid-pager'), 'pager');
    const popover = page.locator('[data-salmon-popover]');
    await page.evaluate(() => window.__gridApi.openColumnMenu('s1'));
    await expectPart(page.locator('.salmon-data-grid-column-menu'), 'columnMenu');
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await page.locator('.salmon-data-grid-row[data-row-id="r2"] .salmon-data-grid-cell[data-column-id="s1"]').click({ button: 'right' });
    await expectPart(page.locator('.salmon-data-grid-context-menu'), 'contextMenu');
    await page.evaluate(() => window.__gridApi.closeOverlays());
    await expect(popover).toHaveCount(0);
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"] .salmon-data-grid-filter-button').click();
    await expectPart(page.locator('.salmon-data-grid-filter-menu'), 'filterMenu');
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
