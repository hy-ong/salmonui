import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// Column chrome in the browser: toolbar roving focus and overflow, column menu,
// context menu, column chooser, pin / unpin, scrolling with pinned zones and
// sticky rows, stacked headers and colSpan under column virtualization.
// Fixture flags: examples/vite-spa/src/main.tsx (`?chrome`, `?stacked`,
// `?span`, `?frozenRows`, `?frozenBottom`, `?frozenCols`, `?frozenRight`).
// Row spans under row virtualization (`?rowSpan`) are covered separately.

const CHROME = `${DEV_URL}?rows=2000&cols=30&chrome`;

type ChromeEvent = { type: string; [k: string]: unknown };
const chromeEvents = (page: Page) => page.evaluate(() => (window as unknown as { __chromeEvents: ChromeEvent[] }).__chromeEvents);
const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid-row[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const popover = (page: Page) => page.locator('[data-salmon-popover]');
const activeInfo = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      toolbarItem: el?.closest<HTMLElement>('[data-toolbar-item]')?.dataset['toolbarItem'] ?? (el?.classList.contains('salmon-data-grid-toolbar__more') ? '__more' : null),
      menuItem: el?.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'] ?? null,
      headerColumn: el?.closest<HTMLElement>('.salmon-data-grid-header-cell')?.dataset['columnId'] ?? null,
      cellColumn: el?.closest<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-cell')?.dataset['columnId'] ?? null,
      cellRow: el?.closest<HTMLElement>('[data-row-id]')?.dataset['rowId'] ?? null,
      isHeaderCell: el?.classList.contains('salmon-data-grid-header-cell') ?? false,
      inGrid: !!el?.closest('[role="grid"]'),
    };
  });

/** Zone of a leaf: where its header cell is rendered. */
const zoneOf = (page: Page, id: string) =>
  page.evaluate(async (columnId) => {
    const find = () => document.querySelector(`.salmon-data-grid-header-cell[data-column-id="${columnId}"]`);
    if (!find()) {
      // A column unpinned to the far edge of the center zone may be virtualized away.
      window.__gridApi.scrollToColumn(columnId);
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    }
    const el = find();
    if (!el) return 'unrendered';
    if (el.closest('.salmon-data-grid-pin--left')) return 'start';
    if (el.closest('.salmon-data-grid-pin--right')) return 'end';
    return 'center';
  }, id);

test.describe('toolbar keyboard and overflow', () => {
  test('Tab enters the toolbar, then the grid; ArrowLeft/Right rove, Home/End jump; overflow menu at narrow width', async ({ page }) => {
    const problems = collectProblems(page);
    // Wide enough for every item at the md control metrics (32px, 12px padding): no overflow yet.
    await page.setViewportSize({ width: 1440, height: 800 });
    await openGrid(page, CHROME);
    // The toolbar is the previous sibling of the grid: Tab from the page control before it lands on its roving stop.
    expect(await page.evaluate(() => document.querySelector('.salmon-data-grid-toolbar')?.nextElementSibling?.getAttribute('role'))).toBe('grid');
    await page.locator('.app__bar select').focus();
    await page.keyboard.press('Tab');
    expect((await activeInfo(page)).toolbarItem).toBe('add');
    // One tab stop: exactly one item has tabIndex 0.
    expect(await page.locator('.salmon-data-grid-toolbar [tabindex="0"]').count()).toBe(1);
    await page.keyboard.press('ArrowRight');
    expect((await activeInfo(page)).toolbarItem).toBe('edit');
    await page.keyboard.press('ArrowRight');
    expect((await activeInfo(page)).toolbarItem).toBe('delete');
    await page.keyboard.press('ArrowLeft');
    expect((await activeInfo(page)).toolbarItem).toBe('edit');
    await expect(page.locator('[data-toolbar-item="edit"]')).toHaveAttribute('tabindex', '0');
    await expect(page.locator('[data-toolbar-item="add"]')).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    expect((await activeInfo(page)).toolbarItem).toBe('search');
    // In the (empty) search box Home / End move the caret; ArrowLeft at the caret start leaves it.
    await page.keyboard.press('ArrowLeft');
    expect((await activeInfo(page)).toolbarItem).toBe('custom');
    await page.keyboard.press('Home');
    expect((await activeInfo(page)).toolbarItem).toBe('add');
    // ArrowLeft wraps from the first item to the last.
    await page.keyboard.press('ArrowLeft');
    expect((await activeInfo(page)).toolbarItem).toBe('search');
    await page.keyboard.press('ArrowRight');
    expect((await activeInfo(page)).toolbarItem).toBe('add');
    // Toolbar keys stay in the toolbar: the grid did not move focus.
    expect((await activeInfo(page)).inGrid).toBe(false);
    // Tab leaves the toolbar into the grid (one tab stop), Shift+Tab comes back to the remembered item.
    await page.keyboard.press('Tab');
    const inGrid = await activeInfo(page);
    expect(inGrid.inGrid).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect((await activeInfo(page)).toolbarItem).toBe('add');

    // Narrow width: trailing items move into the overflow menu, the search box stays.
    await page.setViewportSize({ width: 520, height: 800 });
    const more = page.locator('.salmon-data-grid-toolbar__more');
    await expect(more).toBeVisible();
    await expect(page.locator('[data-toolbar-item="search"]')).toBeVisible();
    const hidden = await page.locator('.salmon-data-grid-toolbar [data-toolbar-item][hidden]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['toolbarItem']));
    expect(hidden).toContain('custom');
    expect(hidden).not.toContain('search');
    // End reaches the overflow button (last stop); Enter opens the overflow menu with the hidden items.
    await page.locator('[data-toolbar-item="add"]').focus();
    await page.keyboard.press('End');
    expect((await activeInfo(page)).toolbarItem).toBe('__more');
    await page.keyboard.press('Enter');
    const menu = page.locator('.salmon-data-grid-toolbar-overflow[role="menu"]');
    await expect(menu).toBeVisible();
    const overflowIds = await menu.locator('[data-item-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['itemId']));
    expect(overflowIds).toEqual(hidden);
    // Activating a custom item from the overflow menu fires onToolbarItemClick and closes the menu.
    await menu.locator('[data-item-id="custom"]').click();
    await expect(menu).toHaveCount(0);
    expect(await chromeEvents(page)).toContainEqual({ type: 'toolbar', id: 'custom', source: 'pointer' });
    // Escape returns focus to the overflow button.
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    expect((await activeInfo(page)).toolbarItem).toBe('__more');
    // Wide again: everything fits and the overflow button goes away.
    await page.setViewportSize({ width: 1600, height: 800 });
    await expect(more).toHaveCount(0);
    expect(await page.locator('.salmon-data-grid-toolbar [data-toolbar-item][hidden]').count()).toBe(0);
    expect(problems).toEqual([]);
  });
});

test.describe('column menu', () => {
  test('pointer: the header button opens it, Escape and outside press close it, focus returns to the header', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    const button = header(page, 's1').locator('.salmon-data-grid-column-menu-button');
    await header(page, 's1').hover();
    await button.click();
    const menu = page.getByRole('menu', { name: 'Text 1 column menu' });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('data-placed', '');
    // Focus moves to the first enabled item.
    expect((await activeInfo(page)).menuItem).toBe('autoSizeAll');
    // The menu sits below its header.
    const h = await header(page, 's1').boundingBox();
    const m = await menu.boundingBox();
    expect(m!.y).toBeGreaterThanOrEqual(h!.y + h!.height - 1);
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    expect((await activeInfo(page)).headerColumn).toBe('s1');
    // Outside press closes.
    await header(page, 's1').hover();
    await button.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(5, 790);
    await expect(popover(page)).toHaveCount(0);
    // Clicking the button of another column swaps the menu (one overlay at a time).
    await header(page, 's2').hover();
    await header(page, 's2').locator('.salmon-data-grid-column-menu-button').click();
    await expect(page.getByRole('menu', { name: 'Text 2 column menu' })).toBeVisible();
    expect(await popover(page).count()).toBe(1);
    await page.keyboard.press('Escape');
    expect(problems).toEqual([]);
  });

  test('keyboard: Shift+Alt+ArrowDown opens, arrows rove, Escape returns focus to the header cell', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await page.evaluate(() => window.__gridApi.focusHeader('s2'));
    expect((await activeInfo(page)).isHeaderCell).toBe(true);
    await page.keyboard.press('Shift+Alt+ArrowDown');
    const menu = page.getByRole('menu', { name: 'Text 2 column menu' });
    await expect(menu).toBeVisible();
    expect((await activeInfo(page)).menuItem).toBe('autoSizeAll');
    await page.keyboard.press('ArrowDown');
    expect((await activeInfo(page)).menuItem).toBe('autoSize');
    await page.keyboard.press('End');
    // `unpin` is disabled for an unpinned column: End lands on the last enabled item.
    expect((await activeInfo(page)).menuItem).toBe('pinEnd');
    await page.keyboard.press('Home');
    expect((await activeInfo(page)).menuItem).toBe('autoSizeAll');
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    const back = await activeInfo(page);
    expect(back.isHeaderCell).toBe(true);
    expect(back.headerColumn).toBe('s2');
    // Alt+ArrowDown opens the column menu when the column has no filter button.
    await page.keyboard.press('Alt+ArrowDown');
    await expect(menu).toBeVisible();
    // Tab closes a menu too.
    await page.keyboard.press('Tab');
    await expect(popover(page)).toHaveCount(0);
    // api.openColumnMenu and onColumnMenuItemClick.
    await page.evaluate(() => window.__gridApi.openColumnMenu('s3'));
    await page.getByRole('menu', { name: 'Text 3 column menu' }).locator('[data-item-id="autoSize"]').click();
    await expect(popover(page)).toHaveCount(0);
    expect(await chromeEvents(page)).toContainEqual({ type: 'columnMenu', id: 'autoSize', field: 's3', source: 'pointer' });
    expect(problems).toEqual([]);
  });
});

test.describe('context menu', () => {
  test('pointer: right-click on a cell and on a header opens the target menu; Escape closes', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await cell(page, 'r2', 's1').click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Context menu' });
    await expect(menu).toBeVisible();
    const cellItems = await menu.locator('[data-item-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['itemId']));
    expect(cellItems).toEqual(['edit', 'delete', 'save', 'cancel', 'copy', 'exportExcel', 'exportPdf', 'exportCsv']);
    // Unavailable built-ins are disabled with a reason.
    await expect(menu.locator('[data-item-id="edit"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(menu.locator('[data-item-id="edit"]')).toHaveAttribute('title', /not available/);
    // Opened at the pointer.
    const c = await cell(page, 'r2', 's1').boundingBox();
    const m = await menu.boundingBox();
    expect(Math.abs(m!.x - (c!.x + c!.width / 2))).toBeLessThanOrEqual(3);
    // An outside press closes it (Escape: see below).
    await page.mouse.click(5, 790);
    await expect(popover(page)).toHaveCount(0);
    // Header target: the header items.
    await header(page, 's1').click({ button: 'right' });
    await expect(menu).toBeVisible();
    const headerItems = await menu.locator('[data-item-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['itemId']));
    expect(headerItems).toContain('pinStart');
    expect(headerItems).toContain('autoSize');
    expect((await activeInfo(page)).menuItem).toBe(headerItems[0]);
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    // works on virtual rows far down and on pinned cells.
    await page.evaluate(() => window.__gridApi.scrollToRow('r1500', { align: 'center' }));
    await page.waitForTimeout(50);
    await cell(page, 'r1500', 'id').click({ button: 'right' });
    await expect(menu).toBeVisible();
    expect(await chromeEvents(page)).toEqual([]);
    await page.mouse.click(5, 790);
    await expect(popover(page)).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('keyboard: Shift+F10 and the ContextMenu key open it for the focused cell and header; focus returns', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await page.evaluate(() => window.__gridApi.focusCell('r3', 's2'));
    const menu = page.getByRole('menu', { name: 'Context menu' });
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    // Anchored to the focused cell.
    const c = await cell(page, 'r3', 's2').boundingBox();
    const m = await menu.boundingBox();
    expect(m!.y).toBeGreaterThanOrEqual(c!.y - 1);
    expect(m!.x).toBeGreaterThanOrEqual(c!.x - 1);
    // All cell items are disabled in this fixture: close through the API (Escape is covered below).
    await page.evaluate(() => window.__gridApi.closeOverlays());
    await expect(popover(page)).toHaveCount(0);
    let back = await activeInfo(page);
    expect([back.cellRow, back.cellColumn]).toEqual(['r3', 's2']);
    await page.keyboard.press('ContextMenu');
    await expect(menu).toBeVisible();
    await page.evaluate(() => window.__gridApi.closeOverlays());
    await expect(popover(page)).toHaveCount(0);
    back = await activeInfo(page);
    expect([back.cellRow, back.cellColumn]).toEqual(['r3', 's2']);
    // Header target from the keyboard: an enabled item is focused, Enter runs it.
    await page.evaluate(() => window.__gridApi.focusHeader('s1'));
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    expect((await activeInfo(page)).menuItem).toBe('autoSizeAll');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(popover(page)).toHaveCount(0);
    expect(await chromeEvents(page)).toContainEqual(expect.objectContaining({ type: 'contextMenu', id: 'autoSize' }));
    back = await activeInfo(page);
    expect(back.headerColumn).toBe('s1');
    // Escape closes the header menu and returns focus to the header cell.
    await page.keyboard.press('ContextMenu');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    back = await activeInfo(page);
    expect([back.isHeaderCell, back.headerColumn]).toEqual([true, 's1']);
    expect(problems).toEqual([]);
  });

  test('keyboard: Shift+F10 and the ContextMenu key on a pager button open the pager menu; Escape returns focus to the button', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${CHROME}&paging=50`);
    const next = page.locator('.salmon-data-grid-pager__next');
    await next.focus();
    const menu = page.getByRole('menu', { name: 'Context menu' });
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    const items = await menu.locator('[data-item-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['itemId']));
    expect(items).toEqual(['firstPage', 'previousPage', 'nextPage', 'lastPage']);
    // Anchored to the focused pager button.
    const b = await next.boundingBox();
    const m = await menu.boundingBox();
    expect(Math.abs(m!.x - (b!.x + 8))).toBeLessThanOrEqual(3);
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('salmon-data-grid-pager__next'))).toBe(true);
    // The ContextMenu key too; a pager item runs from the keyboard.
    await page.keyboard.press('ContextMenu');
    await expect(menu).toBeVisible();
    for (let i = 0; i < 4 && (await activeInfo(page)).menuItem !== 'nextPage'; i++) await page.keyboard.press('ArrowDown');
    expect((await activeInfo(page)).menuItem).toBe('nextPage');
    await page.keyboard.press('Enter');
    await expect(popover(page)).toHaveCount(0);
    expect(await chromeEvents(page)).toContainEqual(expect.objectContaining({ type: 'contextMenu', id: 'nextPage', target: { kind: 'pager' }, source: 'keyboard' }));
    await expect(page.locator('.salmon-data-grid-pager__number[aria-current="page"]')).toHaveText('2');
    expect(problems).toEqual([]);
  });

  // Every item disabled (no edit, clipboard or export modules): the menu itself takes focus.
  test('Escape closes a context menu whose items are all disabled and returns focus to the cell', async ({ page }) => {
    await openGrid(page, CHROME);
    await page.evaluate(() => window.__gridApi.focusCell('r3', 's2'));
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menu', { name: 'Context menu' })).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-salmon-popover]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    const back = await activeInfo(page);
    expect([back.cellRow, back.cellColumn]).toEqual(['r3', 's2']);
  });
});

test.describe('column chooser', () => {
  test('toolbar and api open it; unchecking hides a column, checking shows it; search narrows the list', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await page.locator('[data-toolbar-item="columnChooser"]').click();
    const dialog = page.getByRole('dialog', { name: 'Choose columns' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const item = (id: string) => dialog.locator(`.salmon-data-grid-column-chooser__item[data-column-id="${id}"] input`);
    await expect(item('s1')).toBeChecked();
    await item('s1').uncheck();
    await item('n4').uncheck();
    // Not applied before OK.
    await expect(header(page, 's1')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(header(page, 's1')).toHaveCount(0);
    await expect(header(page, 'n4')).toHaveCount(0);
    expect(await page.locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="s1"]').count()).toBe(0);
    expect(await page.locator('[role="grid"]').getAttribute('aria-colcount')).toBe('29');
    // Focus returns to the invoker.
    expect((await activeInfo(page)).toolbarItem).toBe('columnChooser');
    // Search narrows the list; Cancel discards.
    await page.evaluate(() => window.__gridApi.openColumnChooser({ x: 200, y: 200 }));
    await expect(dialog).toBeVisible();
    await dialog.getByRole('searchbox', { name: 'Search columns' }).fill('Number');
    const shown = await dialog.locator('.salmon-data-grid-column-chooser__item:not([hidden])').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['columnId']));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((id) => id?.startsWith('n'))).toBe(true);
    await item('n5').uncheck();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(header(page, 'n5')).toHaveCount(1);
    // Show s1 again.
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    await expect(item('s1')).not.toBeChecked();
    await item('s1').check();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(header(page, 's1')).toHaveCount(1);
    await expect(header(page, 'n4')).toHaveCount(0);
    // Escape closes it like the menus.
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

test.describe('pin and unpin', () => {
  test('column menu pin to start / end / unpin moves the column between zones', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    expect(await zoneOf(page, 's2')).toBe('center');
    const pick = async (id: string, item: string) => {
      await page.evaluate((f) => window.__gridApi.openColumnMenu(f), id);
      await popover(page).locator(`[data-item-id="${item}"]`).click();
      await expect(popover(page)).toHaveCount(0);
    };
    await pick('s2', 'pinStart');
    expect(await zoneOf(page, 's2')).toBe('start');
    await expect(header(page, 's2')).toHaveAttribute('data-frozen', 'left');
    // The pinned column follows the previous start zone (inner edge).
    const startOrder = await page.locator('.salmon-data-grid-header .salmon-data-grid-pin--left .salmon-data-grid-header-cell').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['columnId']));
    expect(startOrder).toEqual(['id', 's2']);
    // Body cells of a rendered row follow.
    expect(await page.locator('.salmon-data-grid-row[data-row-id="r0"] .salmon-data-grid-pin--left .salmon-data-grid-cell[data-column-id="s2"]').count()).toBe(1);
    await pick('s3', 'pinEnd');
    expect(await zoneOf(page, 's3')).toBe('end');
    // Unpin is enabled now and moves it back to the center.
    await page.evaluate(() => window.__gridApi.openColumnMenu('s3'));
    await expect(popover(page).locator('[data-item-id="unpin"]')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(popover(page).locator('[data-item-id="pinEnd"]')).toHaveAttribute('aria-disabled', 'true');
    await popover(page).locator('[data-item-id="unpin"]').click();
    expect(await zoneOf(page, 's3')).toBe('center');
    expect(await chromeEvents(page)).toEqual(
      expect.arrayContaining([
        { type: 'pin', field: 's2', pinned: 'start' },
        { type: 'pin', field: 's3', pinned: 'end' },
        { type: 'pin', field: 's3', pinned: null },
      ]),
    );
    // api.pinColumn.
    await page.evaluate(() => window.__gridApi.pinColumn('s2', null));
    expect(await zoneOf(page, 's2')).toBe('center');
    expect(problems).toEqual([]);
  });

  test('keyboard: Alt+Shift+ArrowLeft / Right pin, Alt+Shift+ArrowUp unpins; header focus follows the column', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, CHROME);
    await page.evaluate(() => window.__gridApi.focusHeader('s1'));
    await page.keyboard.press('Alt+Shift+ArrowLeft');
    await expect.poll(() => zoneOf(page, 's1')).toBe('start');
    let focus = await activeInfo(page);
    expect([focus.isHeaderCell, focus.headerColumn]).toEqual([true, 's1']);
    await page.keyboard.press('Alt+Shift+ArrowUp');
    await expect.poll(() => zoneOf(page, 's1')).toBe('center');
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await expect.poll(() => zoneOf(page, 's1')).toBe('end');
    focus = await activeInfo(page);
    expect([focus.isHeaderCell, focus.headerColumn]).toEqual([true, 's1']);
    // The pinned end column stays at the right edge of the viewport.
    const vp = await page.locator('.salmon-data-grid-viewport').boundingBox();
    const h = await header(page, 's1').boundingBox();
    expect(Math.abs(h!.x + h!.width - (vp!.x + vp!.width))).toBeLessThanOrEqual(20);
    await page.keyboard.press('Alt+Shift+ArrowUp');
    await expect.poll(() => zoneOf(page, 's1')).toBe('center');
    expect((await chromeEvents(page)).filter((e) => e.type === 'pin').map((e) => e.pinned)).toEqual(['start', null, 'end', null]);
    expect(problems).toEqual([]);
  });
});

/** Every sampled point of the body shows a cell (no blank areas), in every zone. */
async function blankPoints(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
    const rect = vp.getBoundingClientRect();
    const headerBottom = (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect().bottom;
    // Scrollbars take the last pixels of the viewport.
    const right = rect.left + vp.clientWidth - 2;
    const bottom = rect.top + vp.clientHeight - 2;
    const misses: string[] = [];
    for (let y = headerBottom + 3; y < bottom; y += 33) {
      for (let x = rect.left + 3; x < right; x += 47) {
        const el = document.elementFromPoint(x, y);
        if (!el?.closest('.salmon-data-grid-cell')) misses.push(`${Math.round(x)},${Math.round(y)}:${el?.className ?? 'none'}`);
      }
    }
    return misses;
  });
}

test.describe('scrolling with pinned zones and sticky rows', () => {
  test('horizontal and vertical scroll: start/end pinned cells stay put, data-scrolled-* flip, no blank cells', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=5000&frozenCols=2&frozenRight`);
    const vp = page.locator('.salmon-data-grid-viewport');
    const lastId = await page.evaluate(() => (document.querySelector('.salmon-data-grid-header .salmon-data-grid-pin--right .salmon-data-grid-header-cell') as HTMLElement).dataset['columnId'] as string);
    // frozenCols=2 pins id and s0 (count shorthand), the last column is pinned to the end.
    expect(await page.locator('.salmon-data-grid-header .salmon-data-grid-pin--left .salmon-data-grid-header-cell').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['columnId']))).toEqual(['id', 's0']);
    await expect(vp).not.toHaveAttribute('data-scrolled-start', /.*/);
    await expect(vp).toHaveAttribute('data-scrolled-end', '');
    const boxes = async (rowId: string) => ({
      id: await cell(page, rowId, 'id').boundingBox(),
      s0: await cell(page, rowId, 's0').boundingBox(),
      last: await cell(page, rowId, lastId).boundingBox(),
      hId: await header(page, 'id').boundingBox(),
      hLast: await header(page, lastId).boundingBox(),
    });
    const before = await boxes('r0');
    expect(await blankPoints(page)).toEqual([]);
    // Horizontal: middle, then the far end.
    await scrollViewport(page, null, 4000);
    await expect(vp).toHaveAttribute('data-scrolled-start', '');
    await expect(vp).toHaveAttribute('data-scrolled-end', '');
    let after = await boxes('r0');
    expect(after.id!.x).toBe(before.id!.x);
    expect(after.s0!.x).toBe(before.s0!.x);
    expect(after.last!.x).toBe(before.last!.x);
    expect(after.hLast!.x).toBe(before.hLast!.x);
    expect(await blankPoints(page)).toEqual([]);
    await scrollViewport(page, null, 1e6);
    await expect(vp).toHaveAttribute('data-scrolled-start', '');
    await expect(vp).not.toHaveAttribute('data-scrolled-end', /.*/);
    after = await boxes('r0');
    expect(after.id!.x).toBe(before.id!.x);
    expect(after.last!.x).toBe(before.last!.x);
    expect(await blankPoints(page)).toEqual([]);
    // Vertical at the far end: the pinned columns of deep rows line up with their headers.
    await scrollViewport(page, 36 * 3000, null);
    const first = await page.evaluate(() => window.__gridApi.getRenderedRange().rows.start as number);
    const deep = await boxes(`r${first + 3}`);
    expect(deep.id!.x).toBe(before.id!.x);
    expect(deep.last!.x).toBe(before.last!.x);
    expect(deep.hId!.y).toBe(before.hId!.y);
    expect(await blankPoints(page)).toEqual([]);
    // Back to the start: the start shadow flag clears.
    await scrollViewport(page, null, 0);
    await expect(vp).not.toHaveAttribute('data-scrolled-start', /.*/);
    await expect(vp).toHaveAttribute('data-scrolled-end', '');
    expect(await blankPoints(page)).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('sticky top and bottom rows stay in place during vertical scroll', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=5000&cols=30&frozenRows=2&frozenBottom=1`);
    const top = page.locator('.salmon-data-grid-frozen-rows--top');
    const bottom = page.locator('.salmon-data-grid-frozen-rows--bottom');
    const ids = (loc: ReturnType<Page['locator']>) => loc.locator('[role="row"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['rowId']));
    expect(await ids(top)).toEqual(['r0', 'r1']);
    expect(await ids(bottom)).toEqual(['r4999']);
    const topBox = await top.boundingBox();
    const bottomBox = await bottom.boundingBox();
    const vpBox = await page.locator('.salmon-data-grid-viewport').boundingBox();
    const headerBox = await page.locator('.salmon-data-grid-header').boundingBox();
    // Top rows sit right under the header; the bottom row at the bottom of the viewport.
    expect(Math.abs(topBox!.y - (headerBox!.y + headerBox!.height))).toBeLessThanOrEqual(1);
    expect(bottomBox!.y + bottomBox!.height).toBeLessThanOrEqual(vpBox!.y + vpBox!.height + 1);
    expect(bottomBox!.y + bottomBox!.height).toBeGreaterThan(vpBox!.y + vpBox!.height - 40);
    for (const y of [36 * 100, 36 * 2500, 1e7, 36 * 7]) {
      await scrollViewport(page, y, null);
      expect(await top.boundingBox(), `top at ${y}`).toEqual(topBox);
      expect(await bottom.boundingBox(), `bottom at ${y}`).toEqual(bottomBox);
      expect(await ids(top)).toEqual(['r0', 'r1']);
      expect(await ids(bottom)).toEqual(['r4999']);
      // Scrolling rows do not repeat the sticky ones.
      const scrolling = await page.locator('.salmon-data-grid-rows [role="row"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['rowId']));
      expect(scrolling).not.toContain('r0');
      expect(scrolling).not.toContain('r4999');
      expect(await blankPoints(page)).toEqual([]);
    }
    // Sticky rows keep absolute aria-rowindex values (header row is 1).
    expect(await top.locator('[role="row"]').first().getAttribute('aria-rowindex')).toBe('2');
    expect(await bottom.locator('[role="row"]').first().getAttribute('aria-rowindex')).toBe('5001');
    expect(problems).toEqual([]);
  });
});

interface GroupCellInfo {
  key: string;
  groupId: string;
  level: number;
  colIndex: number;
  span: number;
  x: number;
  width: number;
}

/** Group header cells and leaf header boxes of the rendered window. */
const stackedHeader = (page: Page) =>
  page.evaluate(() => {
    const groups: GroupCellInfo[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('.salmon-data-grid-header-group')) {
      const r = el.getBoundingClientRect();
      const colIndex = Number(el.getAttribute('aria-colindex'));
      groups.push({
        key: `${el.dataset['groupId']}@${colIndex}`,
        groupId: el.dataset['groupId'] as string,
        level: Number((el.closest('[role="row"]') as HTMLElement).dataset['level']),
        colIndex,
        span: Number(el.getAttribute('aria-colspan') ?? 1),
        x: r.x,
        width: r.width,
      });
    }
    const leaves = new Map<number, { x: number; width: number }>();
    for (const el of document.querySelectorAll<HTMLElement>('.salmon-data-grid-header-cell[data-column-id]')) {
      const r = el.getBoundingClientRect();
      leaves.set(Number(el.getAttribute('aria-colindex')), { x: r.x, width: r.width });
    }
    return { groups, leaves: [...leaves.entries()] };
  });

/**
 * `?stacked`: leaf colIndex c (1-based, id is 1) belongs to Group floor((c-2)/10)
 * and Part A when (c-2) % 10 < 5. Every group cell must span exactly the
 * rendered leaves of its group (a maximal run), with the summed width.
 */
function checkStacked(state: Awaited<ReturnType<typeof stackedHeader>>): void {
  const leaves = new Map(state.leaves);
  const groupOf = (c: number, level: number) => (level === 0 ? `g${Math.floor((c - 2) / 10)}` : `g${Math.floor((c - 2) / 10)}${(c - 2) % 10 < 5 ? 'a' : 'b'}`);
  for (const g of state.groups) {
    for (let c = g.colIndex; c < g.colIndex + g.span; c++) {
      expect(leaves.has(c), `${g.key}: leaf ${c} rendered`).toBe(true);
      expect(groupOf(c, g.level), `${g.key}: leaf ${c}`).toBe(g.groupId);
    }
    // Maximal: the rendered neighbours belong to other groups.
    if (leaves.has(g.colIndex - 1) && g.colIndex - 1 >= 2) expect(groupOf(g.colIndex - 1, g.level)).not.toBe(g.groupId);
    if (leaves.has(g.colIndex + g.span)) expect(groupOf(g.colIndex + g.span, g.level)).not.toBe(g.groupId);
    const first = leaves.get(g.colIndex)!;
    let width = 0;
    for (let c = g.colIndex; c < g.colIndex + g.span; c++) width += leaves.get(c)!.width;
    expect(Math.abs(g.x - first.x), `${g.key} x`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.width - width), `${g.key} width`).toBeLessThanOrEqual(1);
  }
}

test.describe('stacked headers under column virtualization', () => {
  test('group cells span the rendered leaves (aria-colspan), stay keyed and are not remounted while scrolling', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=5000&stacked`);
    expect(await page.locator('.salmon-data-grid-header [role="row"]').count()).toBe(3);
    // The id leaf spans all three header rows.
    await expect(header(page, 'id')).toHaveAttribute('aria-rowspan', '3');
    let state = await stackedHeader(page);
    checkStacked(state);
    // Column virtualization is on: not every group is rendered.
    expect(new Set(state.groups.filter((g) => g.level === 0).map((g) => g.groupId)).size).toBeLessThan(10);
    // Tag every group element, then scroll a few columns at a time.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>('.salmon-data-grid-header-group')) (el as unknown as { __tag: string }).__tag = `${el.dataset['groupId']}@${el.getAttribute('aria-colindex')}`;
    });
    let kept = 0;
    let partial = 0;
    const firstLeaf = async () => page.evaluate(() => window.__gridApi.getRenderedRange().columns.start as number);
    let lastStart = await firstLeaf();
    let windowMoves = 0;
    for (let left = 150; left <= 6000; left += 150) {
      const prevKeys = new Set(state.groups.map((g) => g.key));
      await scrollViewport(page, null, left);
      state = await stackedHeader(page);
      checkStacked(state);
      const start = await firstLeaf();
      if (start !== lastStart) windowMoves++;
      lastStart = start;
      // A group cell whose first rendered leaf did not change is the same DOM node.
      const result = await page.evaluate((keys) => {
        let same = 0;
        const remounted: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('.salmon-data-grid-header-group')) {
          const key = `${el.dataset['groupId']}@${el.getAttribute('aria-colindex')}`;
          const tag = (el as unknown as { __tag?: string }).__tag;
          if (keys.includes(key)) {
            if (tag === key) same++;
            else remounted.push(key);
          }
          (el as unknown as { __tag: string }).__tag = key;
        }
        return { same, remounted };
      }, [...prevKeys]);
      expect(result.remounted, `scrollLeft ${left}`).toEqual([]);
      kept += result.same;
      // A level-0 group cut by the window edge spans fewer than its 10 leaves.
      partial += state.groups.filter((g) => g.level === 0 && g.span < 10).length;
    }
    expect(windowMoves).toBeGreaterThan(5);
    expect(kept).toBeGreaterThan(20);
    expect(partial).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  test('scrolling within the rendered window commits no header cells (dev instrumentation)', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __commits: { headers: string[] }[] }).__commits = [];
      (window as unknown as { __SALMON_UI_DEVTOOLS__: unknown }).__SALMON_UI_DEVTOOLS__ = {
        onCommit(commit: { phase: string; headers: readonly string[] }) {
          (window as unknown as { __commits: { phase: string; headers: string[] }[] }).__commits.push({ phase: commit.phase, headers: [...commit.headers] });
        },
      };
    });
    await openGrid(page, `${DEV_URL}?rows=5000&stacked`);
    await scrollViewport(page, null, 2000);
    await page.waitForTimeout(100);
    const start = await page.evaluate(() => (window as unknown as { __commits: unknown[] }).__commits.length);
    for (let i = 1; i <= 10; i++) await scrollViewport(page, null, 2000 + i);
    expect(await page.evaluate((s) => (window as unknown as { __commits: unknown[] }).__commits.length - s, start)).toBe(0);
  });
});

test.describe('colSpan under column virtualization', () => {
  test('a span that starts before the rendered slice is still drawn; covered cells are not rendered', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=5000&span`);
    // Row r0 (rowIndex 0): s3 spans s3, n4, n5.
    const s3 = cell(page, 'r0', 's3');
    await expect(s3).toHaveAttribute('aria-colspan', '3');
    await expect(cell(page, 'r0', 'n4')).toHaveCount(0);
    await expect(cell(page, 'r0', 'n5')).toHaveCount(0);
    await expect(cell(page, 'r1', 's3')).not.toHaveAttribute('aria-colspan', /.*/);
    await expect(cell(page, 'r1', 'n4')).toHaveCount(1);
    const width = async () => {
      const [a, b, c] = [await header(page, 's3').boundingBox(), await header(page, 'n4').boundingBox(), await header(page, 'n5').boundingBox()];
      return a!.width + b!.width + c!.width;
    };
    expect(Math.abs((await s3.boundingBox())!.width - (await width()))).toBeLessThanOrEqual(1);
    // Scroll until s3 (leaf index 4) leaves the rendered center slice while n5 (index 6) is still rendered.
    let found = false;
    for (let left = 40; left <= 1200; left += 20) {
      await scrollViewport(page, null, left);
      const rendered = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-header .salmon-data-grid-center .salmon-data-grid-header-cell')].map((e) => e.dataset['columnId']));
      if (!rendered.includes('s3') && rendered.includes('n5')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    // The span is found by the lookback: r0 still shows s3 across the visible part, n4 / n5 stay covered.
    await expect(s3).toHaveCount(1);
    await expect(s3).toHaveAttribute('aria-colspan', '3');
    await expect(cell(page, 'r0', 'n5')).toHaveCount(0);
    const box = (await s3.boundingBox())!;
    const n5 = (await header(page, 'n5').boundingBox())!;
    expect(Math.abs(box.x + box.width - (n5.x + n5.width))).toBeLessThanOrEqual(1);
    // Row r5 (rowIndex 5) spans too, r6 does not.
    await expect(cell(page, 'r5', 's3')).toHaveAttribute('aria-colspan', '3');
    await expect(cell(page, 'r6', 'n5')).toHaveCount(1);
    expect(await blankPoints(page)).toEqual([]);
    // Far away the spans are not rendered at all and nothing breaks.
    await scrollViewport(page, 36 * 2000, 8000);
    expect(await blankPoints(page)).toEqual([]);
    expect(problems).toEqual([]);
  });
});
