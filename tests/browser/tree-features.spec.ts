import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, SSR_URL } from './helpers.ts';

// Tree mode with the inherited Data Grid features on
// examples/vite-spa/tree-features.html and the Vite SSR example with a tree grid (hydration).

async function open(page: Page, query: string, grid = '[role="treegrid"]'): Promise<void> {
  await page.goto(`${DEV_URL}tree-features.html?${query}`);
  await page.waitForFunction((sel) => document.querySelector('[data-salmon-pending]') === null && document.querySelector(sel) !== null && window.__gridApi, grid);
}

const row = (page: Page, id: string, grid = '#tasks') => page.locator(`${grid} [role="row"][data-row-id="${id}"]`);
const cell = (page: Page, id: string, field = 'name', grid = '#tasks') => row(page, id, grid).locator(`[data-column-id="${field}"]`);
/** Data row ids in DOM order (the rendered window, top to bottom by position). */
async function shown(page: Page, grid = '#tasks'): Promise<string[]> {
  return page.evaluate((sel) => {
    const rows = [...document.querySelectorAll<HTMLElement>(`${sel} .salmon-data-grid-rows [role="row"][data-row-id]`)];
    return rows
      .map((r) => ({ id: r.dataset['rowId'] as string, top: r.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map((r) => r.id);
  }, grid);
}

test.describe('tree mode: editing', () => {
  for (const pos of ['child', 'above', 'below'] as const) {
    test(`newRowPosition '${pos}': the added row renders at its tree position, then saves there`, async ({ page }) => {
      const problems = collectProblems(page);
      await open(page, `mode=edit&pos=${pos}`);
      await cell(page, 'p1a').click();
      await page.locator('.salmon-data-grid-toolbar__item', { hasText: /^Add$/ }).click();
      const added = page.locator('#tasks .salmon-data-grid-rows [role="row"][data-new]');
      await expect(added).toHaveCount(1);
      // Not in the edge band: inside the rendered rows, between its tree neighbours.
      await expect(page.locator('#tasks .salmon-data-grid-added-rows [data-new]')).toHaveCount(0);
      const order = await shown(page);
      const at = order.findIndex((id) => id.startsWith('__new'));
      const expected = { child: ['p1a1', 'p1b'], above: ['p1', 'p1a'], below: ['p1a1', 'p1b'] }[pos];
      expect(order.slice(at - 1, at + 2)).toEqual([expected[0], order[at], expected[1]]);
      await expect(added).toHaveAttribute('aria-level', pos === 'child' ? '3' : '2');
      // The row does not overlap its neighbours: the next row starts at the added row's bottom edge.
      const box = await added.boundingBox();
      const next = await row(page, expected[1] as string).boundingBox();
      expect(Math.round((next?.y ?? 0) - ((box?.y ?? 0) + (box?.height ?? 0)))).toBe(0);
      // The tree column of the added row keeps the tree cell (indented as its depth).
      await expect(added.locator('.salmon-data-grid-tree-cell')).toHaveCount(1);
      await added.locator('[data-column-id="name"] input').fill('Survey');
      await added.locator('[data-column-id="id"] input').fill('new1');
      await page.keyboard.press('Enter');
      await expect(row(page, 'new1')).toHaveCount(1);
      const info = await page.evaluate(() => window.__gridApi!.getTreeRow('new1'));
      expect(info?.parentId).toBe(pos === 'child' ? 'p1a' : 'p1');
      const after = await shown(page);
      const i = after.indexOf('new1');
      expect(after.slice(i - 1, i + 2)).toEqual(pos === 'above' ? ['p1', 'new1', 'p1a'] : ['p1a1', 'new1', 'p1b']);
      expect(problems).toEqual([]);
    });
  }

  test('row editing in the tree column keeps the toggle; validation blocks the save; command column saves', async ({ page }) => {
    await open(page, 'mode=edit');
    await cell(page, 'p1').dblclick();
    const editor = cell(page, 'p1').locator('input');
    await expect(editor).toBeVisible();
    // Editing the tree column keeps the toggle and the indentation.
    await expect(row(page, 'p1').locator('button.salmon-data-grid-tree-toggle')).toHaveCount(1);
    await editor.fill('P');
    await page.keyboard.press('Enter');
    await expect(row(page, 'p1')).toHaveAttribute('data-invalid', '');
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    await editor.fill('Plan');
    await row(page, 'p1').locator('button', { hasText: /^(Save|Update)$/ }).click();
    await expect(cell(page, 'p1')).toContainText('Plan');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'p1a1')).toHaveAttribute('aria-level', '3');
    // Command column edit on a grandchild.
    await row(page, 'p1a1').locator('button', { hasText: /^Edit$/ }).click();
    await cell(page, 'p1a1').locator('input').fill('Calls');
    await row(page, 'p1a1').locator('button', { hasText: /^(Save|Update)$/ }).click();
    await expect(cell(page, 'p1a1')).toContainText('Calls');
    await expect(row(page, 'p1a1')).toHaveAttribute('aria-level', '3');
    // Deleting a parent from the command column deletes its subtree.
    await row(page, 'p2').locator('button', { hasText: /^Delete$/ }).click();
    await expect(row(page, 'p2')).toHaveCount(0);
    await expect(row(page, 'p2a')).toHaveCount(0);
  });

  for (const mode of ['cell', 'batch', 'dialog'] as const) {
    test(`${mode} editing of a tree row keeps its place and toggle`, async ({ page }) => {
      const problems = collectProblems(page);
      await open(page, `mode=edit&edit=${mode}`);
      await cell(page, 'p1a').dblclick();
      const input = mode === 'dialog' ? page.locator('dialog.salmon-data-grid-edit-dialog [data-column-id="name"] input') : cell(page, 'p1a').locator('input');
      await expect(input).toBeVisible();
      if (mode !== 'dialog') await expect(row(page, 'p1a').locator('button.salmon-data-grid-tree-toggle')).toHaveCount(1);
      await input.fill('Sc');
      await page.keyboard.press('Enter');
      if (mode === 'dialog') {
        await expect(input).toHaveAttribute('aria-invalid', 'true');
      } else {
        await expect(cell(page, 'p1a')).toHaveAttribute('data-invalid', '');
      }
      await input.fill('Scope v2');
      await page.keyboard.press('Enter');
      if (mode === 'batch') {
        await expect(cell(page, 'p1a')).toHaveAttribute('data-dirty', '');
        await page.evaluate(() => window.__gridApi!.save());
      }
      await expect(cell(page, 'p1a')).toContainText('Scope v2');
      await expect(row(page, 'p1a')).toHaveAttribute('aria-level', '2');
      await expect(row(page, 'p1a')).toHaveAttribute('aria-expanded', 'true');
      expect(await page.evaluate(() => window.__gridApi!.getTreeRow('p1a')?.parentId)).toBe('p1');
      expect(problems).toEqual([]);
    });
  }
});

test.describe('tree mode: detail rows', () => {
  test('the detail row follows its tree row and hides when an ancestor collapses', async ({ page }) => {
    await open(page, 'mode=detail');
    const detail = page.locator('#tasks [data-row-id="__detail:p1a"]');
    await expect(detail).toContainText('Detail of Scope');
    let order = await shown(page);
    expect(order.slice(order.indexOf('p1a'), order.indexOf('p1a') + 3)).toEqual(['p1a', '__detail:p1a', 'p1a1']);
    await row(page, 'p1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(detail).toHaveCount(0);
    await row(page, 'p1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(detail).toHaveCount(1);
    // Expanding the detail of a leaf puts it under that leaf.
    await row(page, 'p2b').locator('.salmon-data-grid-detail-toggle').click();
    order = await shown(page);
    expect(order[order.indexOf('p2b') + 1]).toBe('__detail:p2b');
  });
});

test.describe('tree mode: virtualization', () => {
  test('row virtualization over a 5,200-row tree: scroll renders the right rows; collapse and expand far down', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'mode=big');
    expect(await page.evaluate(() => window.__gridApi!.getVisibleRows().length)).toBe(5200);
    const rendered = await page.locator('#tasks .salmon-data-grid-rows [role="row"]').count();
    expect(rendered).toBeLessThan(60);
    await page.evaluate(() => window.__gridApi!.scrollToRow('r300-2-1'));
    await expect(row(page, 'r300-2-1')).toHaveAttribute('aria-level', '3');
    await expect(row(page, 'r300-2')).toHaveAttribute('aria-level', '2');
    // Collapsing a parent deep in the tree removes its subtree from the window and shifts the rows below.
    await row(page, 'r300').locator('button.salmon-data-grid-tree-toggle').scrollIntoViewIfNeeded();
    await row(page, 'r300').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'r300-0')).toHaveCount(0);
    await expect(row(page, 'r301')).toBeVisible();
    expect(await page.evaluate(() => window.__gridApi!.getVisibleRows().length)).toBe(5200 - 12);
    // aria-rowindex follows the visible order.
    const idx = Number(await row(page, 'r301').getAttribute('aria-rowindex'));
    expect(idx).toBe(1 + 301 * 13 - 12 + 1);
    await page.locator('#tasks .salmon-data-grid-viewport').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(row(page, 'r399-2-2')).toBeVisible();
    expect(await page.locator('#tasks .salmon-data-grid-rows [role="row"]').count()).toBeLessThan(60);
    expect(problems).toEqual([]);
  });

  test('column virtualization keeps the toggle in the tree column while scrolled horizontally', async ({ page }) => {
    await open(page, 'mode=big&roots=50&cols=40');
    const headerCells = await page.locator('#tasks [role="columnheader"]').count();
    expect(headerCells).toBeLessThan(25);
    const viewport = page.locator('#tasks .salmon-data-grid-viewport');
    await viewport.evaluate((el) => (el.scrollLeft = 2400));
    await expect(page.locator('#tasks [role="columnheader"][data-column-id="c25"]')).toHaveCount(1);
    await viewport.evaluate((el) => (el.scrollLeft = 0));
    await expect(row(page, 'r0').locator('button.salmon-data-grid-tree-toggle')).toHaveCount(1);
    await row(page, 'r0').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'r0')).toHaveAttribute('aria-expanded', 'false');
    // Ctrl+End reaches the last cell of the last visible row (in tree mode).
    await cell(page, 'r1').click();
    await page.keyboard.press('Control+End');
    await expect(page.locator('#tasks [role="row"][data-row-id="r49-2-2"] [data-column-id="c39"]')).toBeFocused();
  });

  test('checkbox cascade and detail rows survive scrolling far away and back', async ({ page }) => {
    await open(page, 'mode=big&checkbox&detail');
    await row(page, 'r0').locator('.salmon-data-grid-tree-checkbox').click();
    await expect(row(page, 'r0-2-2').locator('.salmon-data-grid-tree-checkbox')).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => window.__gridApi!.scrollToRow('r200-1'));
    await expect(page.locator('#tasks [data-row-id="__detail:r200-1"]')).toContainText('Detail of Child 200.1');
    await row(page, 'r200-1-0').locator('.salmon-data-grid-tree-checkbox').click();
    await expect(row(page, 'r200-1').locator('.salmon-data-grid-tree-checkbox')).toHaveAttribute('aria-checked', 'mixed');
    await page.evaluate(() => window.__gridApi!.scrollToRow('r0'));
    await expect(row(page, 'r0').locator('.salmon-data-grid-tree-checkbox')).toHaveAttribute('aria-checked', 'true');
    const selected = await page.evaluate(() => window.__gridApi!.getSelectedRowIds().length);
    expect(selected).toBe(14);
  });

  test('batch editing with virtualization keeps pending changes of rows scrolled out', async ({ page }) => {
    await open(page, 'mode=big&batch');
    await cell(page, 'r0-1').dblclick();
    await cell(page, 'r0-1').locator('input').fill('Renamed child');
    await page.keyboard.press('Enter');
    await expect(cell(page, 'r0-1')).toHaveAttribute('data-dirty', '');
    await page.evaluate(() => window.__gridApi!.scrollToRow('r350'));
    await expect(row(page, 'r0-1')).toHaveCount(0);
    await page.evaluate(() => window.__gridApi!.updateCell('r350-0-0', 'name', 'Far leaf'));
    await page.evaluate(() => window.__gridApi!.scrollToRow('r0'));
    await expect(cell(page, 'r0-1')).toHaveAttribute('data-dirty', '');
    expect(await page.evaluate(() => window.__gridApi!.getPendingChanges().changedRecords.length)).toBe(2);
    await page.evaluate(() => window.__gridApi!.save());
    await expect(cell(page, 'r0-1')).toContainText('Renamed child');
    expect(await page.evaluate(() => window.__gridApi!.getTreeRow('r350-0-0')?.depth)).toBe(2);
  });

  test('cell selection and row templates with virtualization', async ({ page }) => {
    await open(page, 'mode=big&cells');
    await cell(page, 'r0').click();
    await cell(page, 'r0-0-1', 'hours').click({ modifiers: ['Shift'] });
    // r0, r0-0, r0-0-0, r0-0-1 x name, id, hours: one range of 12 cells across three depths.
    await expect(page.locator('#tasks .salmon-data-grid-rows [role="gridcell"][aria-selected="true"]')).toHaveCount(12);
    await page.evaluate(() => window.__gridApi!.scrollToRow('r300'));
    await page.evaluate(() => window.__gridApi!.scrollToRow('r0'));
    await expect(cell(page, 'r0-0', 'id')).toHaveAttribute('aria-selected', 'true');
    await open(page, 'mode=big&template&roots=200');
    await expect(row(page, 'r0')).toHaveClass(/probe-template/);
    await page.evaluate(() => window.__gridApi!.scrollToRow('r150-1'));
    await expect(row(page, 'r150-1')).toHaveClass(/probe-template/);
    await expect(row(page, 'r150-1')).toHaveAttribute('aria-level', '2');
    await row(page, 'r150-1').locator('button.salmon-data-grid-tree-toggle').first().click();
    await expect(row(page, 'r150-1-0')).toHaveCount(0);
  });
});

test.describe('tree mode: row drag between grids and onto an element', () => {
  async function drag(page: Page, from: string, to: { x: number; y: number }): Promise<void> {
    const handle = await row(page, from, '#left').locator('.salmon-data-grid-row-drag-handle').boundingBox();
    if (!handle) throw new Error('no handle');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 4, handle.y - 10, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 15 });
    await page.mouse.up();
  }

  test('a parent dragged into the other tree grid takes its subtree along', async ({ page }) => {
    await open(page, 'mode=cross', '#right[role="treegrid"]');
    const target = await row(page, 'z1', '#right').boundingBox();
    if (!target) throw new Error('no target');
    await drag(page, 'p1a', { x: target.x + target.width / 2, y: target.y + target.height / 2 });
    await expect(row(page, 'p1a', '#right')).toHaveCount(1);
    await expect(row(page, 'p1a1', '#right')).toHaveCount(1);
    await expect(row(page, 'p1a', '#left')).toHaveCount(0);
    await expect(row(page, 'p1a1', '#left')).toHaveCount(0);
    expect(await page.evaluate(() => window.__rightApi!.getTreeRow('p1a1')?.parentId)).toBe('p1a');
    expect(await page.evaluate(() => window.__rightApi!.getTreeRow('p1a')?.parentId)).toBe('z1');
  });

  test('a drop onto a custom element carries the subtree in the payload', async ({ page }) => {
    await open(page, 'mode=cross&target=bin', '#right[role="treegrid"]');
    const bin = await page.locator('#bin').boundingBox();
    if (!bin) throw new Error('no bin');
    await drag(page, 'p1a', { x: bin.x + 40, y: bin.y + 40 });
    await expect(page.locator('#bin-ids')).toHaveText('p1a,p1a1');
    const drop = (await page.evaluate(() => window.__events)).find((e) => e.type === 'rowDrop');
    expect(drop).toMatchObject({ rowIds: ['p1a'], rows: ['p1a', 'p1a1'], targetGridId: null, target: 'bin' });
  });
});

test.describe('tree mode: lazy children, persistence, adaptive, chrome', () => {
  test('skeleton rows show under a lazy parent while its children load', async ({ page }) => {
    await open(page, 'mode=lazy&delay=1500');
    await row(page, 'l1').locator('button.salmon-data-grid-tree-toggle').click();
    const skeleton = page.locator('#tasks .salmon-data-grid-rows .salmon-data-grid-skeleton-row');
    await expect(skeleton.first()).toBeVisible();
    const parent = await row(page, 'l1').boundingBox();
    const first = await skeleton.first().boundingBox();
    expect(Math.round((first?.y ?? 0) - ((parent?.y ?? 0) + (parent?.height ?? 0)))).toBe(0);
    await expect(row(page, 'l1-0')).toHaveCount(1, { timeout: 5000 });
    await expect(skeleton).toHaveCount(0);
  });

  test('persistState saves the expansion after a toggle and restores it on reload', async ({ page }) => {
    await page.goto(`${DEV_URL}tree-features.html?mode=persist`);
    await page.evaluate(() => localStorage.removeItem('salmon-data-grid:persisted'));
    await open(page, 'mode=persist', '#persisted[role="treegrid"]');
    await row(page, 'p1', '#persisted').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'p1', '#persisted')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('salmon-data-grid:persisted') ?? '{}')?.tree?.expandedRows?.p1)).toBe(false);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#persisted[role="treegrid"]:not([data-salmon-pending])') !== null);
    await expect(row(page, 'p1', '#persisted')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'p1a', '#persisted')).toHaveCount(0);
  });

  test('adaptive cards on a phone viewport: the toggle and "Level n"', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, 'mode=adaptive');
    await expect(row(page, 'p1a1').locator('.salmon-data-grid-tree-level')).toHaveText('Level 3');
    await expect(row(page, 'p1').locator('.salmon-data-grid-tree-level')).toHaveText('Level 1');
    const toggle = row(page, 'p1').locator('button.salmon-data-grid-tree-toggle');
    const box = await toggle.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    await toggle.click();
    await expect(row(page, 'p1a')).toHaveCount(0);
  });

  test('column chrome: hiding or reordering the tree column moves the tree; context menu and toolbar search', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'mode=chrome');
    await expect(cell(page, 'p1', 'name').locator('.salmon-data-grid-tree-cell')).toHaveCount(1);
    // Hide the tree column: the next visible data column takes the toggle.
    await page.evaluate(() => window.__gridApi!.engine.dispatch({ type: 'columns.hide', keys: ['name'] }));
    await expect(cell(page, 'p1', 'id').locator('button.salmon-data-grid-tree-toggle')).toHaveCount(1);
    await page.evaluate(() => window.__gridApi!.engine.dispatch({ type: 'columns.show', keys: ['name'] }));
    await expect(cell(page, 'p1', 'name').locator('button.salmon-data-grid-tree-toggle')).toHaveCount(1);
    // Pin `hours` to the start: it leads the visible order and carries the tree.
    await page.evaluate(() => window.__gridApi!.pinColumn('hours', 'start'));
    await expect(cell(page, 'p1', 'hours').locator('button.salmon-data-grid-tree-toggle')).toHaveCount(1);
    await expect(cell(page, 'p1', 'name').locator('button.salmon-data-grid-tree-toggle')).toHaveCount(0);
    await page.evaluate(() => window.__gridApi!.pinColumn('hours', null));
    // Reorder: move `id` to the front.
    await page.evaluate(() => window.__gridApi!.moveColumn('id', 0));
    await expect(cell(page, 'p1', 'id').locator('button.salmon-data-grid-tree-toggle')).toHaveCount(1);
    // Context menu on a child row.
    await cell(page, 'p1b', 'hours').click({ button: 'right' });
    const menu = page.locator('[role="menu"]').first();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    // Toolbar search keeps the ancestors of a match.
    const search = page.locator('.salmon-data-grid-toolbar input[type="search"]');
    await search.fill('Backend');
    await expect(row(page, 'p2a')).toHaveCount(1);
    await expect(row(page, 'p2')).toHaveAttribute('data-tree-context', '');
    await expect(row(page, 'p1')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

test.describe('tree mode SSR and hydration', () => {
  test('the Vite SSR example renders a treegrid and hydrates without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    const url = `${SSR_URL}?features=tree`;
    const html = await (await page.request.get(url)).text();
    expect(html).toContain('role="treegrid"');
    expect(html).toMatch(/aria-level="2"/);
    await page.goto(url);
    await page.waitForFunction(() => (window as { __gridReady?: boolean }).__gridReady === true);
    await expect(page.locator('[role="treegrid"][data-salmon-pending]')).toHaveCount(0);
    const parent = page.locator('[role="treegrid"] [role="row"][aria-expanded="true"]').first();
    const id = await parent.getAttribute('data-row-id');
    await parent.locator('button.salmon-data-grid-tree-toggle').click();
    await expect(page.locator(`[role="treegrid"] [role="row"][data-row-id="${id}"]`)).toHaveAttribute('aria-expanded', 'false');
    expect(problems).toEqual([]);
  });
});

