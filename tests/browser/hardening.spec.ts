import { expect, test } from '@playwright/test';
import { collectProblems, DEV_URL, installDevtools, openGrid } from './helpers.ts';

// Hardening regressions in the browser (unit halves:
// packages/data-grid/tests/hardening.test.ts). `window.__setExtra(patch)`
// re-renders the fixture grid with more props (examples/vite-spa/src/main.tsx).

const cell = (page: import('@playwright/test').Page, rowId: string, columnId: string) =>
  page.locator(`.salmon-data-grid-row[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);

test.describe('render-only column fields (reactive column fields)', () => {
  test('changing cellClassName / renderCell / renderHeader re-renders that column only, without a recompile', async ({ page }) => {
    const problems = collectProblems(page);
    await installDevtools(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=6`);
    const setColumns = (mark: string) =>
      page.evaluate((m) => {
        const w = window as unknown as { __setExtra(p: unknown): void };
        w.__setExtra({
          columns: [
            { field: 'id', header: 'ID', primaryKey: true, width: 90, pinned: 'start' },
            { field: 's0', header: 'Text 0', width: 160, cellClassName: `mark-${m}`, renderCell: (c: { formattedValue: string }) => `${m}:${c.formattedValue}`, renderHeader: () => `H-${m}` },
            { field: 's1', header: 'Text 1', width: 160 },
          ],
        });
      }, mark);
    await setColumns('a');
    await expect(cell(page, 'r0', 's0')).toHaveClass(/mark-a/);
    await expect(cell(page, 'r0', 's0')).toHaveText(/^a:/);
    await page.evaluate(() => (window.__commits.length = 0));
    await setColumns('b');
    await expect(cell(page, 'r0', 's0')).toHaveClass(/mark-b/);
    await expect(cell(page, 'r0', 's0')).toHaveText(/^b:/);
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="s0"]')).toHaveText('H-b');
    const commits = await page.evaluate(() => window.__commits);
    const cells = commits.flatMap((c) => c.cells);
    expect(cells.length).toBeGreaterThan(0);
    // Only the changed column's cells re-render; the other columns' cells are untouched.
    expect(cells.filter((id) => !id.endsWith(':s0'))).toEqual([]);
    expect(commits.flatMap((c) => c.headers)).toEqual(['s0']);
    expect(problems).toEqual([]);
  });
});

test.describe('toolbar render props', () => {
  test('toggling renderToolbar takes effect in the same render', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&chrome`);
    await expect(page.locator('[role="toolbar"]')).toHaveCount(1);
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ renderToolbar: () => 'Custom toolbar text' }));
    await expect(page.getByText('Custom toolbar text')).toHaveCount(1);
    await expect(page.locator('[role="toolbar"]')).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ renderToolbar: undefined }));
    await expect(page.getByText('Custom toolbar text')).toHaveCount(0);
    await expect(page.locator('[role="toolbar"]')).toHaveCount(1);
    expect(problems).toEqual([]);
  });
});

test.describe('columnChooser: false', () => {
  test('the toolbar item is disabled and neither it nor the API opens the chooser', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&chrome`);
    const item = page.locator('[data-toolbar-item="columnChooser"]');
    await item.click();
    await expect(page.locator('[data-salmon-popover]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ columnChooser: false }));
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await item.click({ force: true });
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
    // The API call warns once in development; nothing else is reported.
    expect(problems.filter((p) => !p.includes('openColumnChooser() is ignored because columnChooser is false'))).toEqual([]);
    expect(problems.length).toBe(1);
  });
});

test.describe('filter menu open events', () => {
  test('onBeforeFilterMenuOpen can cancel; onFilterMenuOpen fires once after the menu rendered', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&filter&filterUi=excel`);
    await page.evaluate(() => {
      const w = window as unknown as { __setExtra(p: unknown): void; __menuEvents: unknown[]; __cancelMenu: boolean };
      w.__menuEvents = [];
      w.__cancelMenu = true;
      w.__setExtra({
        onBeforeFilterMenuOpen: (e: { type: string; field: string; ui: string; dialog: string; preventDefault(): void }) => {
          w.__menuEvents.push({ type: e.type, field: e.field, ui: e.ui, dialog: e.dialog });
          if (w.__cancelMenu) e.preventDefault();
        },
        onFilterMenuOpen: (e: { type: string; field: string; ui: string; dialog: string }) =>
          w.__menuEvents.push({ type: e.type, field: e.field, ui: e.ui, dialog: e.dialog, rendered: document.querySelector('.salmon-data-grid-filter-menu') !== null }),
      });
    });
    const button = page.locator('.salmon-data-grid-header-cell[data-column-id="s0"] .salmon-data-grid-filter-button');
    await button.click();
    await expect(page.locator('.salmon-data-grid-filter-menu')).toHaveCount(0);
    await page.evaluate(() => ((window as unknown as { __cancelMenu: boolean }).__cancelMenu = false));
    await button.click();
    await expect(page.locator('.salmon-data-grid-filter-menu')).toHaveCount(1);
    await page.locator('.salmon-data-grid-filter-menu__custom > summary').click();
    await expect(page.locator('.salmon-data-grid-filter-menu__custom')).toHaveAttribute('open', '');
    // The details `toggle` event is dispatched as a task after the click.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __menuEvents: unknown[] }).__menuEvents.length)).toBe(5);
    const events = await page.evaluate(() => (window as unknown as { __menuEvents: unknown[] }).__menuEvents);
    expect(events).toEqual([
      { type: 'beforeFilterMenuOpen', field: 's0', ui: 'excel', dialog: 'menu' },
      { type: 'beforeFilterMenuOpen', field: 's0', ui: 'excel', dialog: 'menu' },
      { type: 'filterMenuOpen', field: 's0', ui: 'excel', dialog: 'menu', rendered: true },
      { type: 'beforeFilterMenuOpen', field: 's0', ui: 'excel', dialog: 'custom' },
      { type: 'filterMenuOpen', field: 's0', ui: 'excel', dialog: 'custom', rendered: true },
    ]);
    expect(problems).toEqual([]);
  });

  test("preventDefault for dialog 'custom' keeps the Excel custom-condition section closed and the menu open", async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&filter&filterUi=excel`);
    await page.evaluate(() => {
      const w = window as unknown as { __setExtra(p: unknown): void; __menuEvents: unknown[]; __cancelDialog: string | null };
      w.__menuEvents = [];
      w.__cancelDialog = 'custom';
      w.__setExtra({
        onBeforeFilterMenuOpen: (e: { type: string; dialog: string; preventDefault(): void }) => {
          w.__menuEvents.push(`${e.type}:${e.dialog}`);
          if (w.__cancelDialog === e.dialog) e.preventDefault();
        },
        onFilterMenuOpen: (e: { type: string; dialog: string }) => w.__menuEvents.push(`${e.type}:${e.dialog}`),
      });
    });
    const events = () => page.evaluate(() => (window as unknown as { __menuEvents: string[] }).__menuEvents);
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s0"] .salmon-data-grid-filter-button').click();
    const custom = page.locator('.salmon-data-grid-filter-menu__custom');
    await expect(custom).not.toHaveAttribute('open', '');
    await custom.locator('> summary').click();
    await expect.poll(events).toEqual(['beforeFilterMenuOpen:menu', 'filterMenuOpen:menu', 'beforeFilterMenuOpen:custom']);
    await expect(custom).not.toHaveAttribute('open', '');
    await expect(custom.locator('select').first()).toBeHidden();
    await expect(page.locator('.salmon-data-grid-filter-menu')).toHaveCount(1);
    // Allowed: the section opens and the after-event follows.
    await page.evaluate(() => ((window as unknown as { __cancelDialog: string | null }).__cancelDialog = null));
    await custom.locator('> summary').click();
    await expect(custom).toHaveAttribute('open', '');
    await expect.poll(events).toEqual(['beforeFilterMenuOpen:menu', 'filterMenuOpen:menu', 'beforeFilterMenuOpen:custom', 'beforeFilterMenuOpen:custom', 'filterMenuOpen:custom']);
    expect(problems).toEqual([]);
  });
});

test.describe('command column keyboard', () => {
  test('Enter moves into the command buttons, arrows rove, Escape returns to the cell, Enter presses', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&edit=row&ecommands`);
    const active = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return { command: el?.dataset['command'] ?? null, cell: el?.classList.contains('salmon-data-grid-cell') ? `${el.closest<HTMLElement>('[data-row-id]')?.dataset['rowId']}:${el.dataset['columnId']}` : null };
      });
    await page.evaluate(() => window.__gridApi.focusCell('r1', 'commands'));
    await expect.poll(active).toEqual({ command: null, cell: 'r1:commands' });
    await page.keyboard.press('Enter');
    await expect.poll(active).toEqual({ command: 'edit', cell: null });
    await page.keyboard.press('ArrowRight');
    await expect.poll(active).toEqual({ command: 'delete', cell: null });
    await page.keyboard.press('ArrowRight');
    await expect.poll(active).toEqual({ command: 'delete', cell: null });
    await page.keyboard.press('Home');
    await expect.poll(active).toEqual({ command: 'edit', cell: null });
    await page.keyboard.press('Escape');
    await expect.poll(active).toEqual({ command: null, cell: 'r1:commands' });
    // Enter on a button presses it (the row enters edit mode) instead of moving the grid focus.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r1"]')).toHaveAttribute('data-editing', '');
    expect(problems).toEqual([]);
  });
});

test.describe('added row position (addRow(index))', () => {
  test('addRow(index) renders at the edge the index picks, whatever newRowPosition is', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&edit=batch`);
    // newRowPosition defaults to top: an index past the end adds at the bottom.
    await page.evaluate(() => window.__gridApi.addRow({ id: 'x-bottom' }, 1000));
    await page.evaluate(() => window.__gridApi.addRow({ id: 'x-top' }));
    await expect(page.locator('.salmon-data-grid-added-rows--bottom .salmon-data-grid-added-row')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-added-rows--top .salmon-data-grid-added-row')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-added-rows--bottom .salmon-data-grid-cell[data-column-id="id"]')).toHaveText('x-bottom');
    // The last added row has the open editor.
    await expect(page.locator('.salmon-data-grid-added-rows--top .salmon-data-grid-cell[data-column-id="id"] input')).toHaveValue('x-top');
    expect(problems).toEqual([]);
  });
});
