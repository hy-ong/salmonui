import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, installDevtools, openGrid, scrollViewport, waitForGridReady } from './helpers.ts';

// Data Grid keyboard and accessibility: roving tabindex, the keyboard map (Windows
// variants; Chromium on macOS uses the Mac column through the same keymap),
// focus restoration across virtualization, selection keys, header keys, and
// live regions. Fixture: 100k x 100, row height 36, grid height 600.

/** `rowId:field` of the focused cell, `header:<field>`, `root`, or the tag name. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return 'none';
    if (el.classList.contains('salmon-data-grid')) return 'root';
    if (el.classList.contains('salmon-data-grid-header-cell')) return `header:${el.dataset['columnId']}`;
    if (el.classList.contains('salmon-data-grid-cell')) return `${(el.closest('[data-row-id]') as HTMLElement).dataset['rowId']}:${el.dataset['columnId']}`;
    return el.tagName.toLowerCase();
  });
}

const tabStops = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.salmon-data-grid[tabindex="0"], .salmon-data-grid [tabindex="0"]')].map((e) => (e as HTMLElement).className.split(' ')[0]));
const selectedRows = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.salmon-data-grid-row[aria-selected="true"]')].map((e) => (e as HTMLElement).dataset['rowId']));
const liveText = (page: Page) => page.evaluate(() => document.querySelector('.salmon-data-grid-live[role="status"]')?.textContent ?? '');
// The project emulates Desktop Chrome on Windows (userAgentData.platform), so the Windows column applies;
// the macOS column is covered by a test with a Mac user agent below.
const MOD = 'Control';

async function enterGrid(page: Page): Promise<void> {
  await page.locator('#grid-title').click(); // focus starts before the grid
  await page.keyboard.press('Tab'); // the theme select
  await page.keyboard.press('Tab'); // the grid's single tab stop
}

test.describe('roving tabindex and focus', () => {
  test('the grid is one tab stop; arrows, Home/End, Ctrl+Home/End, PageUp/PageDown', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, DEV_URL);
    expect(await tabStops(page)).toEqual(['salmon-data-grid-cell']);
    await enterGrid(page);
    expect(await focused(page)).toBe('r0:id');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('r1:s0');
    expect(await tabStops(page)).toEqual(['salmon-data-grid-cell']);
    await page.keyboard.press('End');
    expect(await focused(page)).toBe('r1:b99');
    await page.keyboard.press('Home');
    expect(await focused(page)).toBe('r1:id');
    // PageDown moves by the rows that fit the body (564 / 36 = 15).
    await page.keyboard.press('PageDown');
    expect(await focused(page)).toBe('r16:id');
    await page.keyboard.press('PageUp');
    expect(await focused(page)).toBe('r1:id');
    await page.keyboard.press(`${MOD}+End`);
    await expect.poll(() => focused(page)).toBe('r99999:b99');
    const range = await page.evaluate(() => window.__gridApi.getRenderedRange().rows);
    expect(range.end).toBe(100_000);
    await page.keyboard.press(`${MOD}+Home`);
    await expect.poll(() => focused(page)).toBe('r0:id');
    // ArrowUp from the first row enters the header; ArrowDown returns.
    await page.keyboard.press('ArrowUp');
    expect(await focused(page)).toBe('header:id');
    expect(await page.locator('.salmon-data-grid-header-cell[data-column-id="id"]').getAttribute('tabindex')).toBe('0');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('header:s0');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('r0:s0');
    // Tab leaves the grid; Shift+Tab comes back to the same cell.
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('button');
    await page.keyboard.press('Shift+Tab');
    expect(await focused(page)).toBe('r0:s0');
    expect(problems).toEqual([]);
  });

  test('focus parks on the root when the focused cell scrolls away and returns when it remounts', async ({ page }) => {
    await openGrid(page, DEV_URL);
    await page.evaluate(() => window.__gridApi.focusCell('r5', 's1'));
    expect(await focused(page)).toBe('r5:s1');
    await scrollViewport(page, 36 * 5000, null);
    expect(await focused(page)).toBe('root');
    expect(await page.locator('.salmon-data-grid').getAttribute('tabindex')).toBe('0');
    expect(await tabStops(page)).toEqual(['salmon-data-grid']);
    await scrollViewport(page, 0, null);
    expect(await focused(page)).toBe('r5:s1');
    expect(await page.locator('.salmon-data-grid').getAttribute('tabindex')).toBe('-1');
    // Scrolled away again: an arrow key continues from the logical position and scrolls it in.
    await scrollViewport(page, 36 * 5000, null);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focused(page)).toBe('r6:s1');
    expect(await page.evaluate(() => window.__gridApi.getFocusedCell())).toEqual({ rowId: 'r6', field: 's1', region: 'body' });
  });

  test('pointer clicks set logical focus; Alt+J focuses the root, Alt+W the content', async ({ page }) => {
    await openGrid(page, DEV_URL);
    await page.locator('.salmon-data-grid-row[data-row-id="r3"] .salmon-data-grid-cell[data-column-id="s2"]').click();
    expect(await focused(page)).toBe('r3:s2');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('r4:s2');
    await page.locator('#grid-title').click();
    await page.keyboard.press('Alt+KeyJ');
    expect(await focused(page)).toBe('root');
    await page.keyboard.press('Alt+KeyW');
    expect(await focused(page)).toBe('r4:s2');
  });

  test('Alt+W and api.focus() from the header move to the grid content: the last body cell, else the first', async ({ page }) => {
    await openGrid(page, DEV_URL);
    // Before any body focus: the first body cell.
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s2"]').focus();
    expect(await focused(page)).toBe('header:s2');
    await page.keyboard.press('Alt+KeyW');
    expect(await focused(page)).toBe('r0:id');
    // After a body cell held focus: that cell.
    await page.locator('.salmon-data-grid-row[data-row-id="r3"] .salmon-data-grid-cell[data-column-id="s1"]').click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await focused(page)).toBe('header:s1');
    await page.keyboard.press('Alt+KeyW');
    expect(await focused(page)).toBe('r0:s1');
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s3"]').focus();
    await page.evaluate(() => window.__gridApi.focus());
    expect(await focused(page)).toBe('r0:s1');
  });

  test('arrow key focus moves re-render at most 2 cells', async ({ page }) => {
    await installDevtools(page);
    await openGrid(page, `${DEV_URL}?sel=none`);
    await page.evaluate(() => window.__gridApi.focusCell('r2', 's0'));
    await page.waitForTimeout(50);
    for (const key of ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
      const start = await page.evaluate(() => window.__commits.length);
      await page.keyboard.press(key);
      const r = await page.evaluate((s) => {
        const commits = window.__commits.slice(s);
        return { commits: commits.length, cells: [...new Set(commits.flatMap((c) => c.cells))], rows: commits.flatMap((c) => c.rows), headers: commits.flatMap((c) => c.headers) };
      }, start);
      expect(r.cells.length, `${key}: ${r.cells.join(',')}`).toBeLessThanOrEqual(2);
      expect(r.rows).toEqual([]);
      expect(r.headers).toEqual([]);
    }
    // With row selection following focus, the two rows re-render for aria-selected; cells stay at 2.
    await page.goto(`${DEV_URL}?sel=single`);
    await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
    await page.evaluate(() => window.__gridApi.focusCell('r2', 's0'));
    await page.waitForTimeout(50);
    const start = await page.evaluate(() => window.__commits.length);
    await page.keyboard.press('ArrowDown');
    const r = await page.evaluate((s) => {
      const commits = window.__commits.slice(s);
      return { cells: [...new Set(commits.flatMap((c) => c.cells))], rows: [...new Set(commits.flatMap((c) => c.rows))].sort() };
    }, start);
    expect(r.cells.length).toBeLessThanOrEqual(2);
    expect(r.rows.length).toBeLessThanOrEqual(2);
    expect(await selectedRows(page)).toEqual(['r3']);
  });

  test('keys of features that are off are routed through the keymap and not consumed (F2, Insert without editing, Ctrl+C, Ctrl+ArrowUp); with editing F2 and Insert act', async ({ page }) => {
    await openGrid(page, DEV_URL);
    await page.evaluate(() => window.__gridApi.focusCell('r1', 's0'));
    const prevented = await page.evaluate(() => {
      const out: Record<string, boolean> = {};
      const el = document.activeElement as HTMLElement;
      for (const [key, init] of [['F2', {}], ['Insert', {}], ['c', { ctrlKey: true }], ['ArrowUp', { ctrlKey: true }]] as const) {
        const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
        el.dispatchEvent(ev);
        out[key] = ev.defaultPrevented;
      }
      return out;
    });
    // No `editing` prop: F2 and Insert are left to the page. Ctrl+P belongs
    // to print (tests/browser/output.spec.ts).
    expect(prevented).toEqual({ F2: false, Insert: false, c: false, ArrowUp: false });
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    // Any feature registers a handler by command name.
    const handled = await page.evaluate(() => {
      let hits = 0;
      const off = window.__gridApi.registerKeyHandler('edit.begin', () => {
        hits++;
        return true;
      });
      const ev = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
      document.activeElement!.dispatchEvent(ev);
      off();
      return { hits, prevented: ev.defaultPrevented };
    });
    expect(handled).toEqual({ hits: 1, prevented: true });

    // With editing on, F2 opens the editor and Insert adds a row; both consume the key.
    await openGrid(page, `${DEV_URL}?rows=200&cols=10&edit=row`);
    await page.evaluate(() => window.__gridApi.focusCell('r1', 's1'));
    const press = (key: string) =>
      page.evaluate((k) => {
        const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
        (document.activeElement as HTMLElement).dispatchEvent(ev);
        return ev.defaultPrevented;
      }, key);
    expect(await press('F2')).toBe(true);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r1"]')).toHaveAttribute('data-editing', '');
    await expect(page.locator('.salmon-data-grid [data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s1"] input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    await expect(page.locator('.salmon-data-grid [data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s1"]')).toBeFocused();
    expect(await press('Insert')).toBe(true);
    await expect(page.locator('.salmon-data-grid-added-rows [data-new]')).toHaveCount(1);
  });
});

test.describe('selection keys and pointer', () => {
  test('row selection: click, Ctrl+click, Shift+click, Space, Shift+Arrow, Enter, Ctrl+A, Escape', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?sel=multiple`);
    expect(await page.locator('.salmon-data-grid').getAttribute('aria-multiselectable')).toBe('true');
    const cell = (r: number, c = 's0') => page.locator(`.salmon-data-grid-row[data-row-id="r${r}"] .salmon-data-grid-cell[data-column-id="${c}"]`);
    await cell(2).click();
    expect(await selectedRows(page)).toEqual(['r2']);
    await cell(4).click({ modifiers: ['ControlOrMeta'] }); // Ctrl+click is a context click on a macOS host
    expect(await selectedRows(page)).toEqual(['r2', 'r4']);
    await cell(7).click({ modifiers: ['Shift'] });
    expect(await selectedRows(page)).toEqual(['r4', 'r5', 'r6', 'r7']);
    expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('');
    await page.keyboard.press('Shift+ArrowDown');
    expect(await selectedRows(page)).toEqual(['r4', 'r5', 'r6', 'r7', 'r8']);
    await page.keyboard.press('Space');
    expect(await selectedRows(page)).toEqual(['r4', 'r5', 'r6', 'r7']);
    await page.keyboard.press('ArrowDown');
    expect(await selectedRows(page)).toEqual(['r9']);
    await page.keyboard.press('Enter');
    expect(await focused(page)).toBe('r10:s0');
    expect(await selectedRows(page)).toEqual(['r10']);
    await page.keyboard.press('Shift+Enter');
    expect(await selectedRows(page)).toEqual(['r9']);
    await page.keyboard.press(`${MOD}+KeyA`);
    expect((await selectedRows(page)).length).toBe(await page.locator('.salmon-data-grid-rows .salmon-data-grid-row').count());
    expect(await page.evaluate(() => window.__gridApi.getSelectionSummary().count)).toBe(100_000);
    await expect.poll(() => liveText(page)).toContain('All 100,000 rows selected');
    await page.keyboard.press('Escape');
    expect(await selectedRows(page)).toEqual([]);
    await expect.poll(() => liveText(page)).toContain('Selection cleared');
    // Escape with nothing selected is not consumed (Escape resolution rule 5).
    const consumed = await page.evaluate(() => {
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.activeElement!.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(consumed).toBe(false);
    expect(await page.locator('.salmon-data-grid-row[data-row-id="r0"]').getAttribute('aria-selected')).toBe('false');
    expect(problems).toEqual([]);
  });

  test('selection column: header select-all with mixed state, select all filtered', async ({ page }) => {
    await installDevtools(page);
    await openGrid(page, `${DEV_URL}?sel=checkbox`);
    const header = page.locator('.salmon-data-grid-header-cell[data-selection-column] [role="checkbox"]');
    const box = (r: number) => page.locator(`.salmon-data-grid-row[data-row-id="r${r}"] .salmon-data-grid-cell[data-selection-column]`);
    expect(await header.getAttribute('aria-checked')).toBe('false');
    expect(await header.getAttribute('aria-label')).toBe('Select all rows');
    // Focus the checkbox cell first so the click measures the toggle alone (not the tab stop move).
    await page.evaluate(() => window.__gridApi.focusCell('r3', '__salmon_select'));
    await page.waitForTimeout(50);
    const start = await page.evaluate(() => window.__commits.length);
    await box(3).click();
    const r = await page.evaluate((s) => {
      const commits = window.__commits.slice(s);
      return { cells: [...new Set(commits.flatMap((c) => c.cells))], rows: [...new Set(commits.flatMap((c) => c.rows))] };
    }, start);
    // Toggling one row re-renders that row and its checkbox cell (<= cells of the row + header select-all).
    expect(r.rows).toEqual(['r3']);
    expect(r.cells).toEqual(['r3:__salmon_select']);
    expect(await box(3).locator('[role="checkbox"]').getAttribute('aria-checked')).toBe('true');
    expect(await header.getAttribute('aria-checked')).toBe('mixed');
    // A row click toggles with a selection column (checkboxRowClick: 'add', the default).
    await page.locator('.salmon-data-grid-row[data-row-id="r5"] .salmon-data-grid-cell[data-column-id="s1"]').click();
    expect(await selectedRows(page)).toEqual(['r3', 'r5']);
    await header.click();
    expect(await header.getAttribute('aria-checked')).toBe('true');
    expect(await page.evaluate(() => window.__gridApi.getSelection().scope)).toBe('allFiltered');
    await box(0).click();
    expect(await header.getAttribute('aria-checked')).toBe('mixed');
    expect(await page.evaluate(() => window.__gridApi.getSelection().excludedRowIds)).toEqual(['r0']);
    await header.click();
    expect(await header.getAttribute('aria-checked')).toBe('true');
    await header.click();
    expect(await header.getAttribute('aria-checked')).toBe('false');
    expect(await selectedRows(page)).toEqual([]);
  });

  test('cell selection: aria-selected on cells, Shift+Arrow box range, Ctrl+Space column', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?sel=cell&cellMode=box&columnsSel`);
    await page.locator('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s0"]').click();
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowRight');
    const selected = await page.evaluate(() =>
      [...document.querySelectorAll('.salmon-data-grid-cell[aria-selected="true"]')].map((c) => `${(c.closest('[data-row-id]') as HTMLElement).dataset['rowId']}:${(c as HTMLElement).dataset['columnId']}`).sort(),
    );
    expect(selected).toEqual(['r1:s0', 'r1:s1', 'r2:s0', 'r2:s1']);
    expect(await page.locator('.salmon-data-grid-row[aria-selected]').count()).toBe(0);
    await page.keyboard.press('Control+Space');
    const column = await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]').getAttribute('aria-selected');
    expect(column).toBe('true');
    expect(await page.locator('.salmon-data-grid-row[data-row-id="r9"] .salmon-data-grid-cell[data-column-id="s1"]').getAttribute('aria-selected')).toBe('true');
  });

  test('reactive selection.rowIds and onSelectionChange event payloads', async ({ page }) => {
    // `selected` feeds `selection.rowIds`; `controlled` writes every change back into it (reactive re-apply of an equal value is a no-op).
    await openGrid(page, `${DEV_URL}?sel=multiple&controlled&selected=r1`);
    expect(await selectedRows(page)).toEqual(['r1']);
    await page.locator('.salmon-data-grid-row[data-row-id="r3"] .salmon-data-grid-cell[data-column-id="s0"]').click();
    expect(await selectedRows(page)).toEqual(['r3']);
    await page.keyboard.press('Shift+ArrowDown');
    expect(await selectedRows(page)).toEqual(['r3', 'r4']);
    const changes = await page.evaluate(() => (window as unknown as { __selectionChanges: unknown[] }).__selectionChanges);
    expect(changes).toEqual([
      { count: 1, source: 'pointer', scope: 'explicit', added: 1, removed: 1 },
      { count: 2, source: 'keyboard', scope: 'explicit', added: 1, removed: 0 },
    ]);
  });
});

test.describe('header keys and announcements', () => {
  test('Enter sorts, Ctrl+Enter adds, Shift+Enter removes; live region announces', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?qsort=multi&sel=multiple&rows=2000&cols=10`);
    await page.evaluate(() => window.__gridApi.focusHeader('n4'));
    expect(await focused(page)).toBe('header:n4');
    await page.keyboard.press('Enter');
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="n4"]')).toHaveAttribute('aria-sort', 'ascending');
    await expect.poll(() => liveText(page)).toContain('Sorted by Number 4 ascending');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(`${MOD}+Enter`);
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="n5"]')).toHaveAttribute('aria-sort', 'ascending');
    await page.keyboard.press('Shift+Enter');
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="n5"]')).toHaveAttribute('aria-sort', 'none');
    // Selection does not persist across a sort by default.
    await page.evaluate(() => window.__gridApi.selectRows(['r1', 'r2']));
    await page.evaluate(() => window.__gridApi.focusHeader('n4'));
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__gridApi.getSelectedRowIds())).toEqual([]);
    // Header Alt+ArrowRight moves the column (keyboard; needs `reorderable`) and keeps focus on it.
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(() => focused(page)).toBe('header:n4');
    expect(await page.evaluate(() => window.__gridApi.getVisibleColumns().map((c: { columnId: string }) => c.columnId).indexOf('n4'))).toBe(6);
  });
});

test.describe('RTL', () => {
  test('inherited dir="rtl" flips ArrowLeft/ArrowRight and keeps the logical order', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?dir=rtl&rows=1000&cols=20`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.salmon-data-grid')!).direction)).toBe('rtl');
    await page.evaluate(() => window.__gridApi.focusCell('r0', 's1'));
    await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe('r0:s2');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('r0:s0');
    // The first logical column sits on the right in RTL.
    const id = await page.locator('.salmon-data-grid-header-cell[data-column-id="id"]').boundingBox();
    const s0 = await page.locator('.salmon-data-grid-header-cell[data-column-id="s0"]').boundingBox();
    expect(id!.x).toBeGreaterThan(s0!.x);
    // End scrolls the last column into view through the normalized RTL scroll offset.
    await page.keyboard.press('End');
    await expect.poll(() => focused(page)).toBe('r0:b19');
    const vp = await page.locator('.salmon-data-grid-viewport').boundingBox();
    const last = await page.locator('.salmon-data-grid-row[data-row-id="r0"] .salmon-data-grid-cell[data-column-id="b19"]').boundingBox();
    expect(last!.x).toBeGreaterThanOrEqual(vp!.x - 1);
    expect(problems).toEqual([]);
  });
});

test.describe('macOS key variants', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
  test('Cmd+A, Cmd+Fn+Right (Meta+End), Cmd+Enter on header; Ctrl+End is not bound', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?sel=multiple&qsort=multi&rows=500&cols=10`);
    await page.evaluate(() => window.__gridApi.focusCell('r1', 's0'));
    await page.keyboard.press('Control+End');
    expect(await focused(page)).toBe('r1:s0');
    // Unbound, but no browser smooth scroll either: it would keep running past the next
    // keys and carry the viewport away from the cell they reveal.
    await page.waitForTimeout(300);
    expect(await page.locator('.salmon-data-grid-viewport').evaluate((v) => v.scrollTop)).toBe(0);
    await page.keyboard.press('Meta+End');
    await expect.poll(() => focused(page)).toBe('r499:b9');
    await page.keyboard.press('Meta+Home');
    await expect.poll(() => focused(page)).toBe('r0:id');
    await page.keyboard.press('Meta+KeyA');
    expect(await page.evaluate(() => window.__gridApi.getSelectionSummary().count)).toBe(500);
    await page.evaluate(() => window.__gridApi.focusHeader('n4'));
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Meta+Enter');
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="n5"]')).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="n4"]')).toHaveAttribute('aria-sort', 'ascending');
  });
});

test.describe('detail rows and child grids', () => {
  test('Enter and Space on the toggle cell flip aria-expanded and the toggle label; Enter on a child-grid parent mounts the child', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}detail-gaps.html?mode=detail`);
    const row = page.locator('#customers [data-row-id="c2"]');
    const toggle = row.locator('.salmon-data-grid-detail-toggle');
    await expect(row).toHaveAttribute('data-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-label', 'Expand details');
    // The toggle button is not a tab stop of its own: the cell is (roving tabindex).
    await expect(toggle).toHaveAttribute('tabindex', '-1');
    await row.locator('[data-column-id="__salmon_detail"]').focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('data-expanded', 'true');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(row).not.toHaveAttribute('aria-expanded');
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse details');
    expect(await focused(page)).toBe('c2:__salmon_detail');
    await page.keyboard.press('Space');
    await expect(row).toHaveAttribute('data-expanded', 'false');
    await expect(page.locator('#customers [data-row-id="__detail:c2"]')).toHaveCount(0);
    // Enter on a body cell outside the toggle column does not toggle.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('data-expanded', 'false');
    // Child grids: Enter on the parent toggle mounts the nested grid, Enter again unmounts it.
    await openGrid(page, `${DEV_URL}detail-gaps.html?mode=child`);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('c0:__salmon_detail');
    await page.keyboard.press('Enter');
    await expect(page.locator('#customers [data-row-id="c0"]')).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('[id="customers/c0"]')).toHaveAttribute('role', 'grid');
    await page.keyboard.press('Enter');
    await expect(page.locator('[id="customers/c0"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Keyboard map rows not covered above: one scenario per bound row.
// ---------------------------------------------------------------------------

type SetExtra = { __setExtra(patch: unknown): void };
const visibleIndex = (page: Page, columnId: string) =>
  page.evaluate((id) => window.__gridApi.getVisibleColumns().map((c: { columnId: string }) => c.columnId).indexOf(id), columnId);
const headerWidth = async (page: Page, columnId: string) => (await page.locator(`.salmon-data-grid-header-cell[data-column-id="${columnId}"]`).boundingBox())!.width;
const firstBodyRow = (page: Page) => page.evaluate(() => (document.querySelector('.salmon-data-grid-rows [data-row-id]') as HTMLElement).dataset['rowId']);

test.describe('keyboard map: regions, selection, header and group chip rows', () => {
  test('F6 and Shift+F6 cycle focus between the body and the header region', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=500&cols=10`);
    await page.evaluate(() => window.__gridApi.focusCell('r3', 's1'));
    expect(await focused(page)).toBe('r3:s1');
    await page.keyboard.press('F6');
    expect(await focused(page)).toBe('header:s1');
    // Back to the body returns to the last focused cell, not the first row.
    await page.keyboard.press('F6');
    expect(await focused(page)).toBe('r3:s1');
    await page.keyboard.press('Shift+F6');
    expect(await focused(page)).toBe('header:s1');
    await page.keyboard.press('Shift+F6');
    expect(await focused(page)).toBe('r3:s1');
    expect(await page.evaluate(() => window.__gridApi.getFocusedCell())).toEqual({ rowId: 'r3', field: 's1', region: 'body' });
  });

  test('F6 / Shift+F6 cycle toolbar, group panel, header, body, footer and pager; the body restores the last cell', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=500&cols=10&chrome&group=s0&aggs&qpage=50`);
    const region = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return 'none';
        if (el.closest('.salmon-data-grid-toolbar')) return 'toolbar';
        if (el.closest('.salmon-data-grid-group-panel')) return `groupPanel:${(el.closest('.salmon-data-grid-group-chip') as HTMLElement | null)?.dataset['columnId']}`;
        if (el.closest('.salmon-data-grid-pager')) return 'pager';
        if (el.closest('.salmon-data-grid-footer')) return 'footer';
        if (el.classList.contains('salmon-data-grid-header-cell')) return `header:${el.dataset['columnId']}`;
        if (el.closest('.salmon-data-grid-rows')) return `body:${(el.closest('[data-row-id]') as HTMLElement).dataset['rowId']}:${el.dataset['columnId']}`;
        return el.className;
      });
    // The third data row of the first group (captions take rows too).
    const dataRow = page.locator('.salmon-data-grid-rows .salmon-data-grid-row:not(.salmon-data-grid-group-caption)').nth(2);
    const rowId = await dataRow.getAttribute('data-row-id');
    await dataRow.locator('.salmon-data-grid-cell[data-column-id="s1"]').click();
    const cell = `body:${rowId}:s1`;
    expect(await region()).toBe(cell);
    const forward = ['footer', 'pager', 'toolbar', 'groupPanel:s0', 'header:s1', cell];
    for (const expected of forward) {
      await page.keyboard.press('F6');
      expect(await region(), `F6 to ${expected}`).toBe(expected);
    }
    for (const expected of [...forward].reverse().slice(1).concat(cell)) {
      await page.keyboard.press('Shift+F6');
      expect(await region(), `Shift+F6 to ${expected}`).toBe(expected);
    }
    // Keys other than F6 in the footer stay with the page (no body move).
    await page.keyboard.press('F6');
    expect(await region()).toBe('footer');
    await page.keyboard.press('ArrowUp');
    expect(await region()).toBe('footer');
    // Re-entering the body after leaving it with the mouse to the header restores the last body cell.
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s2"]').focus();
    await page.keyboard.press('F6');
    expect(await region()).toBe(cell);
    expect(problems).toEqual([]);
  });

  test('Ctrl+Shift+A selects all filtered rows; Shift+Space adds the focused row', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&filter&sel=multiple`);
    await page.evaluate(() => window.__gridApi.filterColumn('b9', 'equal', true));
    const filtered = await page.evaluate(() => window.__gridApi.getViewRows().length);
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(2000);
    await page.evaluate(() => window.__gridApi.focusCell(window.__gridApi.getViewRows()[1].id, 's0'));
    await page.keyboard.press(`${MOD}+Shift+KeyA`);
    expect(await page.evaluate(() => window.__gridApi.getSelection().scope)).toBe('allFiltered');
    expect(await page.evaluate(() => window.__gridApi.getSelectionSummary().count)).toBe(filtered);
    await page.keyboard.press('Escape');
    expect(await selectedRows(page)).toEqual([]);
    // Shift+Space adds the focused row (multiple selection keeps the others).
    const [a, b] = await page.evaluate(() => window.__gridApi.getViewRows().slice(2, 4).map((r: { id: string }) => r.id));
    await page.evaluate((id) => window.__gridApi.selectRows([id]), a);
    await page.evaluate((id) => window.__gridApi.focusCell(id, 's1'), b);
    expect(await selectedRows(page)).toEqual([a]);
    await page.keyboard.press('Shift+Space');
    expect(await selectedRows(page)).toEqual([a, b]);
    // Shift+Space does not toggle: pressed again, the row stays selected.
    await page.keyboard.press('Shift+Space');
    expect(await selectedRows(page)).toEqual([a, b]);
  });

  test('Shift+Space in cell selection mode selects every cell of the focused row', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=500&cols=10&sel=cell`);
    await page.evaluate(() => window.__gridApi.focusCell('r2', 's1'));
    await page.keyboard.press('Shift+Space');
    const cells = await page.evaluate(() =>
      [...document.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-cell[aria-selected="true"]')].map((c) => `${(c.closest('[data-row-id]') as HTMLElement).dataset['rowId']}:${(c as HTMLElement).dataset['columnId']}`),
    );
    const rendered = await page.locator('.salmon-data-grid-row[data-row-id="r2"] .salmon-data-grid-cell').count();
    expect(cells.length).toBe(rendered);
    expect(cells.every((c) => c.startsWith('r2:'))).toBe(true);
    expect(cells).toContain('r2:id');
    expect(cells).toContain('r2:b9');
    expect(await page.locator('.salmon-data-grid-row[aria-selected="true"]').count()).toBe(0);
  });

  test('header Ctrl+ArrowLeft/Right move the column; Ctrl+Alt+Arrow resizes, Ctrl+Alt+Enter auto-sizes', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=500&cols=10`);
    const start = await visibleIndex(page, 'n4');
    await page.evaluate(() => window.__gridApi.focusHeader('n4'));
    await page.keyboard.press(`${MOD}+ArrowRight`);
    await expect.poll(() => visibleIndex(page, 'n4')).toBe(start + 1);
    expect(await focused(page)).toBe('header:n4');
    await page.keyboard.press(`${MOD}+ArrowLeft`);
    await page.keyboard.press(`${MOD}+ArrowLeft`);
    await expect.poll(() => visibleIndex(page, 'n4')).toBe(start - 1);
    expect(await focused(page)).toBe('header:n4');
    // Resize keys widen the column; auto-size shrinks it back to fit its content.
    await page.evaluate(() => window.__gridApi.focusHeader('s1'));
    const initial = await headerWidth(page, 's1');
    for (let i = 0; i < 8; i++) await page.keyboard.press('Control+Alt+ArrowRight');
    await expect.poll(() => headerWidth(page, 's1')).toBeGreaterThan(initial + 20);
    const wide = await headerWidth(page, 's1');
    await page.keyboard.press('Control+Alt+Enter');
    await expect.poll(() => headerWidth(page, 's1')).toBeLessThan(wide);
    expect(await headerWidth(page, 's1')).toBeGreaterThan(0);
    expect(await focused(page)).toBe('header:s1');
  });

  test('group chip: Backspace ungroups the focused chip', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=500&cols=10&sort&group=s0,b9`);
    await expect(page.locator('.salmon-data-grid-group-chip')).toHaveCount(2);
    await page.locator('.salmon-data-grid-group-chip[data-column-id="b9"] .salmon-data-grid-group-chip__label').focus();
    await page.keyboard.press('Backspace');
    await expect(page.locator('.salmon-data-grid-group-chip')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-group-chip[data-column-id="s0"]')).toHaveCount(1);
    await page.locator('.salmon-data-grid-group-chip[data-column-id="s0"] .salmon-data-grid-group-chip__label').focus();
    await page.keyboard.press('Backspace');
    await expect(page.locator('.salmon-data-grid-group-chip')).toHaveCount(0);
    await expect(page.locator('.salmon-data-grid-group-caption')).toHaveCount(0);
  });
});

test.describe('pager keys', () => {
  test('PageUp/PageDown, ArrowLeft/Right, Home/End, Ctrl+Alt+PageUp/PageDown, Enter and Space', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&qpage=50`);
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    const info = pager.locator('.salmon-data-grid-pager__info');
    const pageButton = (n: number) => pager.getByRole('button', { name: `Page ${n}`, exact: true });
    await expect(info).toHaveText('1 of 40 pages (2,000 items)');
    await pageButton(1).focus();
    await page.keyboard.press('PageDown');
    await expect(pageButton(2)).toBeFocused();
    await expect(pageButton(2)).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('ArrowRight');
    await expect(pageButton(3)).toBeFocused();
    await page.keyboard.press('PageUp');
    await expect(pageButton(2)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(pageButton(1)).toBeFocused();
    await expect(info).toHaveText('1 of 40 pages (2,000 items)');
    await page.keyboard.press('Control+Alt+PageDown');
    await expect(pageButton(40)).toBeFocused();
    await expect(info).toHaveText('40 of 40 pages (2,000 items)');
    await expect.poll(() => firstBodyRow(page)).toBe('r1950');
    await page.keyboard.press('Control+Alt+PageUp');
    await expect(pageButton(1)).toBeFocused();
    await expect.poll(() => firstBodyRow(page)).toBe('r0');
    await page.keyboard.press('End');
    await expect(pageButton(40)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(pageButton(1)).toBeFocused();
    // Enter and Space activate the focused pager button.
    await pageButton(3).focus();
    await page.keyboard.press('Enter');
    await expect(pageButton(3)).toHaveAttribute('aria-current', 'page');
    await expect(info).toHaveText('3 of 40 pages (2,000 items)');
    await pager.getByRole('button', { name: 'Next page', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(pageButton(4)).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => firstBodyRow(page)).toBe('r150');
    expect(problems).toEqual([]);
  });
});

test.describe('custom keyboard shortcuts', () => {
  test('keyBindings remaps a built-in command; the old combo is no longer bound', async ({ page }) => {
    const bindings = encodeURIComponent(JSON.stringify({ 'selection.selectAll': ['Mod+Shift+L'], 'focus.down': ['ArrowDown', 'J'] }));
    await openGrid(page, `${DEV_URL}?rows=500&cols=10&sel=multiple&keyBindings=${bindings}`);
    await page.evaluate(() => window.__gridApi.focusCell('r1', 's0'));
    const ctrlA = await page.evaluate(() => {
      const ev = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true });
      document.activeElement!.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(ctrlA).toBe(false);
    expect(await page.evaluate(() => window.__gridApi.getSelectionSummary().count)).toBe(0);
    await page.keyboard.press(`${MOD}+Shift+KeyL`);
    expect(await page.evaluate(() => window.__gridApi.getSelectionSummary().count)).toBe(500);
    // An added combo works next to the kept default.
    await page.keyboard.press('Escape');
    await page.keyboard.press('j');
    expect(await focused(page)).toBe('r2:s0');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('r3:s0');
  });

  test('onKeyDown receives the resolved command; ctx.preventDefault() suppresses the built-in', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=500&cols=10&sel=multiple`);
    await page.evaluate(() => {
      const log: unknown[] = [];
      (window as unknown as { __keyLog: unknown[] }).__keyLog = log;
      (window as unknown as SetExtra).__setExtra({
        onKeyDown: (ctx: { nativeEvent: KeyboardEvent; command: string | null; context: string; rowId: string | null; field: string | null; preventDefault(): void }) => {
          log.push({ key: ctx.nativeEvent.key, command: ctx.command, context: ctx.context, rowId: ctx.rowId, field: ctx.field });
          if (ctx.command === 'focus.down' || ctx.command === 'selection.selectAll') ctx.preventDefault();
        },
      });
    });
    await page.evaluate(() => window.__gridApi.focusCell('r2', 's0'));
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('r2:s0');
    const prevented = await page.evaluate(() => {
      const ev = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true });
      document.activeElement!.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    // Suppressed: the key is not consumed, so host shortcuts and browser defaults still run.
    expect(prevented).toBe(false);
    expect(await page.evaluate(() => window.__gridApi.getSelectionSummary().count)).toBe(0);
    // Commands the hook does not suppress still run.
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('r2:s1');
    await page.evaluate(() => window.__gridApi.focusHeader('s1'));
    await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe('header:s0');
    const log = await page.evaluate(() => (window as unknown as { __keyLog: unknown[] }).__keyLog);
    expect(log).toEqual([
      { key: 'ArrowDown', command: 'focus.down', context: 'body', rowId: 'r2', field: 's0' },
      { key: 'a', command: 'selection.selectAll', context: 'body', rowId: 'r2', field: 's0' },
      { key: 'ArrowRight', command: 'focus.right', context: 'body', rowId: 'r2', field: 's0' },
      { key: 'ArrowLeft', command: 'focus.left', context: 'header', rowId: null, field: 's1' },
    ]);
  });
});

test.describe('focus restoration', () => {
  test('data reload and refresh keep focus on the row; a removed focused row parks focus on the root', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=500&cols=10`);
    await page.evaluate(() => window.__gridApi.focusCell('r5', 's1'));
    expect(await focused(page)).toBe('r5:s1');
    // New row objects with the same ids (a reload): focus stays on the cell.
    await page.evaluate(() => (window as unknown as SetExtra).__setExtra({ data: window.__gridApi.getViewRows().map((r: object) => ({ ...r })) }));
    await expect.poll(() => focused(page)).toBe('r5:s1');
    await page.evaluate(() => window.__gridApi.refresh());
    await expect.poll(() => focused(page)).toBe('r5:s1');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('r6:s1');
    // Rows inserted above shift the focused row; focus follows its id.
    await page.evaluate(() => {
      const rows = window.__gridApi.getViewRows() as { id: string }[];
      const added = [0, 1, 2].map((i) => ({ ...rows[0], id: `new${i}` }));
      (window as unknown as SetExtra).__setExtra({ data: [...added, ...rows] });
    });
    await expect.poll(() => page.locator('.salmon-data-grid-rows [data-row-id="new0"]').count()).toBe(1);
    expect(await focused(page)).toBe('r6:s1');
    // The focused row is removed: DOM focus parks on the grid root (never lost to body),
    // the root is the tab stop, and an arrow key continues inside the grid.
    await page.evaluate(() => {
      const rows = (window.__gridApi.getViewRows() as { id: string }[]).filter((r) => r.id !== 'r6');
      (window as unknown as SetExtra).__setExtra({ data: rows });
    });
    await expect.poll(() => focused(page)).toBe('root');
    expect(await page.locator('.salmon-data-grid').getAttribute('tabindex')).toBe('0');
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => /^[a-z0-9]+:s1$/.test(await focused(page))).toBe(true);
    expect(await page.locator('.salmon-data-grid').getAttribute('tabindex')).toBe('-1');
    expect(problems).toEqual([]);
  });

  test('a child grid unmounted while focus is inside returns focus to the parent grid', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${DEV_URL}hierarchy.html?mode=child&rows=50`);
    await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
    await waitForGridReady(page);
    await page.locator('#customers [data-row-id="c1"] .salmon-data-grid-detail-toggle').click();
    const child = page.locator('[id="customers/c1"]');
    await child.locator('[data-row-id="o1"] [data-column-id="orderId"]').click();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[id="customers/c1"]'))).toBe(true);
    await page.evaluate(() => window.__gridApi.collapseDetail('c1'));
    await expect(child).toHaveCount(0);
    const where = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return { body: el === document.body, inParent: !!el.closest('#customers'), tabStops: document.querySelectorAll('#customers[tabindex="0"], #customers [tabindex="0"]').length };
    });
    expect(where).toEqual({ body: false, inParent: true, tabStops: 1 });
    // The keyboard continues in the parent grid.
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#customers [data-row-id]'))).toBe(true);
    expect(problems).toEqual([]);
  });

  test('route unmount with an open overlay: no errors, overlay gone, listeners removed, remount works', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=500&cols=10&chrome`);
    await page.evaluate(() => window.__gridApi.focusHeader('s1'));
    await page.keyboard.press('Shift+Alt+ArrowDown');
    await expect(page.getByRole('menu', { name: 'Text 1 column menu' })).toBeVisible();
    await page.evaluate(() => (window as unknown as { __setMounted(v: boolean): void }).__setMounted(false));
    await expect(page.locator('.salmon-data-grid')).toHaveCount(0);
    await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    // The grid's document listener is gone: Alt+J does nothing and throws nothing.
    await page.keyboard.press('Alt+KeyJ');
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.evaluate(() => (window as unknown as { __setMounted(v: boolean): void }).__setMounted(true));
    await expect(page.locator('.salmon-data-grid')).toHaveCount(1);
    await page.waitForFunction(() => !!document.querySelector('.salmon-data-grid-rows [data-row-id]'));
    expect(await tabStops(page)).toEqual(['salmon-data-grid-cell']);
    await page.evaluate(() => window.__gridApi.focusCell('r1', 's0'));
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('r2:s0');
    expect(problems).toEqual([]);
  });
});
