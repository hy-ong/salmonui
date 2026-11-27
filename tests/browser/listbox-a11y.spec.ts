import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Listbox accessibility: the `layout="grid"` APG Grid pattern (rows with in-row
// controls and a tile gallery), axe over the list and grid layouts, and ARIA
// snapshots. The file name matches the `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

const url = (query: string) => `${DEV_URL}listbox.html?${query}`;

async function axe(page: Page): Promise<{ id: string; nodes: string[] }[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    const include = [...document.querySelectorAll('.salmon-listbox')].map((el) => [el]);
    const result = await axeApi.run({ include }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v: any) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) }));
  });
}

async function activeText(page: Page, grid: Locator): Promise<string | null> {
  const id = await grid.getAttribute('aria-activedescendant');
  return id ? page.locator(`[id="${id}"]`).innerText() : null;
}

const focusedLabel = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.getAttribute('role') ?? document.activeElement?.id ?? null);
const changes = (page: Page) => page.evaluate(() => window.__changes);
const events = (page: Page) => page.evaluate(() => (window as unknown as { __lbEvents: { type: string; detail: unknown }[] }).__lbEvents);

async function gridReady(page: Page, query: string): Promise<Locator> {
  await page.goto(url(query));
  const grid = page.getByRole('grid').first();
  await expect(grid).toBeAttached();
  // The grid keyboard is a lazy chunk loaded after mount; it marks other cells' controls inert to Tab.
  await expect(grid.locator('[role="gridcell"] button[tabindex="-1"]').first()).toBeAttached();
  return grid;
}

test.describe('Listbox layout="grid"', () => {
  test('rows with controls: grid roles, Tab reaches the active row controls then leaves, arrows walk rows and controls', async ({ page }) => {
    const grid = await gridReady(page, 'case=grid');
    await expect(grid).toHaveAttribute('aria-rowcount', '12');
    await expect(grid.getByRole('row')).toHaveCount(12);
    const first = grid.getByRole('gridcell').first();
    await expect(first).toHaveAttribute('aria-selected', 'false');
    await expect(first).not.toHaveAttribute('aria-setsize');
    await expect(grid.getByRole('row').first()).toHaveAttribute('aria-rowindex', '1');

    // Tab into the grid: focus on the grid element, first cell active, no selection.
    await page.locator('#before-grid').focus();
    await page.keyboard.press('Tab');
    await expect(grid).toBeFocused();
    expect(await activeText(page, grid)).toContain('Apple');
    expect(await changes(page)).toEqual([]);

    // Arrows move between rows; selection does not follow focus.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await activeText(page, grid)).toContain('Banana');
    expect(await changes(page)).toEqual([]);

    // Tab reaches the active row's controls only, then leaves the grid.
    await page.keyboard.press('Tab');
    expect(await focusedLabel(page)).toBe('Star Banana');
    await page.keyboard.press('Tab');
    expect(await focusedLabel(page)).toBe('Delete Banana');
    await page.keyboard.press('Tab');
    await expect(page.locator('#after-grid')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await focusedLabel(page)).toBe('Delete Banana');

    // Enter on a control activates it and does not select the row.
    await page.keyboard.press('Enter');
    expect((await events(page)).filter((e) => e.type === 'delete').map((e) => e.detail)).toEqual(['banana']);
    expect(await changes(page)).toEqual([]);

    // Left walks back through the controls to the cell; Right reaches them again.
    await page.keyboard.press('ArrowLeft');
    expect(await focusedLabel(page)).toBe('Star Banana');
    await page.keyboard.press('ArrowLeft');
    await expect(grid).toBeFocused();
    expect(await activeText(page, grid)).toContain('Banana');
    await page.keyboard.press('ArrowRight');
    expect(await focusedLabel(page)).toBe('Star Banana');

    // Down from a control returns to the grid on the next row; Escape from a control returns to its cell.
    await page.keyboard.press('ArrowDown');
    await expect(grid).toBeFocused();
    expect(await activeText(page, grid)).toContain('Blueberry');
    await page.keyboard.press('ArrowRight');
    expect(await focusedLabel(page)).toBe('Star Blueberry');
    await page.keyboard.press('Escape');
    await expect(grid).toBeFocused();
    expect(await activeText(page, grid)).toContain('Blueberry');

    // Down skips the disabled row (Cherry); Space selects the active row.
    await page.keyboard.press('ArrowDown');
    expect(await activeText(page, grid)).toContain('Date');
    await page.keyboard.press('Space');
    expect((await changes(page)).map((c) => c.value)).toEqual(['date']);
    await expect(grid.getByRole('gridcell', { name: /Date/ })).toHaveAttribute('aria-selected', 'true');
    // Ctrl+End / Ctrl+Home reach the last / first cell.
    await page.keyboard.press('Control+End');
    expect(await activeText(page, grid)).toContain('Mango');
    await page.keyboard.press('Control+Home');
    expect(await activeText(page, grid)).toContain('Apple');
  });

  test('pointer: a click on a cell selects it, a click on a control only makes its row active', async ({ page }) => {
    const grid = await gridReady(page, 'case=grid');
    await page.getByRole('button', { name: 'Star Fig' }).click();
    expect((await events(page)).filter((e) => e.type === 'star').map((e) => e.detail)).toEqual(['fig']);
    expect(await changes(page)).toEqual([]);
    expect(await activeText(page, grid)).toContain('Fig');
    // The clicked row is now the tab stop: its controls are tabbable, the others are not.
    await expect(page.getByRole('button', { name: 'Delete Fig' })).not.toHaveAttribute('tabindex', '-1');
    await expect(page.getByRole('button', { name: 'Delete Apple' })).toHaveAttribute('tabindex', '-1');
    await grid.getByRole('gridcell', { name: /Grape/ }).locator('span').first().click({ position: { x: 4, y: 4 } });
    expect((await changes(page)).map((c) => [c.value, c.source])).toEqual([['grape', 'pointer']]);
    await expect(grid.getByRole('gridcell', { name: /Grape/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('gallery of tiles: columns per row, Left / Right within a row, Up / Down keep the column, RTL mirrors', async ({ page }) => {
    await page.goto(url('case=gallery'));
    const grid = page.getByRole('grid').first();
    await expect(grid).toHaveAttribute('aria-rowcount', '5');
    await expect(grid.getByRole('row').first().getByRole('gridcell')).toHaveCount(4);
    // Tiles of one row share a line.
    const boxes = await grid.getByRole('row').first().getByRole('gridcell').evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect().top));
    expect(new Set(boxes).size).toBe(1);
    await grid.focus();
    expect(await activeText(page, grid)).toBe('Style 1');
    // The grid keyboard is a lazy chunk loaded after mount.
    await expect
      .poll(async () => {
        await page.keyboard.press('ArrowRight');
        return activeText(page, grid);
      })
      .toBe('Style 2');
    await page.keyboard.press('ArrowDown');
    // Style 6 (row 2, column 2) is disabled: Down goes on to row 3, column 2.
    expect(await activeText(page, grid)).toBe('Style 10');
    await page.keyboard.press('End');
    expect(await activeText(page, grid)).toBe('Style 12');
    await page.keyboard.press('ArrowRight');
    expect(await activeText(page, grid)).toBe('Style 12');
    await page.keyboard.press('Home');
    expect(await activeText(page, grid)).toBe('Style 9');
    await page.keyboard.press('Control+End');
    expect(await activeText(page, grid)).toBe('Style 18');
    // Up from the short last row keeps the column (column 2 of row 4).
    await page.keyboard.press('ArrowUp');
    expect(await activeText(page, grid)).toBe('Style 14');
    await page.keyboard.press('Enter');
    expect((await changes(page)).map((c) => c.value)).toEqual(['t13']);

    await page.goto(url('case=gallery&dir=rtl'));
    const rtl = page.getByRole('grid').first();
    await rtl.focus();
    await expect.poll(async () => {
      await page.keyboard.press('ArrowLeft');
      return activeText(page, rtl);
    }).toBe('Style 2');
  });

  test('a virtual gallery windows rows and keeps the active cell mounted', async ({ page }) => {
    await page.goto(url('case=gallery&n=4000'));
    const grid = page.getByRole('grid').first();
    await expect(grid).toHaveAttribute('aria-rowcount', '1000');
    expect(await grid.getByRole('row').count()).toBeLessThanOrEqual(3 + 2 * 6 + 1);
    await grid.focus();
    await expect.poll(async () => {
      await page.keyboard.press('Control+End');
      return activeText(page, grid);
    }).toBe('Style 4000');
    await expect(grid.locator('[role="row"][aria-rowindex="1000"]')).toBeAttached();
    expect(await grid.getByRole('row').count()).toBeLessThanOrEqual(3 + 2 * 6 + 1);
  });

  test('axe: zero violations for the list, the grid rows and the gallery, in light, dark and RTL; ARIA snapshot', async ({ page }) => {
    for (const query of ['case=basic', 'case=multiple', 'case=grouped', 'case=rtl', 'case=grid', 'case=grid&dir=rtl', 'case=gallery', 'case=gallery&multiple']) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(url(query));
        await expect(page.locator('.salmon-listbox').first()).toBeAttached();
        await page.locator('[role="listbox"], [role="grid"]').first().focus();
        expect(await axe(page), `${query} ${scheme}`).toEqual([]);
      }
    }
    await page.goto(url('case=gallery&n=8'));
    await expect(page.getByRole('grid')).toMatchAriaSnapshot(`
      - grid "Styles":
        - row "Style 1 Style 2 Style 3 Style 4":
          - gridcell "Style 1"
          - gridcell "Style 2"
          - gridcell "Style 3"
          - gridcell "Style 4"
        - row "Style 5 Style 6 Style 7 Style 8":
          - gridcell "Style 5"
          - gridcell "Style 6" [disabled]
          - gridcell "Style 7"
          - gridcell "Style 8"
    `);
    await page.goto(url('case=basic'));
    await expect(page.getByRole('listbox').first()).toMatchAriaSnapshot(`
      - listbox "Fruit":
        - option "Apple"
        - option "Apricot"
    `);
  });
});
