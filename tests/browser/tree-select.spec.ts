import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// TreeSelect behaviour: the select-only combobox with a tree popup, expansion modes,
// selectable and disabled nodes, checks, multiple selection, select all,
// chips, search, templates, ensure-visible on open, the keyboard, lazy
// loading, virtualization, forms and hydration.
// Page: examples/vite-spa/tree-select.html.

const URL = `${DEV_URL}tree-select.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const trigger = (page: Page, name: string) => page.locator(`#ts-${name} button[role="combobox"]`);
const popup = (page: Page) => page.locator('.salmon-tree-select-popup');
const tree = (page: Page) => popup(page).getByRole('tree');
const exact = (label: string) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const row = (page: Page, label: string) => popup(page).locator('[role="treeitem"]', { has: page.locator('.salmon-dropdown-option-label', { hasText: exact(label) }) });
const twisty = (page: Page, label: string) => row(page, label).locator('[data-part="twisty"]');
const shownLabels = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.salmon-tree-select-popup [role="tree"] [role="treeitem"]')]
      .sort((a, b) => (a as HTMLElement).offsetTop - (b as HTMLElement).offsetTop)
      .map((el) => el.querySelector('.salmon-dropdown-option-label')?.textContent ?? ''),
  );
/** Label of the `aria-activedescendant` row of the focused element. */
const activeLabel = (page: Page) =>
  page.evaluate(() => {
    const id = document.activeElement?.getAttribute('aria-activedescendant');
    const el = id ? document.getElementById(id) : null;
    return el ? (el.querySelector('.salmon-dropdown-option-label')?.textContent ?? null) : null;
  });
const values = (page: Page, name: string) => page.evaluate((n) => (window as unknown as { __events: Events }).__events.filter((e) => e[0] === 'value' && e[1] === n).map((e) => e[2]), name);

async function load(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(trigger(page, 'single')).toBeVisible();
  return problems;
}

async function openBy(page: Page, name: string): Promise<void> {
  await trigger(page, name).click();
  await expect(popup(page)).toBeVisible();
  await expect(tree(page).locator('[role="treeitem"]').first()).toBeVisible();
}

test.describe('TreeSelect', () => {
  test('combobox trigger with aria-haspopup="tree", open / close, aria-controls names the tree', async ({ page }) => {
    const problems = await load(page);
    const t = trigger(page, 'single');
    await expect(t).toHaveAttribute('aria-haspopup', 'tree');
    await expect(t).toHaveAttribute('aria-expanded', 'false');
    await expect(t).not.toHaveAttribute('aria-controls', /.+/);
    await expect(t).toHaveText('Q4 report.pdf');
    await t.click();
    await expect(t).toHaveAttribute('aria-expanded', 'true');
    const listId = await t.getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    const list = page.locator(`[id="${listId}"]`);
    await expect(list).toHaveAttribute('role', 'tree');
    await expect(list).toHaveAttribute('aria-labelledby', 'ts-single-label');
    await expect(t).toBeFocused();
    // The popup is portalled out of the root.
    expect(await page.locator('#ts-single .salmon-tree-select-popup').count()).toBe(0);
    await t.click();
    await expect(popup(page)).toHaveCount(0);
    await expect(t).toHaveAttribute('aria-expanded', 'false');
    await t.click();
    await expect(popup(page)).toBeVisible();
    await page.locator('#outside').click();
    await expect(popup(page)).toHaveCount(0);
    const opens = (await events(page)).filter((e) => e[0] === 'open' && e[1] === 'single').map((e) => `${e[2]}:${e[3]}`);
    expect(opens).toEqual(['true:trigger', 'false:trigger', 'true:trigger', 'false:outside']);
    expect(problems).toEqual([]);
  });

  test('server render then hydrate without warnings; the hydrated trigger opens', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toContain('aria-haspopup="tree"');
    expect(html).toContain('Q4 report.pdf');
    await openBy(page, 'single');
    await expect(row(page, 'Q4 report.pdf')).toHaveAttribute('aria-selected', 'true');
    expect(problems).toEqual([]);
  });

  test('form value, submit and reset to the default value', async ({ page }) => {
    await load(page);
    const select = page.locator('#ts-form select[name="file"]');
    await expect(select).toHaveValue('cv');
    await openBy(page, 'form');
    await row(page, 'Notes').click();
    await expect(trigger(page, 'form')).toHaveText('Notes');
    await expect(select).toHaveValue('notes');
    await page.locator('#form-submit').click();
    expect((await events(page)).filter((e) => e[0] === 'submit')).toEqual([['submit', [['file', 'notes']]]]);
    await page.locator('#form-reset').click();
    await expect(trigger(page, 'form')).toHaveText('CV.pdf');
    await expect(select).toHaveValue('cv');
    const last = (await events(page)).filter((e) => e[0] === 'value' && e[1] === 'form').pop();
    expect(last?.slice(2, 4)).toEqual(['cv', 'reset']);
  });

  test('lazy children show a loading status, a failed load shows an error with Retry', async ({ page }) => {
    const problems = await load(page);
    await openBy(page, 'lazy');
    const share = row(page, 'Team share');
    await expect(share).toHaveAttribute('aria-expanded', 'false');
    await twisty(page, 'Team share').click();
    await expect(share).toHaveAttribute('aria-busy', 'true');
    await expect(share.locator('.salmon-tree-select-status')).toHaveText('Loading…');
    await expect(row(page, 'Team share 1')).toBeVisible();
    await expect(share).not.toHaveAttribute('aria-busy', /.*/);
    await expect(share).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'Team share 3')).toHaveAttribute('aria-level', '2');
    await twisty(page, 'Broken share').click();
    const broken = row(page, 'Broken share');
    await expect(broken.locator('[data-part="retry"]')).toBeVisible();
    await expect(broken.locator('.salmon-tree-select-status[data-error]')).toContainText('Request failed');
    // Retry keeps the popup open and loads the children.
    await broken.locator('[data-part="retry"]').click();
    await expect(popup(page)).toBeVisible();
    await expect(row(page, 'Broken share 1')).toBeVisible();
    await expect(broken.locator('[data-part="retry"]')).toHaveCount(0);
    const ev = await events(page);
    expect(ev).toContainEqual(['load', 'share']);
    expect(ev).toContainEqual(['loadError', 'broken', 'Share offline']);
    expect(ev.filter((e) => e[0] === 'load' && e[1] === 'broken')).toHaveLength(2);
    // Loaded children are kept: a second expansion does not load again.
    await twisty(page, 'Team share').click();
    await twisty(page, 'Team share').click();
    await expect(row(page, 'Team share 1')).toBeVisible();
    expect((await events(page)).filter((e) => e[0] === 'load' && e[1] === 'share')).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  test('defaultExpanded and controlled expanded open the given nodes', async ({ page }) => {
    await load(page);
    await openBy(page, 'flat');
    await expect(row(page, 'Europe')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'France')).toBeVisible();
    await expect(row(page, 'Asia')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'Japan')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await openBy(page, 'multi');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'Music')).toHaveAttribute('aria-expanded', 'false');
    await twisty(page, 'Music').click();
    await expect(row(page, 'Rock')).toBeVisible();
    expect((await events(page)).filter((e) => e[0] === 'expanded' && e[1] === 'multi').pop()).toEqual(['expanded', 'multi', ['docs', 'music'], 'music', 'pointer']);
  });

  test('controlled expanded follows the prop while closed', async ({ page }) => {
    await load(page);
    await page.locator('#multi-expand-music').click();
    await openBy(page, 'multi');
    await expect(row(page, 'Music')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'Jazz')).toBeVisible();
  });

  test('expandOn="auto": a twisty toggles, a click on a selectable parent selects it', async ({ page }) => {
    await load(page);
    await openBy(page, 'single');
    await twisty(page, 'Music').click();
    await expect(row(page, 'Music')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'Jazz')).toBeVisible();
    await twisty(page, 'Music').click();
    await expect(row(page, 'Music')).toHaveAttribute('aria-expanded', 'false');
    await row(page, 'Music').click();
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger(page, 'single')).toHaveText('Music');
  });

  test('expandOn="click": a click on a parent toggles it; Enter selects it', async ({ page }) => {
    await load(page, 'expandOn=click');
    await openBy(page, 'single');
    await row(page, 'Music').click();
    await expect(row(page, 'Music')).toHaveAttribute('aria-expanded', 'true');
    await expect(popup(page)).toBeVisible();
    await row(page, 'Music').click();
    await expect(row(page, 'Music')).toHaveAttribute('aria-expanded', 'false');
    expect(await values(page, 'single')).toEqual([]);
    await page.keyboard.press('Enter');
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger(page, 'single')).toHaveText('Music');
  });

  test('expandOn="doubleClick": only a double click toggles a parent', async ({ page }) => {
    await load(page, 'expandOn=doubleClick');
    await openBy(page, 'leaves');
    await row(page, 'Documents').click();
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
    await row(page, 'Documents').dblclick();
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
    await row(page, 'Documents').dblclick();
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
    await twisty(page, 'Music').click();
    await expect(row(page, 'Music')).toHaveAttribute('aria-expanded', 'true');
  });

  test('expandOn="none": clicks do not toggle; the twisty and arrow keys do', async ({ page }) => {
    await load(page, 'expandOn=none');
    await openBy(page, 'leaves');
    await row(page, 'Documents').click();
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
    await row(page, 'Documents').dblclick();
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
    await twisty(page, 'Documents').click();
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page)).toBe('Taxes');
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Taxes')).toHaveAttribute('aria-expanded', 'true');
  });

  test('disabled nodes (and their subtree) cannot be chosen or expanded and are skipped by arrows', async ({ page }) => {
    await load(page);
    await openBy(page, 'single');
    const old = row(page, 'Old drive');
    await expect(old).toHaveAttribute('aria-disabled', 'true');
    // Playwright waits for aria-disabled elements to become enabled: force the clicks.
    await old.click({ force: true });
    await expect(popup(page)).toBeVisible();
    await twisty(page, 'Old drive').click({ force: true });
    await expect(old).toHaveAttribute('aria-expanded', 'false');
    expect(await values(page, 'single')).toEqual([]);
    await row(page, 'Notes').hover();
    expect(await activeLabel(page)).toBe('Notes');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page)).toBe('Misc 1');
    await page.keyboard.press('ArrowUp');
    expect(await activeLabel(page)).toBe('Notes');
    // A disabled leaf inside an enabled parent.
    await twisty(page, 'Documents').click();
    await twisty(page, 'Taxes').click();
    await expect(row(page, 'Receipts')).toHaveAttribute('aria-disabled', 'true');
    await row(page, 'Receipts').click({ force: true });
    await expect(popup(page)).toBeVisible();
    expect(await values(page, 'single')).toEqual([]);
  });

  test('isItemSelectable: a non-selectable parent toggles its expansion instead of selecting', async ({ page }) => {
    await load(page);
    await openBy(page, 'leaves');
    const docs = row(page, 'Documents');
    await expect(docs).not.toHaveAttribute('aria-selected', /.*/);
    await docs.click();
    await expect(docs).toHaveAttribute('aria-expanded', 'true');
    await expect(popup(page)).toBeVisible();
    expect(await values(page, 'leaves')).toEqual([]);
    // Enter on a non-selectable parent toggles it too.
    await docs.hover();
    await page.keyboard.press('Enter');
    await expect(docs).toHaveAttribute('aria-expanded', 'false');
    await docs.click();
    await row(page, 'CV.pdf').click();
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger(page, 'leaves')).toHaveText('CV.pdf');
    expect(await values(page, 'leaves')).toEqual(['cv']);
  });

  test('getItemIcon, getItemProps (title, data-*) and renderItem reach the rows', async ({ page }) => {
    await load(page);
    await openBy(page, 'single');
    const docs = row(page, 'Documents');
    await expect(docs.locator('.salmon-dropdown-option-icon')).toHaveText('D');
    await expect(docs).toHaveAttribute('title', 'Path: Documents');
    await expect(docs).toHaveAttribute('data-kind', 'folder');
    await expect(row(page, 'Notes')).toHaveAttribute('data-kind', 'file');
    await expect(row(page, 'Notes').locator('.salmon-dropdown-option-icon')).toHaveText('F');
    await page.keyboard.press('Escape');
    await openBy(page, 'flat');
    const france = popup(page).locator('[role="treeitem"]', { hasText: 'France' });
    await expect(france.locator('.demo-render')).toHaveAttribute('data-level', '2');
    await twisty(page, 'France').click();
    await popup(page).locator('[role="treeitem"]', { hasText: 'Paris' }).click();
    await expect(trigger(page, 'flat')).toHaveText('Paris');
    await openBy(page, 'flat');
    await expect(popup(page).locator('[role="treeitem"][aria-selected="true"] .demo-render')).toHaveText('Paris (chosen)');
    await expect(popup(page).locator('[role="treeitem"][aria-selected="true"]')).toHaveAttribute('aria-level', '3');
  });

  test('checkbox cascade: a parent checks its subtree, a child makes its parent mixed, the value holds every checked node', async ({ page }) => {
    await load(page);
    await openBy(page, 'checkbox');
    const tax = row(page, 'Taxes');
    await expect(tax).toHaveAttribute('aria-checked', 'false');
    await expect(tax).not.toHaveAttribute('aria-selected', /.*/);
    await tax.click();
    await expect(tax).toHaveAttribute('aria-checked', 'true');
    await expect(row(page, '2025.pdf')).toHaveAttribute('aria-checked', 'true');
    await expect(row(page, '2026.pdf')).toHaveAttribute('aria-checked', 'true');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-checked', 'mixed');
    await expect(popup(page)).toBeVisible();
    let last = (await values(page, 'checkbox')).pop() as string[];
    expect(last).toEqual(expect.arrayContaining(['tax', 't2025', 't2026']));
    expect(last).not.toContain('docs');
    // A child unchecked: the parent turns mixed.
    await row(page, '2025.pdf').click();
    await expect(tax).toHaveAttribute('aria-checked', 'mixed');
    last = (await values(page, 'checkbox')).pop() as string[];
    expect(last).toEqual(expect.arrayContaining(['t2026']));
    expect(last).not.toContain('tax');
    expect(last).not.toContain('t2025');
    // A child checked in a collapsed parent.
    await twisty(page, 'Music').click();
    await row(page, 'Jazz').click();
    await expect(row(page, 'Music')).toHaveAttribute('aria-checked', 'mixed');
    await row(page, 'Rock').click();
    await expect(row(page, 'Music')).toHaveAttribute('aria-checked', 'true');
    last = (await values(page, 'checkbox')).pop() as string[];
    expect(last).toEqual(expect.arrayContaining(['music', 'jazz', 'rock', 't2026']));
    await expect(trigger(page, 'checkbox').locator('.salmon-tree-select-chip').first()).toBeVisible();
  });

  test('multiple toggles nodes and keeps the popup open; Shift+click selects the range', async ({ page }) => {
    await load(page);
    await openBy(page, 'multi');
    await expect(tree(page)).toHaveAttribute('aria-multiselectable', 'true');
    await row(page, 'CV.pdf').click();
    await row(page, 'Letters').click();
    await expect(row(page, 'CV.pdf')).toHaveAttribute('aria-selected', 'true');
    await expect(row(page, 'Letters')).toHaveAttribute('aria-selected', 'true');
    await expect(popup(page)).toBeVisible();
    await row(page, 'CV.pdf').click();
    await expect(row(page, 'CV.pdf')).toHaveAttribute('aria-selected', 'false');
    expect(await values(page, 'multi')).toEqual([['cv'], ['cv', 'letters'], ['letters']]);
    await expect(trigger(page, 'multi')).toHaveText('Letters');
    // Range: from the last clicked node to the Shift+clicked one, over the shown rows.
    await clearEvents(page);
    await row(page, 'Music').click();
    await row(page, 'Notes').click({ modifiers: ['Shift'] });
    const last = (await values(page, 'multi')).pop() as string[];
    expect([...last].sort()).toEqual(['letters', 'music', 'notes', 'pics']);
    await expect(row(page, 'Pictures')).toHaveAttribute('aria-selected', 'true');
  });

  test('Select all checks every node and turns into Deselect all', async ({ page }) => {
    await load(page);
    await openBy(page, 'checkbox');
    const all = popup(page).locator('.salmon-tree-select-select-all');
    await expect(all).toHaveText('Select all');
    await expect(all).toHaveAttribute('aria-checked', 'false');
    await expect(tree(page)).toHaveAttribute('aria-owns', (await all.getAttribute('id')) as string);
    await row(page, 'CV.pdf').click();
    await expect(all).toHaveAttribute('aria-checked', 'mixed');
    await all.click();
    await expect(all).toHaveText('Deselect all');
    await expect(all).toHaveAttribute('aria-checked', 'true');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-checked', 'true');
    await expect(row(page, 'Notes')).toHaveAttribute('aria-checked', 'true');
    const checked = (await values(page, 'checkbox')).pop() as string[];
    expect(checked).toEqual(expect.arrayContaining(['docs', 'cv', 'music', 'jazz', 'rock', 'pics', 'notes']));
    await all.click();
    await expect(all).toHaveText('Select all');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-checked', 'false');
    expect((await values(page, 'checkbox')).pop()).toEqual([]);
    // From the keyboard: Up from the first row reaches Select all.
    await row(page, 'Documents').hover();
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-activedescendant'))).toBe(await all.getAttribute('id'));
    await page.keyboard.press('Enter');
    await expect(all).toHaveText('Deselect all');
  });

  test('chips wrap onto several lines in a narrow trigger', async ({ page }) => {
    await load(page);
    const t = trigger(page, 'checkbox');
    const before = (await t.boundingBox())!.height;
    await openBy(page, 'checkbox');
    await popup(page).locator('.salmon-tree-select-select-all').click();
    await page.keyboard.press('Escape');
    const chips = t.locator('.salmon-tree-select-chip');
    expect(await chips.count()).toBeGreaterThan(5);
    const tops = await chips.evaluateAll((els) => [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().top)))]);
    expect(tops.length).toBeGreaterThan(1);
    const after = (await t.boundingBox())!.height;
    expect(after).toBeGreaterThan(before + 20);
    // Chips stay inside the trigger.
    const tb = (await t.boundingBox())!;
    const lastChip = (await chips.last().boundingBox())!;
    expect(lastChip.y + lastChip.height).toBeLessThanOrEqual(tb.y + tb.height);
    expect((await chips.first().boundingBox())!.width).toBeLessThanOrEqual(tb.width);
  });

  test('search keeps ancestors, the first match becomes active, Escape clears then closes', async ({ page }) => {
    const problems = await load(page);
    await openBy(page, 'search');
    const input = popup(page).locator('input[role="combobox"]');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('placeholder', 'Find a file');
    await page.keyboard.type('report');
    await expect.poll(() => shownLabels(page)).toEqual(['Archive', '2019', 'Q3', 'Q3 report.pdf', 'Q4', 'Q4 report.pdf']);
    expect(await activeLabel(page)).toBe('Q3 report.pdf');
    await expect(row(page, 'Q4')).toHaveAttribute('aria-setsize', '2');
    await expect(row(page, 'Q4 report.pdf')).toHaveAttribute('aria-setsize', '1');
    await expect(row(page, 'Q4 report.pdf').locator('mark')).toHaveText('report');
    await expect(popup(page).locator('.salmon-dropdown-live')).toHaveText('2 results');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page)).toBe('Q4');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger(page, 'search')).toHaveText('Q4 report.pdf');
    await openBy(page, 'search');
    await page.keyboard.type('zzz');
    await expect(popup(page).locator('.demo-empty')).toHaveText('Nothing matches');
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('');
    await expect(popup(page)).toBeVisible();
    await expect(row(page, 'Documents')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger(page, 'search')).toBeFocused();
    const searches = (await events(page)).filter((e) => e[0] === 'search').map((e) => e[2]);
    expect(searches).toContain('report');
    expect(searches.at(-1)).toBe('');
    expect(problems).toEqual([]);
  });

  test('popupHeader, popupFooter and renderEmpty render in the popup', async ({ page }) => {
    await load(page);
    await openBy(page, 'single');
    await expect(popup(page).locator('.salmon-dropdown-popup-header')).toHaveText('Recent files');
    await expect(popup(page).locator('.salmon-dropdown-popup-footer')).toHaveText('Footer text');
    await page.keyboard.press('Escape');
    await trigger(page, 'empty').click();
    await expect(popup(page).locator('.demo-empty')).toHaveText('No files');
    await expect(popup(page).locator('[role="treeitem"]')).toHaveCount(0);
  });

  test('opening with a deep value expands its ancestors and scrolls the active row into view', async ({ page }) => {
    await load(page);
    await trigger(page, 'single').click();
    const target = row(page, 'Q4 report.pdf');
    await expect(target).toHaveAttribute('aria-selected', 'true');
    for (const label of ['Archive', '2019', 'Q4']) await expect(row(page, label)).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'Q3')).toHaveAttribute('aria-expanded', 'false');
    expect(await activeLabel(page)).toBe('Q4 report.pdf');
    const vp = (await tree(page).boundingBox())!;
    const r = (await target.boundingBox())!;
    expect(r.y).toBeGreaterThanOrEqual(vp.y - 1);
    expect(r.y + r.height).toBeLessThanOrEqual(vp.y + vp.height + 1);
    expect(await tree(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const expanded = (await events(page)).filter((e) => e[0] === 'expanded' && e[1] === 'single').pop();
    expect(expanded?.[2]).toEqual(expect.arrayContaining(['archive', 'y2019', 'q4']));
  });

  test('onKeyDown on the trigger receives the keys, closed and open', async ({ page }) => {
    await load(page);
    await trigger(page, 'single').focus();
    await page.keyboard.press('x');
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('ArrowUp');
    const keys = (await events(page)).filter((e) => e[0] === 'key').map((e) => e[2]);
    expect(keys).toEqual(['x', 'ArrowDown', 'ArrowUp']);
  });

  test('open keys, arrows, Right / Left expand and collapse, Home / End, Enter selects and closes', async ({ page }) => {
    const problems = await load(page);
    const t = trigger(page, 'single');
    await t.focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(popup(page)).toBeVisible();
    await expect(t).toBeFocused();
    await expect.poll(() => activeLabel(page)).toBe('Q4 report.pdf');
    await page.keyboard.press('Home');
    expect(await activeLabel(page)).toBe('Documents');
    await expect(row(page, 'Documents')).toHaveAttribute('data-active', '');
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
    expect(await activeLabel(page)).toBe('Documents');
    await page.keyboard.press('ArrowRight');
    expect(await activeLabel(page)).toBe('CV.pdf');
    await page.keyboard.press('ArrowRight');
    expect(await activeLabel(page)).toBe('CV.pdf');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page)).toBe('Taxes');
    await page.keyboard.press('ArrowLeft');
    expect(await activeLabel(page)).toBe('Documents');
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
    expect(await activeLabel(page)).toBe('Documents');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page)).toBe('Music');
    await page.keyboard.press('ArrowUp');
    expect(await activeLabel(page)).toBe('Documents');
    await page.keyboard.press('End');
    expect(await activeLabel(page)).toBe('Q4 report.pdf');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page)).toBe('Notes');
    await page.keyboard.press('Enter');
    await expect(popup(page)).toHaveCount(0);
    await expect(t).toHaveText('Notes');
    await expect(t).toBeFocused();
    await expect(t).not.toHaveAttribute('aria-activedescendant', /.*/);
    expect(await values(page, 'single')).toEqual(['notes']);
    // The next open starts at the new value.
    await page.keyboard.press('ArrowUp');
    await expect(popup(page)).toBeVisible();
    await expect.poll(() => activeLabel(page)).toBe('Notes');
    expect(problems).toEqual([]);
  });

  test('Enter / Space open, Escape closes without change, Tab closes, Alt+Up commits and closes, type-ahead', async ({ page }) => {
    await load(page);
    const t = trigger(page, 'single');
    await t.focus();
    await page.keyboard.press('Enter');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Home');
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(t).toBeFocused();
    await expect(t).toHaveText('Q4 report.pdf');
    await page.keyboard.press('Space');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(popup(page)).toHaveCount(0);
    await expect(t).not.toBeFocused();
    await t.focus();
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('p');
    await expect.poll(() => activeLabel(page)).toBe('Pictures');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(popup(page)).toHaveCount(0);
    await expect(t).toHaveText('Pictures');
    const opens = (await events(page)).filter((e) => e[0] === 'open' && e[1] === 'single' && e[2] === false).map((e) => e[3]);
    // Alt+Up commits the active node, so the close reason is the selection.
    expect(opens).toEqual(['escape', 'tab', 'select']);
  });

  test('Space toggles the checkbox of the active node and keeps the popup open', async ({ page }) => {
    await load(page);
    const t = trigger(page, 'checkbox');
    await t.focus();
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await expect.poll(() => activeLabel(page)).toBe('Documents');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page)).toBe('CV.pdf');
    await page.keyboard.press('Space');
    await expect(row(page, 'CV.pdf')).toHaveAttribute('aria-checked', 'true');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-checked', 'mixed');
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Space');
    await expect(row(page, 'CV.pdf')).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Enter');
    await expect(row(page, 'CV.pdf')).toHaveAttribute('aria-checked', 'true');
    expect(await values(page, 'checkbox')).toEqual([['cv'], [], ['cv']]);
  });

  test('RTL mirrors Left / Right', async ({ page }) => {
    await load(page);
    const t = trigger(page, 'rtl');
    await t.focus();
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toBeVisible();
    await expect.poll(() => activeLabel(page)).toBe('Documents');
    await expect(popup(page)).toHaveCSS('direction', 'rtl');
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowLeft');
    expect(await activeLabel(page)).toBe('CV.pdf');
    await page.keyboard.press('ArrowRight');
    expect(await activeLabel(page)).toBe('Documents');
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Documents')).toHaveAttribute('aria-expanded', 'false');
    // Rows are indented from the right edge.
    await page.keyboard.press('ArrowLeft');
    const docs = (await row(page, 'Documents').locator('.salmon-dropdown-option-label').boundingBox())!;
    const cv = (await row(page, 'CV.pdf').locator('.salmon-dropdown-option-label').boundingBox())!;
    expect(cv.x + cv.width).toBeLessThan(docs.x + docs.width);
  });

  test('virtualization (DDPERF): ~10k nodes keep the DOM bounded, scrolling renders new rows, the active row stays rendered', async ({ page }) => {
    const problems = await load(page);
    await openBy(page, 'big');
    const list = tree(page);
    await expect(list).toHaveAttribute('data-virtual', '');
    const count = () => list.locator('[role="treeitem"]').count();
    expect(await count()).toBeLessThan(60);
    await expect(row(page, 'Root 0')).toHaveAttribute('aria-setsize', '10');
    await expect(row(page, 'Branch 0.0')).toHaveAttribute('aria-setsize', '100');
    expect(await activeLabel(page)).toBe('Root 0');
    const activeId = await trigger(page, 'big').getAttribute('aria-activedescendant');
    // 1,010 shown rows: scroll to the middle.
    await list.evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
    await expect.poll(async () => (await shownLabels(page)).some((l) => /^Branch [45]\./.test(l))).toBe(true);
    expect(await count()).toBeLessThan(60);
    // The active row is kept out of the window so aria-activedescendant resolves.
    expect(await page.evaluate((id) => document.getElementById(id!) !== null, activeId)).toBe(true);
    // End goes to the last row and reveals it.
    await page.keyboard.press('End');
    expect(await activeLabel(page)).toBe('Branch 9.99');
    const lastRow = row(page, 'Branch 9.99');
    const vp = (await list.boundingBox())!;
    const r = (await lastRow.boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(vp.y + vp.height + 1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await activeLabel(page)).toBe('Leaf 9.99.0');
    await page.keyboard.press('Enter');
    await expect(trigger(page, 'big')).toHaveText('Leaf 9.99.0');
    // Re-open: the selected deep node is active and visible.
    await openBy(page, 'big');
    await expect.poll(() => activeLabel(page)).toBe('Leaf 9.99.0');
    const r2 = (await row(page, 'Leaf 9.99.0').boundingBox())!;
    const vp2 = (await list.boundingBox())!;
    expect(r2.y).toBeGreaterThanOrEqual(vp2.y - 1);
    expect(r2.y + r2.height).toBeLessThanOrEqual(vp2.y + vp2.height + 1);
    expect(await count()).toBeLessThan(60);
    expect(problems).toEqual([]);
  });
});
