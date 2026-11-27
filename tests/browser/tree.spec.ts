import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL, trackModules, waitForModule } from './helpers.ts';

// Tree mode on
// examples/vite-spa/tree.html: toggle clicks, the tree keys, the checkbox
// cascade, indent / outdent, drag into a row, lazy children with a failed
// load and retry, RTL, and axe-core on the treegrid states.

async function openTree(page: Page, query: string): Promise<void> {
  trackModules(page);
  await page.goto(`${DEV_URL}tree.html?${query}`);
  await page.waitForFunction(() => document.querySelector('[data-salmon-pending]') === null && document.querySelector('[role="treegrid"]') !== null && window.__gridApi);
  // The tree keys (Arrow expand / collapse, Ctrl+Arrow, Alt+Shift+Arrow) register from a client chunk
  // loaded after mount, and indent / outdent with rowDrag resolve the row drag chunk (tree-ui.tsx mount()).
  await waitForModule(page, /\/tree-client-chunk\.js(\?|$)/);
  if (query.includes('mode=flat')) await waitForModule(page, /\/row-drag-chunk\.js(\?|$)/);
}

const row = (page: Page, id: string) => page.locator(`[role="treegrid"] [role="row"][data-row-id="${id}"]`);
const cell = (page: Page, id: string, field = 'name') => row(page, id).locator(`[data-column-id="${field}"]`);
const events = (page: Page) => page.evaluate(() => window.__events);

test.describe('tree mode', () => {
  test('toggle click collapses and expands with onTreeToggle and the live message', async ({ page }) => {
    const problems = collectProblems(page);
    await openTree(page, 'mode=nested');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'p1a1')).toHaveAttribute('aria-level', '3');
    await row(page, 'p1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'p1a')).toHaveCount(0);
    await expect(page.locator('.salmon-data-grid-live').first()).toHaveText('Planning collapsed');
    await row(page, 'p1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'p1a')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-live').first()).toHaveText('Planning expanded, 2 children');
    const toggles = (await events(page)).filter((e) => e.type === 'treeToggle');
    expect(toggles).toEqual([
      { type: 'treeToggle', rowId: 'p1', expanded: false, source: 'pointer' },
      { type: 'treeToggle', rowId: 'p1', expanded: true, source: 'pointer' },
    ]);
    // The toggle click does not select the row.
    await expect(row(page, 'p1')).toHaveAttribute('aria-selected', 'false');
    // Hit target at least 24 x 24 CSS px.
    const box = await row(page, 'p2').locator('button.salmon-data-grid-tree-toggle').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
    expect(problems).toEqual([]);
  });

  test('keyboard: Ctrl+Shift+Arrow, Ctrl+Arrow, APG ArrowLeft / ArrowRight', async ({ page }) => {
    await openTree(page, 'mode=nested');
    await cell(page, 'p1').click();
    await page.keyboard.press('Control+Shift+ArrowUp');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Control+Shift+ArrowDown');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Control+ArrowUp');
    await expect(row(page, 'p2')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Control+ArrowDown');
    await expect(row(page, 'p2')).toHaveAttribute('aria-expanded', 'true');
    // APG: ArrowLeft collapses an expanded parent; ArrowRight expands it; ArrowLeft on a child moves to the parent.
    await cell(page, 'p1').click();
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'true');
    await cell(page, 'p1b').click();
    await page.keyboard.press('ArrowLeft');
    await expect(cell(page, 'p1')).toBeFocused();
    // ArrowRight on a leaf keeps the usual cell move.
    await cell(page, 'p3').click();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, 'p3', 'id')).toBeFocused();
  });

  test('checkbox cascade: a parent selects its subtree, partial state is mixed, events carry target checkbox', async ({ page }) => {
    await openTree(page, 'mode=nested');
    await row(page, 'p1').locator('.salmon-data-grid-tree-checkbox').click();
    await expect(row(page, 'p1a1').locator('.salmon-data-grid-tree-checkbox')).toHaveAttribute('aria-checked', 'true');
    expect([...(await page.evaluate(() => window.__gridApi!.getSelectedRowIds()))].sort()).toEqual(['p1', 'p1a', 'p1a1', 'p1b']);
    await row(page, 'p1b').locator('.salmon-data-grid-tree-checkbox').click();
    await expect(row(page, 'p1').locator('.salmon-data-grid-tree-checkbox')).toHaveAttribute('aria-checked', 'mixed');
    const targets = (await events(page)).filter((e) => e.type === 'selectionChange').map((e) => e.target);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set(['checkbox']));
  });

  test('indent and outdent: Alt+Shift+Arrow and the toolbar items', async ({ page }) => {
    await openTree(page, 'mode=flat');
    await cell(page, 'f4').click();
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await expect(row(page, 'f4')).toHaveAttribute('aria-level', '2');
    expect(await page.evaluate(() => window.__gridApi!.getTreeRow('f4')?.parentId)).toBe('f1');
    await page.keyboard.press('Alt+Shift+ArrowLeft');
    await expect(row(page, 'f4')).toHaveAttribute('aria-level', '1');
    const indent = page.locator('.salmon-data-grid-toolbar__item', { hasText: /^Indent$/ });
    await cell(page, 'f5').click();
    await expect(indent).toBeEnabled();
    await indent.click();
    await expect(row(page, 'f5')).toHaveAttribute('aria-level', '2');
    expect(await page.evaluate(() => window.__gridApi!.getTreeRow('f5')?.parentId)).toBe('f4');
  });

  test('drag a row into another row', async ({ page }) => {
    await openTree(page, 'mode=flat');
    const handle = row(page, 'f5').locator('.salmon-data-grid-row-drag-handle');
    const target = await row(page, 'f4').boundingBox();
    const from = await handle.boundingBox();
    if (!target || !from) throw new Error('no boxes');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 4, from.y - 10, { steps: 4 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(row(page, 'f5')).toHaveAttribute('aria-level', '2');
    const drop = (await events(page)).find((e) => e.type === 'rowDrop');
    expect(drop).toMatchObject({ rowIds: ['f5'], position: 'into', parentId: 'f4' });
  });

  test('lazy children: spinner and aria-busy while loading, error with retry', async ({ page }) => {
    await openTree(page, 'mode=lazy&fail=1');
    await expect(row(page, 'l1')).toHaveAttribute('aria-expanded', 'false');
    await row(page, 'l1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'l1')).toHaveAttribute('aria-busy', 'true');
    await expect(row(page, 'l1').locator('button.salmon-data-grid-tree-toggle')).toHaveAttribute('data-loading', '');
    await expect(row(page, 'l1').locator('button.salmon-data-grid-tree-toggle')).toHaveAttribute('data-error', '');
    expect((await events(page)).filter((e) => e.type === 'error')).toEqual([{ type: 'error', action: 'treeChildren' }]);
    await row(page, 'l1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'l1-0')).toHaveAttribute('aria-level', '2');
    await expect(row(page, 'l1')).toHaveAttribute('aria-expanded', 'true');
  });

  test('live region announces child loading and a load error', async ({ page }) => {
    // Loads slower than the 150 ms announcement debounce, so "loading" is spoken before the result.
    await openTree(page, 'mode=lazy&fail=1&delay=600');
    // Every text the polite live regions show, in order (a message can be replaced within a frame).
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __live: string[] }).__live = seen;
      const record = () => {
        for (const el of document.querySelectorAll('.salmon-data-grid-live')) {
          const text = el.textContent ?? '';
          if (text && seen[seen.length - 1] !== text) seen.push(text);
        }
      };
      new MutationObserver(record).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    const live = () => page.evaluate(() => (window as unknown as { __live: string[] }).__live);
    await expect(page.locator('.salmon-data-grid-live').first()).toHaveAttribute('aria-live', 'polite');
    await row(page, 'l1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'l1').locator('button.salmon-data-grid-tree-toggle')).toHaveAttribute('data-error', '');
    await expect.poll(live).toEqual(expect.arrayContaining(['Loading children', 'Could not load children']));
    const first = await live();
    expect(first.indexOf('Loading children')).toBeLessThan(first.indexOf('Could not load children'));
    // The retry announces loading again, then the expanded row.
    await row(page, 'l1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'l1-0')).toHaveAttribute('aria-level', '2');
    await expect.poll(async () => (await live()).slice(first.length)).toContain('Loading children');
  });

  test('RTL: the collapsed chevron mirrors and Alt+Shift+Arrow indent keys follow the reading direction', async ({ page }) => {
    const chevron = (id: string) => row(page, id).locator('button.salmon-data-grid-tree-toggle').evaluate((el) => getComputedStyle(el, '::before').transform);
    await openTree(page, 'mode=nested');
    await row(page, 'p1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'false');
    expect(await chevron('p1')).toBe('none');
    await openTree(page, 'mode=nested&dir=rtl');
    // Expanded (pointing down) is symmetric; collapsed points toward the inline end, mirrored in RTL.
    expect(await chevron('p1')).toBe('none');
    await row(page, 'p1').locator('button.salmon-data-grid-tree-toggle').click();
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'false');
    expect(await chevron('p1')).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    // Indent is toward the inline end: Alt+Shift+ArrowLeft in RTL, outdent Alt+Shift+ArrowRight.
    await openTree(page, 'mode=flat&dir=rtl');
    await cell(page, 'f4').click();
    await page.keyboard.press('Alt+Shift+ArrowLeft');
    await expect(row(page, 'f4')).toHaveAttribute('aria-level', '2');
    expect(await page.evaluate(() => window.__gridApi!.getTreeRow('f4')?.parentId)).toBe('f1');
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await expect(row(page, 'f4')).toHaveAttribute('aria-level', '1');
  });

  test('RTL: indentation is logical and ArrowLeft expands', async ({ page }) => {
    await openTree(page, 'mode=nested&dir=rtl');
    const pad = await cell(page, 'p1a1').locator('.salmon-data-grid-tree-cell').evaluate((el) => getComputedStyle(el).paddingRight);
    expect(parseFloat(pad)).toBeGreaterThan(0);
    await cell(page, 'p1').click();
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'true');
  });

  test('axe-core: zero violations on the treegrid states', async ({ page }) => {
    await openTree(page, 'mode=nested');
    await expectClean(page, 'tree expanded');
    await row(page, 'p1b').locator('.salmon-data-grid-tree-checkbox').click();
    await expectClean(page, 'tree mixed checkbox');
    await page.evaluate(() => window.__gridApi!.collapseAllTreeRows());
    await expectClean(page, 'tree collapsed');
    await openTree(page, 'mode=flat');
    await expectClean(page, 'tree with row drag and toolbar');
  });
});
