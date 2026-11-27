import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Data Grid popups inside a modal Dialog: the column menu and the filter menu portal into the open modal
// dialog around the grid (`internal/modal-host.ts`) and are shown in the top
// layer after it, so they stay interactive; Escape closes the popup first,
// then the dialog. Page: examples/vite-spa/modal-popups.html?host=grid.

const PAGE = `${DEV_URL}modal-popups.html?host=grid`;

const surface = (page: Page) => page.locator('dialog[data-test=grid]');
const header = (page: Page, id: string) => surface(page).locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const popover = (page: Page) => page.locator('[data-salmon-popover]');
const log = (page: Page, id: string) => page.evaluate((i) => (window.__modal ?? []).filter((e) => e['id'] === i), id);
const fruits = (page: Page) => page.evaluate(() => (window.__gridApi?.getViewRows() as { fruit: string }[]).map((r) => r.fruit));
const focusedHeader = (page: Page) => page.evaluate(() => document.activeElement?.closest<HTMLElement>('.salmon-data-grid-header-cell')?.dataset['columnId'] ?? null);

async function open(page: Page): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(PAGE);
  await page.waitForSelector('#page');
  await page.locator('#open').click();
  await expect(surface(page)).toBeVisible();
  expect(await surface(page).evaluate((el) => el.matches(':modal'))).toBe(true);
  await expect(header(page, 'fruit')).toBeVisible();
  return problems;
}

/** The popup is a descendant of the modal dialog, in the top layer, placed at its anchor, and the top element at its center. */
async function expectInteractive(popup: Locator, anchor: Locator): Promise<void> {
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute('data-placed', '');
  const state = await popup.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = el.ownerDocument.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12));
    return { inDialog: !!el.parentElement?.matches('dialog:modal'), hit: !!hit && el.contains(hit), topLayer: el.matches(':popover-open') };
  });
  expect(state).toEqual({ inDialog: true, hit: true, topLayer: true });
  // Viewport coordinates: the dialog's transform does not offset the box (it opens below its header).
  const a = (await anchor.boundingBox())!;
  const p = (await popup.boundingBox())!;
  expect(p.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
  expect(p.y).toBeLessThan(a.y + a.height + 40);
}

/** Escape closes the popup only (focus back on the header cell in the dialog); the next Escape closes the dialog. */
async function escapeOrder(page: Page, popup: Locator, columnId: string): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(surface(page)).toBeVisible();
  expect(await focusedHeader(page)).toBe(columnId);
  await page.keyboard.press('Escape');
  await expect(surface(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('open');
}

test.describe('Data Grid popups inside a modal Dialog', () => {
  test('column menu: pointer and keyboard choice, Escape order', async ({ page }) => {
    const problems = await open(page);
    // Pointer.
    await header(page, 'fruit').hover();
    await header(page, 'fruit').locator('.salmon-data-grid-column-menu-button').click();
    const menu = page.getByRole('menu', { name: 'Fruit column menu' });
    await expectInteractive(menu, header(page, 'fruit'));
    await menu.locator('[data-item-id="note"]').click();
    await expect(popover(page)).toHaveCount(0);
    expect((await log(page, 'grid-column-menu')).at(-1)).toMatchObject({ value: 'note', field: 'fruit' });
    await expect(surface(page)).toBeVisible();
    // Keyboard: Shift+Alt+ArrowDown on the header cell opens it; arrows rove, Enter activates.
    await page.evaluate(() => window.__gridApi?.focusHeader('qty'));
    await page.keyboard.press('Shift+Alt+ArrowDown');
    const qtyMenu = page.getByRole('menu', { name: 'Quantity column menu' });
    await expectInteractive(qtyMenu, header(page, 'qty'));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(popover(page)).toHaveCount(0);
    expect((await log(page, 'grid-column-menu')).at(-1)).toMatchObject({ value: 'note', field: 'qty' });
    expect(await focusedHeader(page)).toBe('qty');
    // Escape order.
    await page.keyboard.press('Shift+Alt+ArrowDown');
    await expect(qtyMenu).toBeVisible();
    await escapeOrder(page, qtyMenu, 'qty');
    expect(problems).toEqual([]);
  });

  test('filter menu: pointer and keyboard choice, Escape order; opened from the column menu too', async ({ page }) => {
    const problems = await open(page);
    // Pointer: uncheck a value, then OK.
    await header(page, 'fruit').locator('.salmon-data-grid-filter-button').click();
    const filter = page.locator('.salmon-data-grid-filter-menu');
    await expectInteractive(filter, header(page, 'fruit'));
    await filter.locator('[role="option"]', { hasText: 'Banana' }).click();
    await filter.getByRole('button', { name: 'OK' }).click();
    await expect(filter).toHaveCount(0);
    await expect.poll(() => fruits(page)).not.toContain('Banana');
    expect(await fruits(page)).toHaveLength(6);
    // Keyboard: Alt+ArrowDown on the header cell opens it; type a search, Enter applies the matches.
    await page.evaluate(() => window.__gridApi?.focusHeader('fruit'));
    await page.keyboard.press('Alt+ArrowDown');
    await expectInteractive(filter, header(page, 'fruit'));
    await filter.getByRole('searchbox').focus();
    await page.keyboard.type('Gr');
    await expect(filter.locator('[role="option"]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(filter).toHaveCount(0);
    await expect.poll(() => fruits(page)).toEqual(['Grape', 'Grape']);
    // The column menu's filter item replaces the menu with the filter menu, still inside the dialog.
    await header(page, 'fruit').hover();
    await header(page, 'fruit').locator('.salmon-data-grid-column-menu-button').click();
    await page.getByRole('menu', { name: 'Fruit column menu' }).locator('[data-item-id="filter"]').click();
    await expectInteractive(filter, header(page, 'fruit'));
    // A press elsewhere in the dialog closes the popup, not the dialog.
    await surface(page).locator('.salmon-dialog-title').click();
    await expect(filter).toHaveCount(0);
    await expect(surface(page)).toBeVisible();
    // Escape order.
    await page.evaluate(() => window.__gridApi?.focusHeader('fruit'));
    await page.keyboard.press('Alt+ArrowDown');
    await expect(filter).toBeVisible();
    await escapeOrder(page, filter, 'fruit');
    expect(problems).toEqual([]);
  });

  test('a backdrop press while a grid popup is open closes the popup only', async ({ page }) => {
    await open(page);
    await header(page, 'fruit').locator('.salmon-data-grid-filter-button').click();
    await expect(page.locator('.salmon-data-grid-filter-menu')).toBeVisible();
    const box = (await surface(page).boundingBox())!;
    expect(8 < box.x).toBe(true);
    await page.mouse.click(8, 400);
    await expect(popover(page)).toHaveCount(0);
    await expect(surface(page)).toBeVisible();
    // Without an open popup, the dismissible dialog closes on the backdrop.
    await page.mouse.click(8, 400);
    await expect(surface(page)).toHaveCount(0);
  });
});
