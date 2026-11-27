import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, trackModules, waitForModule } from './helpers.ts';

// TreeView behaviour:
// APG keys, pointer selection, expansion modes, checks, lazy loading,
// rename, drag and drop, the API, virtualization, RTL and hydration.
// Page: examples/vite-spa/tree-view.html.

const URL = `${DEV_URL}tree-view.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const main = (page: Page) => page.locator('#main');
const item = (page: Page, label: string, tree = '#main') => page.locator(`${tree} [role="treeitem"]`, { has: page.locator('.salmon-tree-view-label', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
const focusedLabel = (page: Page) => page.evaluate(() => document.activeElement?.querySelector('.salmon-tree-view-label')?.textContent ?? document.activeElement?.tagName ?? '');
const visibleLabels = (page: Page, tree = '#main') =>
  page.evaluate((sel) => [...document.querySelectorAll(`${sel} [role="treeitem"]`)].sort((a, b) => (a as HTMLElement).offsetTop - (b as HTMLElement).offsetTop).map((el) => el.querySelector('.salmon-tree-view-label')?.textContent ?? ''), tree);

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  trackModules(page);
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(item(page, 'Documents')).toBeVisible();
  return problems;
}

/** Pointer drag is a lazy chunk (dnd.ts) a draggable tree attaches after mount. */
const dragReady = (page: Page) => waitForModule(page, /\/tree-view\/dnd\.js(\?|$)/);

async function focusFirst(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('Documents');
}

test.describe('TreeView keyboard', () => {
  test('arrows move focus; Right expands then enters; Left collapses then goes to the parent; Home / End', async ({ page }) => {
    const problems = await open(page);
    await focusFirst(page);
    await expect(item(page, 'Documents')).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('ArrowLeft');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
    expect(await focusedLabel(page)).toBe('Documents');
    await page.keyboard.press('ArrowRight');
    expect(await focusedLabel(page)).toBe('CV.pdf');
    await page.keyboard.press('ArrowDown');
    expect(await focusedLabel(page)).toBe('Taxes');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await focusedLabel(page)).toBe('2025.pdf');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedLabel(page)).toBe('Taxes');
    await page.keyboard.press('ArrowLeft');
    await expect(item(page, 'Taxes')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('End');
    expect(await focusedLabel(page)).toBe('Notes');
    await page.keyboard.press('Home');
    expect(await focusedLabel(page)).toBe('Documents');
    await page.keyboard.press('ArrowUp');
    expect(await focusedLabel(page)).toBe('Documents');
    expect(await page.locator('#main [tabindex="0"]').count()).toBe(1);
    expect(problems).toEqual([]);
  });

  test('* expands every sibling; typeahead jumps by label', async ({ page }) => {
    await open(page);
    await focusFirst(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('*');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'Music')).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'Pictures')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Home');
    await page.keyboard.type('m');
    expect(await focusedLabel(page)).toBe('Music');
    await page.keyboard.press('Home');
    await page.waitForTimeout(600);
    await page.keyboard.type('le');
    expect(await focusedLabel(page)).toBe('Letters');
  });

  test('Space checks, Enter selects and activates, onKeyDown preventDefault skips a key', async ({ page }) => {
    await open(page);
    await focusFirst(page);
    await clearEvents(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await expect(item(page, 'CV.pdf')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Enter');
    await expect(item(page, 'CV.pdf')).toHaveAttribute('aria-selected', 'true');
    const ev = await events(page);
    expect(ev).toContainEqual(['beforeChecked', 'cv', true, 'keyboard']);
    expect(ev).toContainEqual(['selected', ['cv'], 'cv', 'keyboard']);
    expect(ev).toContainEqual(['click', 'cv', 'keyboard']);
    await clearEvents(page);
    await page.keyboard.press('q');
    expect(await events(page)).toEqual([['userKey', 'q']]);
  });

  test('Shift+Arrow and Shift+Space extend the selection; Ctrl+A selects all', async ({ page }) => {
    await open(page);
    await focusFirst(page);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(main(page).locator('[aria-selected="true"]')).toHaveCount(3);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+Space');
    await expect(main(page).locator('[aria-selected="true"]')).toHaveCount(5);
    await page.keyboard.press('ControlOrMeta+a');
    // Every enabled item, the collapsed ones included.
    const selected = (await events(page)).filter((e) => e[0] === 'selected').pop() as [string, string[]];
    expect(selected[1]).toContain('rock');
    expect(selected[1]).not.toContain('t3');
  });

  test('F2 renames inline; Enter commits, Escape cancels, onBeforeRename vetoes', async ({ page }) => {
    await open(page);
    await focusFirst(page);
    await page.keyboard.press('End');
    await page.keyboard.press('F2');
    const input = page.locator('#main .salmon-tree-view-rename');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Notes');
    await expect(input).toHaveAttribute('aria-label', 'Rename Notes');
    await page.keyboard.type('Memo');
    await page.keyboard.press('Enter');
    await expect(item(page, 'Memo')).toBeFocused();
    expect(await events(page)).toContainEqual(['rename', 'notes', 'Memo', 'Notes']);
    await page.keyboard.press('F2');
    await page.keyboard.type('Draft');
    await page.keyboard.press('Escape');
    await expect(item(page, 'Memo')).toBeFocused();
    await page.keyboard.press('F2');
    await page.keyboard.type('veto');
    await page.keyboard.press('Enter');
    await expect(item(page, 'Memo')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __tree: { startRename(id: string): void } }).__tree.startRename('cv'));
    await expect(input).toHaveValue('CV.pdf');
  });

  test('RTL mirrors Right and Left', async ({ page }) => {
    await open(page, 'dir=rtl');
    await focusFirst(page);
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowLeft');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedLabel(page)).toBe('CV.pdf');
    const [tree, row] = await Promise.all([main(page).boundingBox(), item(page, 'CV.pdf').locator('.salmon-tree-view-twisty').boundingBox()]);
    expect(row!.x + row!.width).toBeGreaterThan(tree!.x + tree!.width - 60);
  });
});

test.describe('TreeView pointer', () => {
  test('click selects, Ctrl/Cmd toggles, Shift selects a range; the twisty toggles; double-click expands', async ({ page }) => {
    await open(page);
    await item(page, 'CV.pdf').click();
    await expect(item(page, 'CV.pdf')).toHaveAttribute('aria-selected', 'true');
    await expect(item(page, 'CV.pdf')).toBeFocused();
    await item(page, 'Letters').click({ modifiers: ['ControlOrMeta'] });
    await expect(main(page).locator('[aria-selected="true"]')).toHaveCount(2);
    await item(page, 'Pictures').click({ modifiers: ['Shift'] });
    // The range runs from the anchor (the last Ctrl/Cmd+click) and replaces the selection.
    await expect(main(page).locator('[aria-selected="true"]')).toHaveCount(2);
    await expect(item(page, 'Letters')).toHaveAttribute('aria-selected', 'true');
    await item(page, 'Music').locator('.salmon-tree-view-twisty').click();
    await expect(item(page, 'Music')).toHaveAttribute('aria-expanded', 'true');
    await item(page, 'Music').dblclick();
    await expect(item(page, 'Music')).toHaveAttribute('aria-expanded', 'false');
    expect((await events(page)).filter((e) => e[0] === 'expanded').map((e) => e[3])).toEqual(['pointer', 'pointer']);
  });

  test('expandOn click / none; checkbox click; checkOnClick', async ({ page }) => {
    await open(page, 'expandOn=click&checkOnClick=1');
    await item(page, 'Music').click();
    await expect(item(page, 'Music')).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'Music')).toHaveAttribute('aria-checked', 'true');
    await expect(item(page, 'Jazz')).toHaveAttribute('aria-checked', 'true');
    await open(page, 'expandOn=none');
    await item(page, 'Music').dblclick();
    await expect(item(page, 'Music')).toHaveAttribute('aria-expanded', 'false');
    await item(page, 'Music').locator('.salmon-tree-view-checkbox').click();
    await expect(item(page, 'Music')).toHaveAttribute('aria-checked', 'true');
    await item(page, 'Notes').locator('.salmon-tree-view-checkbox').click();
    await expect(item(page, 'Notes')).toHaveAttribute('aria-selected', 'false');
  });

  test('a click anywhere on a link row follows the link', async ({ page }) => {
    await open(page);
    await expect(item(page, 'Website').locator('a')).toHaveAttribute('href', '#site-link');
    await item(page, 'Website').locator('.salmon-tree-view-icon').click();
    await expect(page).toHaveURL(/#site-link$/);
  });

  test('onBeforeExpandedChange and onBeforeSelectedChange cancel', async ({ page }) => {
    await open(page);
    await page.evaluate(() => Object.assign(window, { __vetoMusic: true, __vetoNotes: true }));
    await item(page, 'Music').locator('.salmon-tree-view-twisty').click();
    await expect(item(page, 'Music')).toHaveAttribute('aria-expanded', 'false');
    await item(page, 'Notes').click();
    await expect(item(page, 'Notes')).toHaveAttribute('aria-selected', 'false');
    expect(await events(page)).toContainEqual(['beforeExpanded', 'music', true, 'pointer']);
  });
});

test.describe('TreeView checks', () => {
  test('cascade with mixed parents, reactive checked, the disabled child follows by default', async ({ page }) => {
    await open(page);
    await expect(item(page, 'Documents')).toHaveAttribute('aria-checked', 'mixed');
    await item(page, 'Taxes').locator('.salmon-tree-view-twisty').click();
    await item(page, 'Taxes').locator('.salmon-tree-view-checkbox').click();
    for (const l of ['2025.pdf', '2026.pdf', 'Receipts']) await expect(item(page, l)).toHaveAttribute('aria-checked', 'true');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-checked', 'mixed');
    await item(page, '2026.pdf').locator('.salmon-tree-view-checkbox').click();
    await expect(item(page, 'Taxes')).toHaveAttribute('aria-checked', 'mixed');
    await page.evaluate(() => (window as unknown as { __setChecked(ids: string[]): void }).__setChecked(['docs']));
    await expect(item(page, 'Documents')).toHaveAttribute('aria-checked', 'true');
    await expect(item(page, '2026.pdf')).toHaveAttribute('aria-checked', 'true');
    const ids = await page.evaluate(() => (window as unknown as { __tree: { getCheckedIds(): string[] } }).__tree.getCheckedIds());
    expect(ids).toEqual(['docs', 'cv', 'tax', 't1', 't2', 't3', 'letters']);
    await page.evaluate(() => (window as unknown as { __tree: { uncheckAll(): void; checkAll(ids: string[]): void } }).__tree.uncheckAll());
    await expect(item(page, 'Documents')).toHaveAttribute('aria-checked', 'false');
    await page.evaluate(() => (window as unknown as { __tree: { checkAll(ids: string[]): void } }).__tree.checkAll(['music']));
    await expect(item(page, 'Music')).toHaveAttribute('aria-checked', 'true');
  });

  test('hidden inputs follow checks and the form reset restores defaultChecked', async ({ page }) => {
    await open(page);
    const values = () => page.locator('input[type="hidden"][name="files"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(await values()).toEqual(['t1']);
    await item(page, 'Notes').locator('.salmon-tree-view-checkbox').click();
    expect(await values()).toEqual(['t1', 'notes']);
    await page.locator('#reset').click();
    await expect.poll(values).toEqual(['t1']);
    await expect(item(page, 'Notes')).toHaveAttribute('aria-checked', 'false');
  });

  test('checkPropagation none keeps items independent', async ({ page }) => {
    await open(page, 'propagation=none');
    await item(page, 'Music').locator('.salmon-tree-view-checkbox').click();
    await item(page, 'Music').locator('.salmon-tree-view-twisty').click();
    await expect(item(page, 'Jazz')).toHaveAttribute('aria-checked', 'false');
    await expect(item(page, 'Documents')).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('TreeView lazy loading', () => {
  test('first expand loads children with aria-busy; a rejection shows the error state and retry loads again', async ({ page }) => {
    await open(page);
    await item(page, 'Pictures').locator('.salmon-tree-view-twisty').click();
    await expect(item(page, 'Pictures')).toHaveAttribute('aria-busy', 'true');
    await expect(main(page)).toHaveAttribute('aria-busy', 'true');
    await expect(item(page, 'Pictures 2')).toBeVisible();
    await expect(main(page)).not.toHaveAttribute('aria-busy');
    await expect(item(page, 'Pictures 2')).toHaveAttribute('aria-level', '2');
    await item(page, 'Broken share').locator('.salmon-tree-view-twisty').click();
    await expect(item(page, 'Broken share')).toHaveAttribute('data-error', '');
    await expect(item(page, 'Broken share')).toContainText('Failed to load');
    expect(await events(page)).toContainEqual(['loadError', 'Share offline']);
    // Retry uses the sm button metrics, centred in the 32px row with the error text.
    const retry = await item(page, 'Broken share')
      .getByRole('button', { name: 'Retry' })
      .evaluate((el) => {
        const b = el.getBoundingClientRect();
        const row = el.closest('[role="treeitem"]')!.getBoundingClientRect();
        return { height: b.height, radius: getComputedStyle(el).borderTopLeftRadius, centre: b.top + b.height / 2 - (row.top + row.height / 2) };
      });
    expect(retry.height).toBe(24);
    expect(retry.radius).toBe('6px');
    expect(Math.abs(retry.centre)).toBeLessThanOrEqual(1);
    await item(page, 'Broken share').getByRole('button', { name: 'Retry' }).click();
    await expect(item(page, 'Broken share 1')).toBeVisible();
    expect((await events(page)).filter((e) => e[0] === 'load').map((e) => e[1])).toEqual(['pics', 'broken', 'broken']);
  });

  test('renderItem receives the error state', async ({ page }) => {
    await open(page, 'render=1');
    await item(page, 'Broken share').locator('.salmon-tree-view-twisty').click();
    await expect(page.locator('#main [role="treeitem"]', { hasText: 'Broken share failed' })).toBeVisible();
  });
});

test.describe('TreeView drag and drop', () => {
  async function drag(page: Page, from: string, to: string, fraction: number, fromTree = '#main', toTree = '#main'): Promise<void> {
    await dragReady(page);
    const a = (await item(page, from, fromTree).boundingBox())!;
    const b = (await item(page, to, toTree).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 2 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height * fraction, { steps: 5 });
    await expect(item(page, to, toTree)).toHaveAttribute('data-drop', fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'into');
    await page.mouse.up();
  }

  test('pointer drag reorders before / after and drops into an item; the data follows onMove', async ({ page }) => {
    await open(page);
    await drag(page, 'Notes', 'Pictures', 0.1);
    expect(await events(page)).toContainEqual(['move', ['notes'], 'pics', 'before', 'pointer', null]);
    await expect.poll(() => visibleLabels(page)).toEqual(['Documents', 'CV.pdf', 'Taxes', 'Letters', 'Notes', 'Pictures', 'Broken share', 'Music', 'Website']);
    await drag(page, 'Website', 'Letters', 0.5);
    expect(await events(page)).toContainEqual(['move', ['site'], 'letters', 'into', 'pointer', null]);
    await expect(page.locator('#main [data-drop]')).toHaveCount(0);
    await expect(item(page, 'Notes')).not.toHaveAttribute('aria-selected', 'true');
  });

  test('a drop onto its own subtree is refused; Escape cancels', async ({ page }) => {
    await open(page);
    await dragReady(page);
    const a = (await item(page, 'Documents').boundingBox())!;
    const b = (await item(page, 'CV.pdf').boundingBox())!;
    await page.mouse.move(a.x + 50, a.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + 50, b.y + 16, { steps: 5 });
    await expect(page.locator('#main [data-drop]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect((await events(page)).filter((e) => e[0] === 'move')).toEqual([]);
  });

  test('trees of one dragGroup exchange items (sourceTreeId)', async ({ page }) => {
    const problems = await open(page);
    await drag(page, 'Notes', 'Inbox', 0.9, '#main', '#second');
    expect(await events(page)).toContainEqual(['move2', ['notes'], 'inbox', 'after', 'main']);
    await expect(item(page, 'Notes', '#second')).toBeVisible();
    await expect(item(page, 'Notes')).toHaveCount(0);
    // The receiving tree announces the dropped item by its own label and clears the drop indicator.
    await expect(page.locator('#second + .salmon-tree-view-live, #second ~ .salmon-tree-view-live').first()).toHaveText('Notes moved');
    await expect(page.locator('#second [data-drop]')).toHaveCount(0);
    // The drag state is reset, so the next drag in the source tree works.
    await drag(page, 'Website', 'Letters', 0.5);
    expect(await events(page)).toContainEqual(['move', ['site'], 'letters', 'into', 'pointer', null]);
    expect(problems).toEqual([]);
  });

  test('Alt+arrows move the focused item from the keyboard and announce it', async ({ page }) => {
    await open(page);
    await focusFirst(page);
    await page.keyboard.press('End');
    await page.keyboard.press('Alt+ArrowUp');
    expect(await events(page)).toContainEqual(['move', ['notes'], 'site', 'before', 'keyboard', null]);
    await expect(page.locator('.salmon-tree-view-live').first()).toHaveText('Notes moved');
    await page.keyboard.press('Alt+ArrowRight');
    expect(await events(page)).toContainEqual(['move', ['notes'], 'music', 'into', 'keyboard', null]);
  });
});

test.describe('TreeView API and virtualization', () => {
  test('scrollToItem expands ancestors and scrolls the virtual list; focusItem keeps the row rendered', async ({ page }) => {
    await page.goto(`${URL}?perf=1&collapsed=1`);
    await expect(page.locator('#perf [role="treeitem"]').first()).toBeVisible();
    const rendered = await page.locator('#perf [role="treeitem"]').count();
    expect(rendered).toBeLessThan(60);
    await page.evaluate(() => (window as unknown as { __perf: { focusItem(id: string): void } }).__perf.focusItem('7.50.20'));
    await expect(page.locator('#perf [role="treeitem"]', { hasText: 'Alpha 20' }).and(page.locator(':focus'))).toBeVisible();
    // The ancestors were collapsed: the list grows in the same call and still scrolls the row into the viewport.
    const inView = await page.locator('#perf').evaluate((tree) => {
      const row = tree.querySelector(':focus')!.getBoundingClientRect();
      const box = tree.getBoundingClientRect();
      return tree.scrollTop > 0 && row.top >= box.top - 1 && row.bottom <= box.bottom + 1;
    });
    expect(inView).toBe(true);
    const info = await page.evaluate(() => (window as unknown as { __perf: { getItem(id: string): unknown } }).__perf.getItem('7.50.20'));
    expect(info).toMatchObject({ id: '7.50.20', level: 3, parentId: '7.50', visible: true, expanded: false });
    // Scroll far away: the focused row stays in the DOM, so Tab still lands in the tree.
    await page.locator('#perf').evaluate((el) => (el.scrollTop = 0));
    await page.waitForTimeout(100);
    await expect(page.locator('#perf [role="treeitem"][tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    expect(await focusedLabel(page)).toBe('Bravo 21');
    await page.evaluate(() => (window as unknown as { __perf: { expandAll(o?: object): void; collapseAll(o?: object): void } }).__perf.expandAll({ level: 1 }));
    await expect(page.locator('#perf [role="treeitem"]')).not.toHaveCount(0);
    const expanded = await page.evaluate(() => (window as unknown as { __perf: { getExpandedIds(): string[] } }).__perf.getExpandedIds().length);
    expect(expanded).toBe(11); // 10 roots + 7.50 (7 was expanded by focusItem)
  });

  test('textWrap measures row heights', async ({ page }) => {
    await open(page, 'wrap=1');
    await page.locator('#main').evaluate((el) => ((el as HTMLElement).style.inlineSize = '140px'));
    await page.waitForTimeout(50);
    await item(page, 'Notes').locator('.salmon-tree-view-checkbox').click(); // a commit re-measures
    const rows = await page.locator('#main [role="treeitem"]').evaluateAll((els) => els.map((e) => [(e as HTMLElement).offsetTop, (e as HTMLElement).offsetHeight]));
    const sorted = rows.sort((a, b) => a[0]! - b[0]!);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]![0]).toBeGreaterThanOrEqual(sorted[i - 1]![0]! + sorted[i - 1]![1]! - 1);
    // The twisty and checkbox sit on the first line of a wrapped label (8px from the top, as in a 32px row).
    await page.locator('#main').evaluate((el) => ((el as HTMLElement).style.inlineSize = '100px'));
    await page.waitForTimeout(50);
    await item(page, 'Notes').locator('.salmon-tree-view-checkbox').click();
    const offsets = await page.locator('#main [role="treeitem"]').evaluateAll((els) =>
      els.map((e) => {
        const row = e.getBoundingClientRect();
        return { height: row.height, twisty: e.querySelector('.salmon-tree-view-twisty')!.getBoundingClientRect().top - row.top };
      }),
    );
    expect(offsets.some((o) => o.height > 40)).toBe(true);
    for (const o of offsets) expect(Math.abs(o.twisty - 8)).toBeLessThanOrEqual(1);
  });

  test('rowHighlight label paints only behind the label text', async ({ page }) => {
    await open(page);
    await page.locator('#main').evaluate((el) => el.setAttribute('data-highlight', 'label'));
    const widths = await item(page, 'Notes').evaluate((row) => [row.getBoundingClientRect().right, row.querySelector('.salmon-tree-view-label')!.getBoundingClientRect().right]);
    expect(widths[1]).toBeLessThan(widths[0]! - 40);
  });
});

test.describe('TreeView SSR', () => {
  test('hydrates the server-rendered window without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    await expect(item(page, 'Documents')).toBeVisible();
    await item(page, 'Music').locator('.salmon-tree-view-twisty').click();
    await expect(item(page, 'Jazz')).toBeVisible();
    expect(problems).toEqual([]);
  });
});
