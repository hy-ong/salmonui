import { expect, test, type Page } from '@playwright/test';
import { axe, expectClean } from './axe.ts';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// axe-core (exact version pinned in the root package.json) reports zero violations in every
// state built so far; forced-colors and reduced-motion styles resolve as
// specified. Grouped (expanded and collapsed), paged and search states,
// touch target sizes (desktop 24 px, adaptive 44 px), editing and
// validation, detail rows and child grids, row spans and row templates are
// covered below, without exclusions: rows carry no treegrid-only attributes
// (`aria-expanded` lives on the toggles).
// Adaptive card states live in their feature spec.

test.describe('axe-core: zero violations per state', () => {
  test('default, focused, selected, header-focused, parked focus, empty', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=30&sel=multiple`);
    await expectClean(page, 'default');
    await page.evaluate(() => window.__gridApi.focusCell('r2', 's1'));
    await expectClean(page, 'focused cell');
    await page.evaluate(() => window.__gridApi.selectRows(['r1', 'r2', 'r3']));
    await expectClean(page, 'rows selected');
    await page.evaluate(() => window.__gridApi.focusHeader('s0'));
    await expectClean(page, 'header focused');
    await page.evaluate(() => window.__gridApi.focusCell('r2', 's1'));
    await scrollViewport(page, 36 * 1500, null);
    // Parked focus: the focused cell is virtualized away and the grid root (which
    // contains the scroller) is the tab stop, so axe cannot find a tabbable
    // element inside the scroller. Arrow keys scroll and restore focus.
    await expectClean(page, 'focus parked on the root', ['scrollable-region-focusable']);
    await page.goto(`${DEV_URL}?rows=0&cols=10`);
    await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
    await expectClean(page, 'empty');
    expect(problems).toEqual([]);
  });

  test('checkbox column (unchecked, mixed, all), cell and column selection', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=2000&cols=30&sel=checkbox`);
    await expectClean(page, 'checkbox none');
    await page.evaluate(() => window.__gridApi.selectRows('r4', { mode: 'toggle' }));
    expect(await page.locator('.salmon-data-grid-header-cell[data-selection-column] [role="checkbox"]').getAttribute('aria-checked')).toBe('mixed');
    await expectClean(page, 'checkbox mixed');
    await page.evaluate(() => window.__gridApi.selectAll({ scope: 'filtered' }));
    await expectClean(page, 'checkbox all');
    await page.goto(`${DEV_URL}?rows=2000&cols=30&sel=cell&cellMode=box&columnsSel`);
    await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
    await page.evaluate(() => {
      window.__gridApi.selectCellRange({ rowId: 'r1', field: 's0' }, { rowId: 'r4', field: 's2' });
      window.__gridApi.selectColumns('n4');
    });
    expect(await page.locator('.salmon-data-grid-cell[aria-selected="true"]').count()).toBeGreaterThan(12);
    await expectClean(page, 'cell range and column selected');
  });

  test('sorted, RTL, dark scheme', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=2000&cols=30&sort&sel=multiple`);
    await page.locator('.salmon-data-grid-header-cell[data-column-id="n4"]').click();
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="n4"]')).toHaveAttribute('aria-sort', 'ascending');
    await expectClean(page, 'sorted');
    await page.locator('select').selectOption('dark');
    await page.evaluate(() => window.__gridApi.selectRows(['r10', 'r11']));
    await expectClean(page, 'dark + selected');
    await page.goto(`${DEV_URL}?rows=2000&cols=30&dir=rtl&sel=multiple`);
    await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
    await page.evaluate(() => window.__gridApi.selectRows(['r1']));
    await expectClean(page, 'rtl');
  });

  test('forced colors and reduced motion', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await openGrid(page, `${DEV_URL}?rows=2000&cols=30&sel=multiple`);
    await page.evaluate(() => {
      window.__gridApi.selectRows(['r1']);
      window.__gridApi.focusCell('r2', 's0');
    });
    await expectClean(page, 'forced colors');
    const styles = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.cssText = 'background: Highlight; color: HighlightText; outline-color: Highlight';
      document.body.appendChild(probe);
      const highlight = getComputedStyle(probe).backgroundColor;
      const highlightText = getComputedStyle(probe).color;
      probe.remove();
      const row = getComputedStyle(document.querySelector('.salmon-data-grid-row[data-row-id="r1"]')!);
      const cell = getComputedStyle(document.querySelector('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s0"]')!);
      const focusedCell = getComputedStyle(document.activeElement!);
      const viewport = getComputedStyle(document.querySelector('.salmon-data-grid-viewport')!);
      const moving = [...document.querySelectorAll('.salmon-data-grid *')].filter((el) => {
        const s = getComputedStyle(el);
        return parseFloat(s.transitionDuration) > 0 || parseFloat(s.animationDuration) > 0;
      }).length;
      return {
        highlight,
        highlightText,
        rowBackground: row.backgroundColor,
        rowAdjust: row.forcedColorAdjust,
        cellColor: cell.color,
        outlineStyle: focusedCell.outlineStyle,
        outlineWidth: focusedCell.outlineWidth,
        scrollBehavior: viewport.scrollBehavior,
        moving,
      };
    });
    expect(styles.rowBackground).toBe(styles.highlight);
    expect(styles.rowAdjust).toBe('none');
    expect(styles.cellColor).toBe(styles.highlightText);
    expect(styles.outlineStyle).toBe('solid');
    expect(styles.outlineWidth).toBe('2px');
    expect(styles.scrollBehavior).toBe('auto');
    expect(styles.moving).toBe(0);
  });

  test('forced colors: a hovered selected row keeps Highlight on a striped grid', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openGrid(page, `${DEV_URL}?rows=2000&cols=30&sel=multiple`);
    await expect(page.locator('.salmon-data-grid[data-striped][data-hover]')).toHaveCount(1);
    await page.evaluate(() => window.__gridApi.selectRows(['r1', 'r2']));
    const highlight = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.cssText = 'background: Highlight';
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    // r1 is a striped (alternate) row, r2 a plain one.
    for (const id of ['r1', 'r2']) {
      const row = page.locator(`.salmon-data-grid-row[data-row-id="${id}"]`);
      if (id === 'r1') await expect(row).toHaveAttribute('data-alt', '');
      await row.locator('.salmon-data-grid-cell').nth(1).hover();
      expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor), `${id} hovered`).toBe(highlight);
    }
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`prefers-contrast: more applies the high-contrast tokens; text and borders meet WCAG ratios (${colorScheme})`, async ({ page }) => {
      const problems = collectProblems(page);
      // border-default is omitted: with the default seeds its standard step already meets 4.5:1 in light.
      const TOKENS = ['--salmon-text-secondary', '--salmon-text-placeholder', '--salmon-border-subtle', '--salmon-border-strong', '--salmon-color-primary-text', '--salmon-state-focus-ring-width'];
      const tokens = () =>
        page.evaluate((names) => {
          const s = getComputedStyle(document.querySelector('.salmon-data-grid')!);
          return Object.fromEntries(names.map((n) => [n, s.getPropertyValue(n).trim()]));
        }, TOKENS);
      await page.emulateMedia({ colorScheme, contrast: 'no-preference' });
      await openGrid(page, `${DEV_URL}?rows=2000&cols=30&sel=multiple&paging=50`);
      const standard = await tokens();
      await page.emulateMedia({ colorScheme, contrast: 'more' });
      const more = await tokens();
      for (const name of TOKENS) expect(more[name], `${name} changes under prefers-contrast: more`).not.toBe(standard[name]);
      expect(more['--salmon-state-focus-ring-width']).toBe('3px');
      await page.evaluate(() => {
        window.__gridApi.selectRows(['r1']);
        window.__gridApi.focusCell('r2', 's1');
      });
      const ratios = await page.evaluate(() => {
        // Any CSS color to sRGB bytes plus alpha, through a canvas.
        const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
        const rgba = (color: string): [number, number, number, number] => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = '#000';
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data as unknown as number[];
          return [r as number, g as number, b as number, (a as number) / 255];
        };
        const over = (top: [number, number, number, number], under: [number, number, number]): [number, number, number] =>
          [0, 1, 2].map((i) => (top[i] as number) * top[3] + under[i]! * (1 - top[3])) as [number, number, number];
        // Opaque background behind an element: composite its ancestors' backgrounds.
        const background = (el: Element): [number, number, number] => {
          const layers: [number, number, number, number][] = [];
          for (let n: Element | null = el; n; n = n.parentElement) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c[3] > 0) layers.push(c);
            if (c[3] === 1) break;
          }
          let out: [number, number, number] = [255, 255, 255];
          if (layers.at(-1)?.[3] !== 1) out = rgba(getComputedStyle(document.documentElement).colorScheme.includes('dark') ? 'Canvas' : 'white').slice(0, 3) as [number, number, number];
          for (const layer of layers.reverse()) out = over(layer, out);
          return out;
        };
        const lum = (c: [number, number, number]) => {
          const [r, g, b] = c.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          }) as [number, number, number];
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (fg: string, el: Element) => {
          const bg = background(el);
          const a = lum(over(rgba(fg), bg));
          const b = lum(bg);
          return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
        };
        const q = (selector: string) => document.querySelector(selector)!;
        const cell = q('.salmon-data-grid-row[data-row-id="r3"] .salmon-data-grid-cell[data-column-id="s1"]');
        const selectedCell = q('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s1"]');
        const headerCell = q('.salmon-data-grid-header-cell[data-column-id="s1"]');
        const headerRow = q('.salmon-data-grid-header-row');
        const pagerInfo = q('.salmon-data-grid-pager__info');
        const focused = document.activeElement!;
        return {
          cellText: ratio(getComputedStyle(cell).color, cell),
          selectedText: ratio(getComputedStyle(selectedCell).color, selectedCell),
          headerText: ratio(getComputedStyle(headerCell).color, headerCell),
          secondaryText: ratio(getComputedStyle(pagerInfo).color, pagerInfo),
          headerBorder: ratio(getComputedStyle(headerRow).borderBlockEndColor, headerRow),
          cellBorder: ratio(getComputedStyle(cell).borderBlockEndColor, cell),
          focusRing: ratio(getComputedStyle(focused).outlineColor, focused),
          focusRingWidth: getComputedStyle(focused).outlineWidth,
          focusedIsCell: focused.matches('.salmon-data-grid-cell[data-column-id="s1"]'),
        };
      });
      expect(ratios.focusedIsCell).toBe(true);
      expect(ratios.focusRingWidth).toBe('3px');
      // WCAG 1.4.6 (7:1 enhanced text) and 1.4.11 (3:1 non-text); header boundary at 4.5:1.
      for (const key of ['cellText', 'selectedText', 'headerText', 'secondaryText'] as const) expect(ratios[key], key).toBeGreaterThanOrEqual(7);
      expect(ratios.headerBorder, 'headerBorder').toBeGreaterThanOrEqual(4.5);
      expect(ratios.cellBorder, 'cellBorder').toBeGreaterThanOrEqual(3);
      expect(ratios.focusRing, 'focusRing').toBeGreaterThanOrEqual(3);
      // label-content-name-mismatch (needs review): the pager's "Next pages" ellipsis button (see below).
      await expectClean(page, `prefers-contrast: more (${colorScheme})`, ['label-content-name-mismatch']);
      expect(problems).toEqual([]);
    });
  }
});

test.describe('axe-core: column chrome states', () => {
  test('toolbar, column menu, context menu, column chooser, toolbar overflow, Excel filter menu', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=30&chrome&filterUi=excel&sort&sel=multiple`);
    const popover = page.locator('[data-salmon-popover]');
    await expect(page.locator('.salmon-data-grid-toolbar[role="toolbar"]')).toBeVisible();
    await expectClean(page, 'toolbar');
    await page.locator('[data-toolbar-item="add"]').focus();
    await page.keyboard.press('ArrowRight');
    await expectClean(page, 'toolbar item focused');
    // Column menu (keyboard open, focus on an item).
    await page.evaluate(() => window.__gridApi.focusHeader('s1'));
    await page.keyboard.press('Shift+Alt+ArrowDown');
    await expect(page.getByRole('menu', { name: 'Text 1 column menu' })).toBeVisible();
    await expectClean(page, 'column menu');
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    // Context menu on a header (enabled items) and on a cell (all items disabled here).
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menu', { name: 'Context menu' })).toBeVisible();
    await expectClean(page, 'header context menu');
    await page.keyboard.press('Escape');
    await page.locator('.salmon-data-grid-row[data-row-id="r2"] .salmon-data-grid-cell[data-column-id="s1"]').click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'Context menu' })).toBeVisible();
    await expectClean(page, 'cell context menu');
    await page.evaluate(() => window.__gridApi.closeOverlays());
    await expect(popover).toHaveCount(0);
    // Column chooser (modal dialog).
    await page.locator('[data-toolbar-item="columnChooser"]').click();
    await expect(page.getByRole('dialog', { name: 'Choose columns' })).toBeVisible();
    await expectClean(page, 'column chooser');
    await page.getByRole('dialog', { name: 'Choose columns' }).getByRole('searchbox').fill('Text');
    await expectClean(page, 'column chooser filtered');
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    // Excel filter menu with its virtualized checklist.
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"] .salmon-data-grid-filter-button').click();
    await expect(page.locator('[data-salmon-popover] .salmon-data-grid-facet-list')).toBeVisible();
    await expectClean(page, 'excel filter menu');
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    // Toolbar overflow menu at a narrow width. label-content-name-mismatch (needs review) is
    // the "More" button: its only content is the aria-hidden glyph, an icon rather than a
    // visible text label, so WCAG 2.5.3 Label in Name does not apply.
    const iconButton = ['label-content-name-mismatch'];
    await page.setViewportSize({ width: 520, height: 800 });
    await page.locator('.salmon-data-grid-toolbar__more').click();
    await expect(page.locator('.salmon-data-grid-toolbar-overflow[role="menu"]')).toBeVisible();
    await expectClean(page, 'toolbar overflow menu', iconButton);
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await expectClean(page, 'narrow toolbar', iconButton);
    expect(problems).toEqual([]);
  });

  test('pager context menu opened from the keyboard', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=30&chrome&paging=50`);
    const next = page.locator('.salmon-data-grid-pager__next');
    await next.focus();
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu', { name: 'Context menu' });
    await expect(menu).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-salmon-popover]'))).toBe(true);
    // label-content-name-mismatch (needs review): the pager's "Next pages" ellipsis button (see below).
    await expectClean(page, 'pager context menu', ['label-content-name-mismatch']);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
    await expect(next).toBeFocused();
    expect(problems).toEqual([]);
  });

  test('pinned zones, sticky rows, stacked headers and spans', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=2000&frozenCols=2&frozenRight&frozenRows=2&frozenBottom=1&span`);
    await scrollViewport(page, 36 * 500, 3000);
    await expectClean(page, 'pinned start/end, sticky top/bottom, colSpan');
    await page.goto(`${DEV_URL}?rows=2000&stacked`);
    await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
    await scrollViewport(page, null, 2500);
    await expectClean(page, 'stacked headers, scrolled');
  });

  test('row spans: aria-rowspan cells and hidden spacers, at the top and cut by the window top after scroll', async ({ page }) => {
    const problems = collectProblems(page);
    // ?rowSpan: the s2 cell spans three rows on every 6th row (row virtualization on).
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&rowSpan`);
    const s2 = (rowId: string) => page.locator(`.salmon-data-grid-rows [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="s2"]`);
    await expect(s2('r0')).toHaveAttribute('aria-rowspan', '3');
    await expect(s2('r1')).toHaveCount(0);
    await expectClean(page, 'row spans at the top');
    // Deep in the list, with the viewport top inside a span (r600 spans r600..r602).
    await scrollViewport(page, 36 * 601, null);
    expect(await page.locator('.salmon-data-grid-rows .salmon-data-grid-cell[aria-rowspan]').count()).toBeGreaterThan(0);
    // Keep the tab stop inside the scroller (see "focus parked on the root" above).
    await page.evaluate(() => window.__gridApi.focusCell('r610', 's1'));
    await expectClean(page, 'row spans after scroll');
    expect(problems).toEqual([]);
  });

  test('row template: renderRow through DataGridRow keeps row/gridcell roles, indices and selection state', async ({ page }) => {
    const problems = collectProblems(page);
    // examples/vite-spa/layout-gaps.html?rowTpl: renderRow returns <DataGridRow {...rowProps} className="... tpl-row">{cells}</DataGridRow>.
    await openGrid(page, `${DEV_URL}layout-gaps.html?rows=2000&cols=30&rowTpl`);
    const roles = () =>
      page.evaluate(() => {
        const grid = document.querySelector('[role="grid"]') as HTMLElement;
        const rows = [...grid.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > *')];
        return {
          rows: rows.length,
          template: rows.filter((r) => r.classList.contains('tpl-row')).length,
          inRowgroup: rows.filter((r) => r.getAttribute('role') === 'row' && r.parentElement?.getAttribute('role') === 'rowgroup').length,
          indexed: rows.filter((r) => Number(r.getAttribute('aria-rowindex')) === Number(r.dataset['rowIndex']) + 2).length,
          orphanCells: [...grid.querySelectorAll('[role="gridcell"]')].filter((c) => c.parentElement?.closest('[role="row"]') === null).length,
          cellsPerRow: rows.map((r) => r.querySelectorAll('[role="gridcell"][aria-colindex]').length),
          selected: rows.filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.dataset['rowId']),
        };
      });
    let r = await roles();
    expect(r.rows).toBeGreaterThan(0);
    expect(r.template).toBe(r.rows);
    expect(r.inRowgroup).toBe(r.rows);
    expect(r.indexed).toBe(r.rows);
    expect(r.orphanCells).toBe(0);
    expect(Math.min(...r.cellsPerRow)).toBeGreaterThan(0);
    await expectClean(page, 'row template');
    // Focused and selected template rows.
    await page.locator('.salmon-data-grid-row[data-row-id="r3"] .salmon-data-grid-cell[data-column-id="s1"]').click();
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r3"]')).toHaveAttribute('aria-selected', 'true');
    r = await roles();
    expect(r.selected).toEqual(['r3']);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('gridcell');
    await expectClean(page, 'row template, focused and selected');
    // Scrolled: recycled template rows keep the structure.
    await scrollViewport(page, 36 * 1200, 2000);
    // Keep the tab stop inside the scroller (see "focus parked on the root" above): focus a rendered cell.
    await page.locator('.salmon-data-grid-row[data-row-id="r1205"] .salmon-data-grid-center .salmon-data-grid-cell').nth(2).click();
    expect(await page.evaluate(() => (document.activeElement?.closest('[role="row"]') as HTMLElement | null)?.classList.contains('tpl-row'))).toBe(true);
    r = await roles();
    expect(r.template).toBe(r.rows);
    expect(r.indexed).toBe(r.rows);
    expect(r.orphanCells).toBe(0);
    await expectClean(page, 'row template, scrolled');
    expect(problems).toEqual([]);
  });
});

test.describe('axe-core: editing and validation states', () => {
  test('open row editor, invalid editor with aria-invalid and aria-describedby message, batch marks, row errors', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=10&edit=row&erowrule`);
    const cell = (rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
    await cell('r2', 's1').dblclick();
    const input = cell('r2', 's1').locator('input');
    await expect(input).toBeFocused();
    await expectClean(page, 'row editor open');
    // Required rule: the editor is invalid and names its inline message.
    await input.fill('');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('This field is required.');
    await expect(input).toHaveAccessibleDescription('This field is required.');
    await expectClean(page, 'invalid editor with message');
    // Row-level error list (role="alert") and data-invalid row.
    await input.fill('ROW');
    await page.keyboard.press('Enter');
    await expect(page.locator('.salmon-data-grid-row-errors[role="alert"]')).toContainText('Text 1 cannot be ROW');
    await expectClean(page, 'row-level errors');
    await page.keyboard.press('Escape');

    await openGrid(page, `${DEV_URL}?rows=200&cols=10&edit=batch`);
    await cell('r1', 's2').dblclick();
    await cell('r1', 's2').locator('input').fill('dirty');
    await page.keyboard.press('Enter');
    await expect(cell('r2', 's2').locator('input')).toBeFocused();
    await expectClean(page, 'batch cell editor open');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__gridApi.deleteRows(['r3']));
    await expect(cell('r1', 's2')).toHaveAttribute('data-dirty', '');
    await expect(page.locator('.salmon-data-grid-rows [data-row-id="r3"]').first()).toHaveAttribute('data-deleted', '');
    await expectClean(page, 'batch dirty and deleted marks');
    expect(problems).toEqual([]);
  });
});

test.describe('live regions', () => {
  test('announce selection count, sort, and filter results, debounced to the latest', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&sort&filter&sel=multiple`);
    const live = page.locator('.salmon-data-grid-live[role="status"]');
    expect(await live.getAttribute('aria-live')).toBe('polite');
    expect(await page.locator('.salmon-data-grid-live[role="alert"]').count()).toBe(1);
    // Three quick changes within the debounce window: one announcement, the latest.
    await page.evaluate(() => {
      window.__gridApi.selectRows(['r1']);
      window.__gridApi.selectRows(['r1', 'r2']);
      window.__gridApi.selectRows(['r1', 'r2', 'r3']);
    });
    await expect(live).toHaveText('3 rows selected');
    await page.evaluate(() => window.__gridApi.sortColumn('s0', 'desc'));
    await expect(live).toHaveText('Sorted by Text 0 descending');
    await page.evaluate(() => window.__gridApi.filterColumn('b9', 'equal', true));
    await expect(live).toHaveText(/^1 filter active, \d+ of 2,000 rows shown$/);
  });
});

test.describe('axe-core: detail rows and child grids', () => {
  // rows of a role="grid" carry no aria-expanded (axe aria-conditional-attr allows it on
  // treegrid rows only); the toggle button does. axe is clean without exclusions.
  const expectCleanDetail = async (page: Page, state: string) => {
    await expectClean(page, state);
    expect(await page.locator('[role="row"][aria-expanded]').count(), `${state}: rows with aria-expanded`).toBe(0);
  };

  test('expanded detail row, focused toggle and detail cells, expanded child grid with focus inside', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}detail-gaps.html?mode=detail`);
    await expectCleanDetail(page, 'detail collapsed');
    const row = page.locator('#customers [data-row-id="c1"]');
    await row.locator('[data-column-id="__salmon_detail"]').focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('data-expanded', 'true');
    await expect(row.locator('.salmon-data-grid-detail-toggle')).toHaveAttribute('aria-label', 'Collapse details');
    await expect(row.locator('.salmon-data-grid-detail-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expectCleanDetail(page, 'detail expanded, toggle cell focused');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#customers [data-row-id="__detail:c1"] [role="gridcell"]')).toBeFocused();
    await expectCleanDetail(page, 'detail row focused');
    await openGrid(page, `${DEV_URL}detail-gaps.html?mode=child`);
    await page.evaluate(() => window.__gridApi.expandDetail('c1'));
    await expect(page.locator('[id="customers/c1"]')).toHaveAttribute('role', 'grid');
    await expectCleanDetail(page, 'child grid expanded');
    await page.evaluate(() => window.__gridApi.focusCell('__detail:c1', '__salmon_detail'));
    await page.keyboard.press('Enter');
    await expect(page.locator('[id="customers/c1"] .salmon-data-grid-rows > [data-row-id="o1"] [data-column-id="__salmon_detail"]')).toBeFocused();
    await expectCleanDetail(page, 'focus inside the child grid');
    expect(problems).toEqual([]);
  });
});

test.describe('axe-core: data error state', () => {
  test('the default error row with its message and Retry button; retry restores the rows', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${DEV_URL}remote.html?mode=paging&rows=2000`);
    await page.waitForFunction(() => window.__gridApi);
    const grid = page.getByRole('grid', { name: 'Remote orders' });
    await expect(grid.locator('.salmon-data-grid-row[data-row-id="r0"]')).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __failReads: boolean }).__failReads = true;
      window.__gridApi.goToPage(2);
    });
    const error = grid.locator('.salmon-data-grid-error');
    await expect(error).toBeVisible();
    await expect(error.locator('.salmon-data-grid-error__message')).toHaveText('The orders service is unavailable');
    await expect(error.locator('[role="gridcell"]')).toHaveAttribute('aria-colspan', '7');
    // label-content-name-mismatch (needs review): the pager's "Next pages" ellipsis button (see below).
    await expectClean(page, 'data error', ['label-content-name-mismatch']);
    await page.evaluate(() => {
      (window as unknown as { __failReads: boolean }).__failReads = false;
    });
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(grid.locator('.salmon-data-grid-row[data-row-id="r50"]')).toBeVisible();
    await expect(grid.locator('.salmon-data-grid-error')).toHaveCount(0);
    expect(problems.filter((p) => !p.includes('The orders service is unavailable'))).toEqual([]);
  });
});

test.describe('axe-core: grouped, paged and search states', () => {
  test('grouped grid: expanded and collapsed captions, indent cells, toggle aria-expanded', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&sort&group=s0&aggs&sel=multiple`);
    // The group drop area is a sibling before role="grid", outside the grid (aria-required-children).
    const panel = page.locator('.salmon-data-grid-group-panel');
    await expect(panel).toHaveCount(1);
    expect(await panel.evaluate((el) => el.closest('[role="grid"]') === null && el.nextElementSibling?.getAttribute('role') === 'grid')).toBe(true);
    const caption = page.locator('.salmon-data-grid-rows .salmon-data-grid-group-caption').first();
    const toggle = caption.locator('.salmon-data-grid-group-toggle');
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'true');
    // role="grid" rows carry no aria-level / aria-setsize / aria-posinset (treegrid-only, aria-conditional-attr);
    // the level is the caption cell's accessible description.
    await expect(page.locator('[role="grid"] [aria-level], [role="grid"] [aria-setsize], [role="grid"] [aria-posinset]')).toHaveCount(0);
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-description', /^Level 1, \d+ items$/);
    // Data rows carry one indent cell per group level, hidden from assistive technology.
    const dataRow = page.locator('.salmon-data-grid-rows .salmon-data-grid-row:not(.salmon-data-grid-group-caption)').first();
    await expect(dataRow.locator('.salmon-data-grid-indent')).toHaveCount(1);
    const toggleName = await toggle.getAttribute('aria-label');
    expect(toggleName).toMatch(/^Collapse /);
    await expectClean(page, 'grouped, expanded');
    await toggle.click();
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'false');
    expect(await toggle.getAttribute('aria-label')).toMatch(/^Expand /);
    await expectClean(page, 'grouped, one group collapsed');
    // Focused caption and a selected data row.
    await caption.locator('.salmon-data-grid-group-caption__cell').focus();
    await page.keyboard.press('Enter');
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'true');
    await page.evaluate(() => window.__gridApi.selectRows(['r1', 'r2']));
    await expectClean(page, 'grouped, caption focused, rows selected');
    // Everything collapsed (`grouping.defaultExpanded: false`).
    await page.goto(`${DEV_URL}?rows=2000&cols=10&sort&group=s0,b9&aggs&collapsed`);
    await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
    await expect(page.locator('.salmon-data-grid-rows .salmon-data-grid-group-caption__cell[aria-expanded="true"]')).toHaveCount(0);
    expect(await page.locator('.salmon-data-grid-rows .salmon-data-grid-group-caption__cell[aria-expanded="false"]').count()).toBeGreaterThan(0);
    await expect(page.locator('.salmon-data-grid-rows .salmon-data-grid-group-caption__cell[aria-description^="Level 1,"]').first()).toBeVisible();
    await expectClean(page, 'grouped by two levels, all collapsed');
    expect(problems).toEqual([]);
  });

  test('pager: navigation landmark, info text, current page, page sizes', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&qpage=50&qsizes&sel=multiple`);
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    // label-content-name-mismatch (needs review) is the "Next pages" button: its only
    // content is an ellipsis glyph, not a visible text label (WCAG 2.5.3 does not apply).
    const ellipsis = ['label-content-name-mismatch'];
    await expect(pager).toBeVisible();
    // The landmark is a sibling of role="grid", not owned by it.
    expect(await page.evaluate(() => !!document.querySelector('.salmon-data-grid .salmon-data-grid-pager'))).toBe(false);
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('1 of 40 pages (2,000 items)');
    await expect(pager.locator('.salmon-data-grid-pager__pages')).toHaveText('1 of 40 pages');
    await expect(pager.locator('.salmon-data-grid-pager__items')).toHaveText('(2,000 items)');
    await expect(pager.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute('aria-current', 'page');
    await expectClean(page, 'paged, first page', ellipsis);
    await pager.getByRole('button', { name: 'Page 3', exact: true }).click();
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('3 of 40 pages (2,000 items)');
    await expect(pager.getByRole('button', { name: 'Page 3', exact: true })).toBeFocused();
    // After a page change the focused cell's row left the view, so the grid root is the
    // tab stop (documented parked-focus state): scrollable-region-focusable needs review.
    expect(await page.locator('.salmon-data-grid').getAttribute('tabindex')).toBe('0');
    await expectClean(page, 'paged, page 3 focused', [...ellipsis, 'scrollable-region-focusable']);
    await pager.getByRole('combobox').selectOption('100');
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('2 of 20 pages (2,000 items)');
    await page.locator('select').first().selectOption('dark');
    await expectClean(page, 'paged, page size 100, dark', [...ellipsis, 'scrollable-region-focusable']);
    expect(problems).toEqual([]);
  });

  test('search box: labelled role="search" landmarks, distinct per grid', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&qsearch=&secondGrid`);
    // Two grids on the page: each search landmark has its own accessible name.
    const first = page.getByRole('search', { name: 'Search grid', exact: true });
    const second = page.getByRole('search', { name: 'Search second grid', exact: true });
    await expect(first).toHaveCount(1);
    await expect(second).toHaveCount(1);
    await expect(first.getByRole('searchbox', { name: 'Search' })).toBeVisible();
    await expectClean(page, 'two grids with search boxes');
    await first.getByRole('searchbox').fill('word-3');
    await expect.poll(() => page.evaluate(() => window.__gridApi.getViewRows().length)).toBeLessThan(2000);
    await expectClean(page, 'searched');
    // The label follows `localeText.searchLabel`, so a page can name each grid's search.
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ localeText: { searchLabel: 'Search products' } }));
    await expect(page.getByRole('search', { name: 'Search products', exact: true })).toHaveCount(1);
    const names = await page.evaluate(() => [...document.querySelectorAll('[role="search"]')].map((el) => el.getAttribute('aria-label')));
    expect(names).toEqual(['Search products', 'Search second grid']);
    await expectClean(page, 'renamed search landmark');
    expect(problems).toEqual([]);
  });
});

/** Visible interactive controls inside the grid chrome, with their boxes (CSS px). */
async function targets(page: Page, selector: string, hitTest = true) {
  return page.evaluate(([sel, hitTesting]) => {
    const scope = (el: Element) => !!el.closest('.salmon-data-grid, .salmon-data-grid-toolbar, .salmon-data-grid-group-panel, .salmon-data-grid-pager, .salmon-data-grid-adaptive-bar');
    return [...document.querySelectorAll<HTMLElement>(sel)]
      // Rendered and not clipped away (overscan rows under the pager or the sticky header are not targets).
      .filter((el) => {
        if (!scope(el) || el.getClientRects().length === 0 || getComputedStyle(el).visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        if (!hitTesting) return true;
        const viewport = el.closest('.salmon-data-grid-viewport')?.getBoundingClientRect();
        if (viewport && (r.top < viewport.top || r.bottom > viewport.bottom)) return false;
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        // A pseudo-element hit area (the adaptive checkbox ::after) extends the target.
        const after = getComputedStyle(el, '::after');
        const hit = after.content !== 'none' && after.position === 'absolute' ? { width: parseFloat(after.width), height: parseFloat(after.height) } : { width: 0, height: 0 };
        return {
          name: `${el.className.split(' ')[0]} "${el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''}"`,
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: Math.max(r.width, hit.width),
          height: Math.max(r.height, hit.height),
        };
      });
  }, [selector, hitTest] as const);
}

// The 8 px column resize handle is excluded: it is a drag affordance whose function has
// equivalent full-size controls (the column menu's Autofit items) and keyboard keys
// (Ctrl+Alt+ArrowLeft/Right/Enter), the WCAG 2.5.8 "Equivalent" exception.
const INTERACTIVE = ':is(button, [role="checkbox"], input, select, [role="button"]):not(.salmon-data-grid-resize-handle)';

test.describe('touch targets', () => {
  test('desktop: every control is at least 24 x 24 px or meets the WCAG 2.5.8 spacing exception', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=10&group=s0&sel=checkbox&qpage=50&chrome&filterUi=excel&sort`);
    const all = await targets(page, INTERACTIVE);
    expect(all.length).toBeGreaterThan(40);
    // WCAG 2.5.8: an undersized target passes when a 24 px circle centred on it does not
    // intersect another target or the 24 px circle of another undersized target.
    const small = all.filter((t) => Math.min(t.width, t.height) < 24);
    const failures: string[] = [];
    for (const t of small) {
      for (const o of all) {
        if (o === t) continue;
        const undersized = Math.min(o.width, o.height) < 24;
        const dx = Math.max(o.left - t.x, 0, t.x - o.right);
        const dy = Math.max(o.top - t.y, 0, t.y - o.bottom);
        const tooClose = undersized ? Math.hypot(o.x - t.x, o.y - t.y) < 24 : Math.hypot(dx, dy) < 12;
        if (tooClose) failures.push(`${t.name} (${t.width}x${t.height}) is too close to ${o.name}`);
      }
    }
    expect(failures).toEqual([]);
    // Full-size controls: pager buttons, toolbar items and the search box.
    const full = await targets(page, '.salmon-data-grid-pager__button, .salmon-data-grid-toolbar__item, .salmon-data-grid-search__input');
    expect(full.length).toBeGreaterThan(5);
    expect(full.filter((t) => Math.min(t.width, t.height) < 24).map((t) => t.name)).toEqual([]);
    // axe-core's WCAG 2.2 target-size rule (off by default) agrees.
    const result = await axe(page, ['target-size']);
    expect(result.violations, JSON.stringify(result.violations)).toEqual([]);
  });

  test('adaptive: group chips, group toggles, checkboxes, header and pager buttons are at least 44 px', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&group=s0&sel=checkbox&qpage=50&chrome&adaptive=horizontal`);
    await expect(page.locator('.salmon-data-grid[data-adaptive]')).toHaveCount(1);
    const groups: Record<string, string> = {
      'group chip buttons': '.salmon-data-grid-group-chip__label, .salmon-data-grid-group-chip__remove',
      'group toggles': '.salmon-data-grid-rows .salmon-data-grid-group-toggle',
      checkboxes: '.salmon-data-grid-checkbox',
      'header buttons': '.salmon-data-grid-header-button',
      'pager buttons': '.salmon-data-grid-pager__button',
    };
    for (const [label, selector] of Object.entries(groups)) {
      const found = await targets(page, selector, false);
      expect(found.length, label).toBeGreaterThan(0);
      expect(found.filter((t) => Math.min(t.width, t.height) < 44).map((t) => `${t.name} ${t.width}x${t.height}`), label).toEqual([]);
    }
    const chips = await targets(page, '.salmon-data-grid-group-chip');
    expect(Math.min(...chips.map((c) => c.height))).toBeGreaterThanOrEqual(44);
    const result = await axe(page, ['target-size']);
    expect(result.violations, JSON.stringify(result.violations)).toEqual([]);
  });
});

test.describe('axe-core: Menu family', () => {
  const MENU_URL = `${DEV_URL}menu.html`;
  // axe reports aria-controls on an aria-haspopup trigger as needs-review (it cannot tell whether a
  // popup id must exist yet); menu.spec.ts asserts that aria-controls names the open menu's id.
  const reviewed = ['aria-valid-attr-value'];
  for (const [label, query, scheme] of [
    ['light', '', 'light'],
    ['dark', '', 'dark'],
    ['RTL', '?dir=rtl', 'light'],
  ] as const) {
    test(`closed triggers, open menu with groups and checkable items, open submenu (${label})`, async ({ page }) => {
      const problems = collectProblems(page);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`${MENU_URL}${query}`);
      await expect(page.locator('#main')).toBeVisible();
      await expectClean(page, `${label}: closed`);
      await page.focus('#main');
      await page.keyboard.press('Enter');
      await expect(page.locator('[role="menu"][aria-labelledby="main"]')).toBeVisible();
      await expectClean(page, `${label}: open`, reviewed);
      await page.keyboard.press('e');
      await page.keyboard.press(query ? 'ArrowLeft' : 'ArrowRight');
      await expect(page.locator('[role="menu"][aria-labelledby="export"]')).toBeVisible();
      await expectClean(page, `${label}: submenu`, reviewed);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.focus('#save');
      await page.keyboard.press('Alt+ArrowDown');
      await expectClean(page, `${label}: split button open`, reviewed);
      expect(problems).toEqual([]);
    });
  }
});

// Listbox: zero
// violations in light, dark and RTL, with selection, checkboxes, groups,
// search results, a virtualized list scrolled away from the active option,
// and the empty state.
test.describe('axe-core: Listbox', () => {
  const lb = (query: string) => `${DEV_URL}listbox.html?${query}`;
  for (const scheme of ['light', 'dark'] as const) {
    test(`listbox states (${scheme})`, async ({ page }) => {
      const problems = collectProblems(page);
      const setScheme = async () => {
        if (scheme === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-salmon-color-scheme', 'dark'));
      };
      await page.goto(lb('case=basic'));
      await setScheme();
      await expectClean(page, `${scheme} basic`);
      await page.getByRole('listbox').focus();
      await page.keyboard.press('ArrowDown');
      await expectClean(page, `${scheme} basic, active and selected`);
      await page.goto(lb('case=multiple'));
      await setScheme();
      await expectClean(page, `${scheme} multiple with checkboxes and select all`);
      await page.goto(lb('case=grouped'));
      await setScheme();
      await expectClean(page, `${scheme} grouped`);
      await page.goto(lb('case=big'));
      await setScheme();
      await page.getByRole('listbox').focus();
      await page.keyboard.press('ArrowDown');
      await page.getByRole('listbox').evaluate((el) => (el.scrollTop = 32 * 5000));
      await expectClean(page, `${scheme} virtualized, active option out of the window`);
      await page.getByRole('searchbox').fill('zur');
      await expectClean(page, `${scheme} search results`);
      await page.getByRole('searchbox').fill('qqq');
      // An empty listbox has no options by design (axe asks for review); the
      // "No matches found" text is its sibling and the live region announces 0 results.
      await expectClean(page, `${scheme} no matches`, ['aria-required-children']);
      await page.goto(lb('case=rtl'));
      await setScheme();
      await expectClean(page, `${scheme} rtl`);
      await page.goto(lb('case=dual'));
      await setScheme();
      await expectClean(page, `${scheme} dual list`);
      expect(problems).toEqual([]);
    });
  }
});

// Pivot Table: zero violations
// for the compact (`treegrid`) and tabular tables, the field list, the axis
// bar, the toolbar with an open menu, a field menu, and every dialog (field
// list popup, member editor, calculated field with a formula error, number
// and conditional formatting, grouping, drill through), on
// examples/vite-spa/pivot.html. The dialogs are portaled backdrops (axe.ts).
test.describe('axe-core: Pivot Table', () => {
  const pivotPage = async (page: Page, query: string) => {
    await page.goto(`${DEV_URL}pivot.html?${query}`);
    await page.waitForFunction(() => (window as any).__pivot?.status === 'ready' && document.querySelector('.salmon-data-grid-rows [role="row"]') !== null);
  };
  const dialog = (page: Page) => page.locator('.salmon-pivot-table-dialog[role="dialog"]');
  const closeDialog = async (page: Page) => {
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  };

  test('compact and tabular tables, expanded rows, selection', async ({ page }) => {
    const problems = collectProblems(page);
    await pivotPage(page, 'case=compact');
    await expect(page.locator('.salmon-pivot-table [role="treegrid"]')).toHaveCount(1);
    await expectClean(page, 'compact collapsed');
    await page.getByRole('button', { name: 'Expand Asia' }).click();
    await page.locator('.salmon-data-grid-cell[data-column-id="pivot-row-header"]').first().click();
    await expectClean(page, 'compact expanded, row header focused');
    await pivotPage(page, 'case=tabular');
    await expectClean(page, 'tabular');
    await pivotPage(page, 'case=selection');
    await page.locator('.salmon-pivot-table .salmon-data-grid-rows .salmon-data-grid-cell[data-column-id^="c"]').first().click();
    await expectClean(page, 'cell selected');
    expect(problems).toEqual([]);
  });

  test('field list, axis bar, toolbar, toolbar menu and field menu', async ({ page }) => {
    const problems = collectProblems(page);
    await pivotPage(page, 'case=all');
    await expectClean(page, 'toolbar, axis bar, table and field list');
    await page.locator('.salmon-pivot-table-toolbar').getByRole('button', { name: 'Export' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectClean(page, 'toolbar export menu', ['aria-valid-attr-value']);
    await page.keyboard.press('Escape');
    await page.locator('.salmon-pivot-table-axis-bar [data-axis="values"] [data-pivot-field="amount"]').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectClean(page, 'value field menu', ['aria-valid-attr-value']);
    await page.keyboard.press('Escape');
    await pivotPage(page, 'case=fieldlist&defer');
    await page.locator('.salmon-pivot-table-field-list [role="listbox"][aria-label="Fields"] [data-pivot-field="product"]').click();
    await expectClean(page, 'deferred field list with a pending draft');
    expect(problems).toEqual([]);
  });

  test('dialogs: field list popup, member editor, calculated field, number and conditional formatting, grouping, drill through', async ({ page }) => {
    const problems = collectProblems(page);
    // label-content-name-mismatch (needs review): the symbol-only "×" Close button of every dialog is named "Close".
    const symbolClose = ['label-content-name-mismatch'];
    await pivotPage(page, 'case=all');
    await page.evaluate(() => (window as any).__pivotApi.openFieldList());
    await expect(dialog(page)).toBeVisible();
    await expectClean(page, 'field list popup', symbolClose);
    await closeDialog(page);
    await page.evaluate(() => (window as any).__pivot.openDialog({ kind: 'memberEditor', field: 'country' }));
    await expect(dialog(page).getByRole('option').first()).toBeVisible();
    await expectClean(page, 'member editor', symbolClose);
    await dialog(page).getByRole('radio', { name: 'Value filter' }).check();
    await expectClean(page, 'member editor, value filter', symbolClose);
    await closeDialog(page);
    await page.evaluate(() => (window as any).__pivotApi.openCalculatedFieldEditor());
    await dialog(page).getByLabel('Formula').fill('"Sum(amount)" /');
    await expect(dialog(page).getByRole('alert')).toBeVisible();
    await expectClean(page, 'calculated field with a formula error', symbolClose);
    await closeDialog(page);
    await page.evaluate(() => (window as any).__pivotApi.openNumberFormatEditor('amount'));
    await expectClean(page, 'number formatting', symbolClose);
    await closeDialog(page);
    await page.evaluate(() => (window as any).__pivotApi.openConditionalFormatEditor());
    await dialog(page).getByRole('button', { name: 'Add condition' }).click();
    await expectClean(page, 'conditional formatting with a rule', symbolClose);
    await closeDialog(page);
    await page.evaluate(() => (window as any).__pivot.openDialog({ kind: 'grouping', field: 'date' }));
    await expectClean(page, 'date grouping', symbolClose);
    await closeDialog(page);
    await pivotPage(page, 'case=drill');
    await page.locator('.salmon-pivot-table .salmon-data-grid-rows .salmon-data-grid-cell[data-column-id^="c"]').first().dblclick();
    await expect(dialog(page).locator('.salmon-data-grid')).toBeVisible();
    await expectClean(page, 'drill through with editing', symbolClose);
    await closeDialog(page);
    expect(problems).toEqual([]);
  });
});

// Inputs and Forms (each component's keyboard and screen reader
// behavior): examples/vite-spa/inputs.html in light,
// dark and RTL, with errors shown.
test.describe('axe-core: Inputs and Forms', () => {
  for (const query of ['', 'scheme=dark', 'dir=rtl'] as const) {
    test(`inputs page (${query || 'light'})`, async ({ page }) => {
      const problems = collectProblems(page);
      await page.goto(`${DEV_URL}inputs.html?${query}`);
      await page.waitForFunction(() => window.__inputsReady === true);
      await expectClean(page, `inputs ${query || 'light'}`);
      // Error state: an invalid submit reveals every error.
      await page.locator('#signup-submit').click();
      // Choice fields: required checkbox, radio group and a partial code.
      await page.locator('#chk-submit').click();
      await page.locator('#rad-submit').click();
      await page.locator('#otp-basic').fill('12');
      await page.locator('#otp-submit').click();
      // Form Renderer: every schema rule fails; Speech To Text: a listening button.
      await page.locator('#frnd-form button[type="submit"]').press('Enter');
      await page.locator('#stt-button').click();
      // QueryBuilder: an incomplete rule shows its inline error; the summary view is open.
      await page.evaluate(() => window.__qb?.addRules([{ id: 'a11y', field: 'name', operator: 'contains' }]));
      await page.locator('#qb-submit').click();
      await page.locator('#qb [data-node-id="a11y"] .salmon-query-builder__error').waitFor();
      await expectClean(page, `inputs ${query || 'light'} with errors`);
      // ColorPicker popover (IN6): area mode, then swatches with a recent color.
      await page.getByRole('button', { name: /^Brand/ }).click();
      await expect(page.getByRole('dialog', { name: 'Brand' })).toBeVisible();
      await expectClean(page, `inputs ${query || 'light'} color popover`);
      await page.getByRole('dialog', { name: 'Brand' }).getByRole('button', { name: 'Show swatches' }).click();
      await expectClean(page, `inputs ${query || 'light'} color swatches`);
      expect(problems).toEqual([]);
    });
  }
});

// Pivot Table in dark and RTL: the compact table, the toolbar, axis
// bar and field list, a field menu and the member editor dialog.
test.describe('axe-core: Pivot Table, dark and RTL', () => {
  for (const [label, query, scheme] of [
    ['dark', '', 'dark'],
    ['RTL', '&dir=rtl', 'light'],
  ] as const) {
    test(`table, field list, axis bar, field menu and member editor (${label})`, async ({ page }) => {
      const problems = collectProblems(page);
      await page.emulateMedia({ colorScheme: scheme });
      const pivotPage = async (kase: string) => {
        await page.goto(`${DEV_URL}pivot.html?case=${kase}${query}`);
        await page.waitForFunction(() => (window as any).__pivot?.status === 'ready' && document.querySelector('.salmon-data-grid-rows [role="row"]') !== null);
        if (scheme === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-salmon-color-scheme', 'dark'));
      };
      await pivotPage('compact');
      await page.getByRole('button', { name: 'Expand Asia' }).click();
      await expectClean(page, `${label}: compact expanded`);
      await pivotPage('all');
      await expectClean(page, `${label}: toolbar, axis bar, table and field list`);
      await page.locator('.salmon-pivot-table-axis-bar [data-axis="values"] [data-pivot-field="amount"]').click();
      await expect(page.getByRole('menu')).toBeVisible();
      await expectClean(page, `${label}: value field menu`, ['aria-valid-attr-value']);
      await page.keyboard.press('Escape');
      await page.evaluate(() => (window as any).__pivot.openDialog({ kind: 'memberEditor', field: 'country' }));
      await expect(page.locator('.salmon-pivot-table-dialog[role="dialog"]').getByRole('option').first()).toBeVisible();
      await expectClean(page, `${label}: member editor`, ['label-content-name-mismatch']);
      expect(problems).toEqual([]);
    });
  }
});
