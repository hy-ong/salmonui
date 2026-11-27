import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// The Data Grid under a theme's density and `tableHeader` surface
// (examples/vite-spa/data-grid-theme.html):
// compact metrics in the layout and the CSS, and a repainted header whose
// text, indicators and controls keep their contrast while popups and the
// body keep their own colors.

const PAGE = `${DEV_URL}data-grid-theme.html`;
const TEAL = 'rgb(14, 77, 92)';

interface Metrics {
  row: number;
  headerRow: number;
  cellFont: string;
  headerFont: string;
  cellPadding: string;
  headerPadding: string;
  /** Body row offsets of the first rows: the virtualization layout uses the CSS row height. */
  rowTops: number[];
  filterButton: number;
}

function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    const grid = document.querySelector('.salmon-data-grid') as HTMLElement;
    const rtl = getComputedStyle(grid).direction === 'rtl';
    const cell = grid.querySelector('.salmon-data-grid-row .salmon-data-grid-cell[data-column-id="name"]') as HTMLElement;
    const header = grid.querySelector('.salmon-data-grid-header-cell[data-column-id="name"]') as HTMLElement;
    const start = (el: HTMLElement) => (rtl ? getComputedStyle(el).paddingRight : getComputedStyle(el).paddingLeft);
    const rows = [...grid.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row')].slice(0, 3);
    return {
      row: (grid.querySelector('.salmon-data-grid-rows .salmon-data-grid-row') as HTMLElement).getBoundingClientRect().height,
      headerRow: (grid.querySelector('.salmon-data-grid-header-row') as HTMLElement).getBoundingClientRect().height,
      cellFont: getComputedStyle(cell).fontSize,
      headerFont: getComputedStyle(header).fontSize,
      cellPadding: start(cell),
      headerPadding: start(header),
      rowTops: rows.map((r) => Math.round(r.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().top)),
      filterButton: (header.querySelector('.salmon-data-grid-filter-button') as HTMLElement).getBoundingClientRect().height,
    };
  });
}

interface HeaderColors {
  headerBg: string;
  cellBg: string;
  frozenBg: string;
  selectBg: string;
  bodyCellBg: string;
  text: number;
  sortIndicator: number;
  sortIndicatorColor: string;
  filterButton: number;
  menuButton: number;
  selectAllBorder: number;
  resizeLine: number;
  rowLine: number;
}

/** Background, foreground and WCAG contrast ratios of the header parts, computed in the page. */
function headerColors(page: Page): Promise<HeaderColors> {
  return page.evaluate(() => {
    const rgb = (value: string): number[] => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (value: string): number => {
      const [r, g, b] = rgb(value).map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string): number => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const grid = document.querySelector('.salmon-data-grid') as HTMLElement;
    const header = grid.querySelector('.salmon-data-grid-header') as HTMLElement;
    const bg = getComputedStyle(header).backgroundColor;
    const nameCell = header.querySelector('.salmon-data-grid-header-cell[data-column-id="name"]') as HTMLElement;
    const indicator = nameCell.querySelector('.salmon-data-grid-sort-indicator') as HTMLElement;
    const resize = nameCell.querySelector('.salmon-data-grid-resize-handle') as HTMLElement;
    const selectAll = header.querySelector('.salmon-data-grid-select-checkbox') as HTMLElement;
    return {
      headerBg: bg,
      cellBg: getComputedStyle(nameCell).backgroundColor,
      frozenBg: getComputedStyle(header.querySelector('.salmon-data-grid-header-cell[data-column-id="id"]') as HTMLElement).backgroundColor,
      selectBg: getComputedStyle(selectAll.closest('.salmon-data-grid-header-cell') as HTMLElement).backgroundColor,
      bodyCellBg: getComputedStyle(grid.querySelector('.salmon-data-grid-rows .salmon-data-grid-row') as HTMLElement).backgroundColor,
      text: ratio(getComputedStyle(nameCell).color, bg),
      sortIndicator: ratio(getComputedStyle(indicator, '::before').backgroundColor, bg),
      sortIndicatorColor: getComputedStyle(indicator, '::before').backgroundColor,
      filterButton: ratio(getComputedStyle(nameCell.querySelector('.salmon-data-grid-filter-button') as HTMLElement).color, bg),
      menuButton: ratio(getComputedStyle(nameCell.querySelector('.salmon-data-grid-column-menu-button') as HTMLElement).color, bg),
      selectAllBorder: ratio(getComputedStyle(selectAll).borderTopColor, bg),
      resizeLine: ratio(getComputedStyle(resize, '::after').backgroundColor, bg),
      rowLine: ratio(getComputedStyle(header.querySelector('.salmon-data-grid-header-row') as HTMLElement).borderBottomColor, bg),
    };
  });
}

test.describe('Data Grid theme density', () => {
  test('default density: 36 px rows, 40 px header, 14 px text, 12 px cell padding', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, PAGE);
    const m = await metrics(page);
    expect(m.row).toBe(36);
    expect(m.headerRow).toBe(40);
    expect(m.rowTops).toEqual([0, 36, 72]);
    expect([m.cellFont, m.headerFont]).toEqual(['14px', '14px']);
    expect([m.cellPadding, m.headerPadding]).toEqual(['12px', '12px']);
    expect(problems).toEqual([]);
  });

  for (const dir of ['ltr', 'rtl'] as const) {
    test(`compact density (${dir}): 32 px rows, 36 px header, 13 px text, 10 px cell padding`, async ({ page }) => {
      const problems = collectProblems(page);
      await openGrid(page, `${PAGE}?density=compact${dir === 'rtl' ? '&dir=rtl' : ''}`);
      const m = await metrics(page);
      expect(m.row).toBe(32);
      expect(m.headerRow).toBe(36);
      expect(m.rowTops).toEqual([0, 32, 64]);
      expect([m.cellFont, m.headerFont]).toEqual(['13px', '13px']);
      expect([m.cellPadding, m.headerPadding]).toEqual(['10px', '10px']);
      await expectClean(page, `compact ${dir}`);
      // In-header controls fit the compact header.
      expect(m.filterButton).toBeLessThanOrEqual(36);
      // Scrolling to the end shows the last row (Person 99 sorts last): the layout and the CSS agree on the row height.
      await scrollViewport(page, 200 * 32, null);
      await expect(page.locator('[role="row"][data-row-id="p99"]')).toBeInViewport();
      expect(await page.evaluate(() => (document.querySelector('.salmon-data-grid-body') as HTMLElement).getBoundingClientRect().height)).toBe(200 * 32);
      expect(problems).toEqual([]);
    });
  }
});

test.describe('Data Grid table header surface', () => {
  for (const dir of ['ltr', 'rtl'] as const) {
    test(`surfaces.tableHeader repaints the header only (${dir})`, async ({ page }) => {
      const problems = collectProblems(page);
      await openGrid(page, `${PAGE}?surface&density=compact${dir === 'rtl' ? '&dir=rtl' : ''}`);
      const c = await headerColors(page);
      // The header, its cells, the frozen (pinned) and the selection header cells share the seed.
      expect([c.headerBg, c.cellBg, c.frozenBg, c.selectBg]).toEqual([TEAL, TEAL, TEAL, TEAL]);
      expect(c.bodyCellBg).not.toBe(TEAL);
      expect(c.text).toBeGreaterThanOrEqual(4.5);
      // The sort indicator paints with the surface's secondary text color, at text contrast.
      expect(c.sortIndicator).toBeGreaterThanOrEqual(4.5);
      expect(c.filterButton).toBeGreaterThanOrEqual(4.5);
      expect(c.menuButton).toBeGreaterThanOrEqual(4.5);
      // Non-text parts: at least 3:1.
      expect(c.selectAllBorder).toBeGreaterThanOrEqual(3);
      expect(c.resizeLine).toBeGreaterThanOrEqual(3);
      expect(c.rowLine).toBeGreaterThanOrEqual(3);
      await expectClean(page, `surface ${dir}`);

      // The column menu is portaled outside the header and keeps the overlay colors.
      const cell = page.locator('.salmon-data-grid-header-cell[data-column-id="city"]');
      await cell.hover();
      await cell.locator('.salmon-data-grid-column-menu-button').click();
      const menu = page.getByRole('menu');
      await expect(menu).toHaveAttribute('data-placed', '');
      const popup = await menu.evaluate((el) => ({ inHeader: el.closest('[data-salmon-surface]') !== null, bg: getComputedStyle(el).backgroundColor }));
      expect(popup.inHeader).toBe(false);
      expect(popup.bg).not.toBe(TEAL);
      await expectClean(page, `surface ${dir}, column menu open`);
      await page.keyboard.press('Escape');

      // So does the filter menu.
      await cell.hover();
      await cell.locator('.salmon-data-grid-filter-button').click();
      const filter = page.locator('[data-salmon-popover]');
      await expect(filter).toHaveAttribute('data-placed', '');
      const filterPopup = await filter.evaluate((el) => ({ inHeader: el.closest('[data-salmon-surface]') !== null, bg: getComputedStyle(el).backgroundColor }));
      expect(filterPopup.inHeader).toBe(false);
      expect(filterPopup.bg).not.toBe(TEAL);
      await page.keyboard.press('Escape');
      expect(problems).toEqual([]);
    });
  }

  test('without a tableHeader surface the header keeps the theme header color', async ({ page }) => {
    await openGrid(page, PAGE);
    const plain = await headerColors(page);
    await openGrid(page, `${PAGE}?density=compact`);
    const compact = await headerColors(page);
    expect(plain.headerBg).not.toBe(TEAL);
    expect(compact.headerBg).toBe(plain.headerBg);
    expect(compact.cellBg).toBe(plain.cellBg);
    expect(compact.sortIndicatorColor).toBe(plain.sortIndicatorColor);
    expect(plain.text).toBeGreaterThanOrEqual(4.5);
  });
});
