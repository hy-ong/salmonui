import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEV_URL, trackModules, waitForModule } from './helpers.ts';

// Listbox behaviour on examples/vite-spa/listbox.html.

const url = (query: string) => `${DEV_URL}listbox.html?${query}`;

async function open(page: Page, query: string): Promise<Locator> {
  trackModules(page);
  await page.goto(url(query));
  const list = page.getByRole('listbox').first();
  await expect(list).toBeAttached();
  // The searchable `big` list loads its search index chunk after the first paint (Listbox.tsx); typing
  // earlier filters only once it arrives, and its arrival re-renders the visible options.
  if (query.includes('case=big')) await waitForModule(page, /\/internal\/collection\/search\.js(\?|$)/);
  // The `dual` lists register as drop targets from the drag chunk after mount; a press before that does not drag.
  if (query.includes('case=dual')) await waitForModule(page, /\/listbox\/drag\.js(\?|$)/);
  return list;
}

async function activeLabel(page: Page, list: Locator): Promise<string | null> {
  const id = await list.getAttribute('aria-activedescendant');
  if (!id) return null;
  return page.locator(`[id="${id}"]`).innerText();
}

const changes = (page: Page) => page.evaluate(() => window.__changes);
const events = (page: Page) => page.evaluate(() => (window as unknown as { __lbEvents: { type: string; detail: unknown }[] }).__lbEvents);
const selectedLabels = (list: Locator) => list.locator('[role="option"][aria-selected="true"]').allInnerTexts();

test.describe('Listbox single selection', () => {
  test('focus activates the first option; arrows move and select, skipping disabled', async ({ page }) => {
    const list = await open(page, 'case=basic');
    await list.focus();
    expect(await activeLabel(page, list)).toBe('Apple');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page, list)).toBe('Apricot');
    await expect(page.getByTestId('value')).toHaveText('apricot');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page, list)).toBe('Blueberry');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page, list), 'Cherry is disabled and skipped').toBe('Date');
    await page.keyboard.press('End');
    expect(await activeLabel(page, list)).toBe('Mango');
    await page.keyboard.press('Home');
    expect(await activeLabel(page, list)).toBe('Apple');
    // Page Down moves by maxVisibleItems (8) enabled options.
    await page.keyboard.press('PageDown');
    expect(await activeLabel(page, list)).toBe('Kiwi');
    const last = (await changes(page)).at(-1)!;
    expect(last).toMatchObject({ value: 'kiwi', reason: 'select', source: 'keyboard' });
    expect((last.items[0] as { label: string }).label).toBe('Kiwi');
    // Ctrl+arrow moves focus without selecting.
    await page.keyboard.press('Control+ArrowDown');
    expect(await activeLabel(page, list)).toBe('Lemon');
    await expect(page.getByTestId('value')).toHaveText('kiwi');
  });

  test('type-ahead selects by prefix, cycles a repeated letter', async ({ page }) => {
    const list = await open(page, 'case=basic');
    await list.focus();
    await page.keyboard.press('g');
    expect(await activeLabel(page, list)).toBe('Grape');
    await page.waitForTimeout(600);
    await page.keyboard.press('b');
    expect(await activeLabel(page, list)).toBe('Banana');
    await page.keyboard.press('b');
    expect(await activeLabel(page, list)).toBe('Blueberry');
    await page.waitForTimeout(600);
    await page.keyboard.type('el');
    expect(await activeLabel(page, list)).toBe('Elderberry');
    await expect(page.getByTestId('value')).toHaveText('elderberry');
  });

  test('click selects with a pointer source; disabled options ignore clicks', async ({ page }) => {
    const list = await open(page, 'case=basic');
    await list.getByRole('option', { name: 'Kiwi' }).click();
    await expect(page.getByTestId('value')).toHaveText('kiwi');
    expect((await changes(page)).at(-1)).toMatchObject({ reason: 'select', source: 'pointer' });
    await list.getByRole('option', { name: 'Cherry' }).click({ force: true });
    await expect(page.getByTestId('value')).toHaveText('kiwi');
    await expect(list.getByRole('option', { name: 'Kiwi' })).toHaveAttribute('aria-selected', 'true');
  });

  test('duplicate values log one development warning', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    await open(page, 'case=basic&dupes');
    await expect.poll(() => warnings.filter((w) => w.includes('item values must be unique')).length).toBe(1);
    expect(warnings.find((w) => w.includes('unique'))).toMatch(/^\[salmonui\] Listbox ".+": item values must be unique; duplicates: apple\./);
    await page.goto(url('case=basic'));
    expect(warnings.filter((w) => w.includes('unique'))).toHaveLength(1);
  });

  test('a moved active option re-renders two options only', async ({ page }) => {
    const list = await open(page, 'case=big&n=2000&count');
    await list.focus();
    await page.keyboard.press('Control+ArrowDown');
    await page.evaluate(() => (window.__optionRenders = 0));
    await page.keyboard.press('Control+ArrowDown');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // StrictMode doubles render calls in development.
    expect(await page.evaluate(() => window.__optionRenders)).toBeLessThanOrEqual(2 * 2);
  });
});

test.describe('Listbox multiple selection', () => {
  test('click and Space toggle; Shift+arrows toggle; Ctrl+A selects all enabled', async ({ page }) => {
    const list = await open(page, 'case=multiple');
    await expect(list).toHaveAttribute('aria-multiselectable', 'true');
    expect(await selectedLabels(list)).toEqual(['Banana']);
    await list.getByRole('option', { name: 'Apple' }).click();
    expect(await selectedLabels(list)).toEqual(['Apple', 'Banana']);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    expect(await selectedLabels(list)).toEqual(['Apple', 'Apricot', 'Banana']);
    await page.keyboard.press('Space');
    expect(await selectedLabels(list)).toEqual(['Apple', 'Banana']);
    // Down without Shift moves focus only (APG recommended model).
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page, list)).toBe('Blueberry');
    expect(await selectedLabels(list)).toEqual(['Apple', 'Banana']);
    await page.keyboard.press('Shift+ArrowDown');
    expect(await activeLabel(page, list)).toBe('Date');
    expect(await selectedLabels(list)).toEqual(['Apple', 'Banana', 'Date']);
    await page.keyboard.press('Control+a');
    expect(await selectedLabels(list)).toHaveLength(11);
    expect(await list.getByRole('option', { name: 'Cherry' }).getAttribute('aria-selected')).toBe('false');
    expect((await changes(page)).at(-1)).toMatchObject({ reason: 'selectAll', source: 'keyboard' });
    await page.keyboard.press('Control+a');
    expect(await selectedLabels(list)).toEqual([]);
    // Ctrl+Shift+End selects from the active option to the last.
    await page.keyboard.press('Home');
    await page.keyboard.press('Control+ArrowDown');
    await page.keyboard.press('Control+ArrowDown');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page, list)).toBe('Kiwi');
    await page.keyboard.press('Control+Shift+End');
    expect(await selectedLabels(list)).toEqual(['Kiwi', 'Lemon', 'Mango']);
    // Shift+click selects the range from the anchor.
    await list.getByRole('option', { name: 'Apple' }).click();
    await list.getByRole('option', { name: 'Blueberry' }).click({ modifiers: ['Shift'] });
    expect(await selectedLabels(list)).toEqual(['Apple', 'Apricot', 'Banana', 'Blueberry', 'Kiwi', 'Lemon', 'Mango']);
  });

  test('Shift+Space selects from the anchor kept across focus moves (APG listbox)', async ({ page }) => {
    const list = await open(page, 'case=multiple');
    expect(await selectedLabels(list)).toEqual(['Banana']);
    // Clicking Apple selects it and sets the anchor; plain arrows only move focus.
    await list.getByRole('option', { name: 'Apple' }).click();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page, list)).toBe('Blueberry');
    await page.keyboard.press('Shift+Space');
    expect(await selectedLabels(list)).toEqual(['Apple', 'Apricot', 'Banana', 'Blueberry']);
    // Shift+Arrow moves focus and toggles the option it lands on; that option becomes the anchor.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    expect(await activeLabel(page, list)).toBe('Fig');
    expect(await selectedLabels(list)).toEqual(['Apple', 'Apricot', 'Banana', 'Blueberry', 'Fig']);
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    expect(await selectedLabels(list)).toEqual(['Apple', 'Apricot', 'Banana', 'Blueberry', 'Fig', 'Grape', 'Kiwi']);
    // Shift+Arrow back onto a selected option deselects it (toggle, APG).
    await page.keyboard.press('Shift+ArrowUp');
    expect(await activeLabel(page, list)).toBe('Grape');
    expect(await selectedLabels(list)).toEqual(['Apple', 'Apricot', 'Banana', 'Blueberry', 'Fig', 'Kiwi']);
  });

  test('checkbox indicator and the select all checkbox', async ({ page }) => {
    const list = await open(page, 'case=multiple');
    await expect(list.locator('.salmon-listbox-checkbox')).toHaveCount(12);
    const all = page.getByRole('checkbox', { name: 'Select all' });
    expect(await all.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
    await all.click();
    expect(await selectedLabels(list)).toHaveLength(11);
    await expect(all).toBeChecked();
    await all.click();
    expect(await selectedLabels(list)).toEqual([]);
    await expect(all).not.toBeChecked();
  });

  test('maxSelected disables further options and announces the limit', async ({ page }) => {
    const list = await open(page, 'case=multiple&max=2');
    await list.getByRole('option', { name: 'Apple' }).click();
    expect(await selectedLabels(list)).toEqual(['Apple', 'Banana']);
    await expect(list.getByRole('option', { name: 'Date' })).toHaveAttribute('aria-disabled', 'true');
    await list.focus();
    await page.keyboard.press('Control+a');
    await expect(page.getByRole('status')).toHaveText('Selection limit of 2 reached');
    expect(await selectedLabels(list)).toEqual(['Apple', 'Banana']);
  });
});

test.describe('Listbox virtualization and search', () => {
  test('100,000 items keep a bounded DOM; End reaches the last item', async ({ page }) => {
    const list = await open(page, 'case=big');
    expect(await list.locator('[role="option"]').count()).toBeLessThanOrEqual(8 + 2 * 6);
    await list.focus();
    await page.keyboard.press('End');
    await expect.poll(() => activeLabel(page, list)).toBe('Øresund 99999');
    await expect(list.locator('[role="option"][aria-posinset="100000"]')).toHaveAttribute('aria-setsize', '100000');
    expect(await list.locator('[role="option"]').count()).toBeLessThanOrEqual(8 + 2 * 6 + 1);
    // Scrolling away keeps the active option mounted (aria-activedescendant target).
    await list.evaluate((el) => (el.scrollTop = 0));
    await expect.poll(() => list.locator('[role="option"][aria-posinset="1"]').count()).toBe(1);
    const id = await list.getAttribute('aria-activedescendant');
    await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    expect(await list.locator('[role="option"]').count()).toBeLessThanOrEqual(8 + 2 * 6 + 1);
  });

  test('typing filters, resets to the top, highlights and announces the count', async ({ page }) => {
    const list = await open(page, 'case=big');
    await list.evaluate((el) => (el.scrollTop = 50_000));
    const search = page.getByRole('searchbox', { name: 'Search' });
    await search.fill('zur');
    await expect(list.locator('[role="option"]').first()).toHaveAttribute('aria-posinset', '1');
    const count = Math.ceil(100_000 / 12);
    await expect(list.locator('[role="option"]').first()).toHaveAttribute('aria-setsize', String(count));
    await expect(list.locator('mark.salmon-listbox__match').first()).toHaveText('Zür');
    await expect(page.getByRole('status')).toHaveText(`${count.toLocaleString('en').replace(/,/g, '')} results`);
    expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
    // Arrow keys in the search field move the active option; Enter selects it.
    await page.keyboard.press('ArrowDown');
    expect(await search.getAttribute('aria-activedescendant')).toBe(await list.getAttribute('aria-activedescendant'));
    await page.keyboard.press('Enter');
    expect((await changes(page)).at(-1)).toMatchObject({ reason: 'select', source: 'keyboard' });
    // Escape clears the search and restores the list.
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await expect(list.locator('[role="option"]').first()).toHaveAttribute('aria-setsize', '100000');
    await search.fill('zzz');
    await expect(page.locator('.salmon-listbox-empty')).toHaveText('No matches found');
  });

  test('contains operator', async ({ page }) => {
    const list = await open(page, 'case=big&n=200&op=contains');
    await page.getByRole('searchbox').fill('1');
    const labels = await list.locator('[role="option"]').allInnerTexts();
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l).toContain('1');
  });

  test('grouped lists render group containers and a sticky header', async ({ page }) => {
    const list = await open(page, 'case=grouped');
    await expect(list.locator('[role="group"][aria-label="Africa"]')).toHaveCount(1);
    await expect(list.locator('[role="option"][aria-posinset="1"]')).toHaveAttribute('aria-setsize', '1000');
    await list.evaluate((el) => (el.scrollTop = 32 * 450));
    await expect(page.locator('.salmon-listbox-sticky')).toHaveText('Asia');
    await expect(list.locator('[role="group"][aria-label="Asia"]')).toHaveCount(1);
    await list.evaluate((el) => (el.scrollTop = 32 * 700));
    await expect(page.locator('.salmon-listbox-sticky')).toHaveText('Europe');
  });
});

test.describe('Listbox reorder and dual list', () => {
  test('Alt+ArrowUp / Alt+ArrowDown reorder and announce', async ({ page }) => {
    const list = await open(page, 'case=dual');
    await list.focus();
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page, list)).toBe('Apricot');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.getByTestId('left-order')).toHaveText('apple,banana,apricot,blueberry,cherry,date');
    await expect(page.locator('#left').locator('xpath=..').getByRole('status')).toHaveText('Apricot moved to position 3 of 6');
    expect(await activeLabel(page, list), 'the active option follows the moved item').toBe('Apricot');
    await page.keyboard.press('Alt+ArrowUp');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(page.getByTestId('left-order')).toHaveText('apricot,apple,banana,blueberry,cherry,date');
    // Selected items move as a block.
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.getByTestId('left-order')).toHaveText('banana,apricot,apple,blueberry,cherry,date');
    const reorder = (await events(page)).filter((e) => e.type === 'reorder:left').at(-1)!;
    expect(reorder.detail).toMatchObject({ delta: 1, source: 'keyboard' });
  });

  test('moveItems buttons move selected and all items between lists', async ({ page }) => {
    const left = await open(page, 'case=dual');
    await left.getByRole('option', { name: 'Banana' }).click();
    await left.getByRole('option', { name: 'Date' }).click();
    await page.getByTestId('to-right').click();
    await expect(page.getByTestId('left-order')).toHaveText('apple,apricot,blueberry,cherry');
    await expect(page.getByTestId('right-order')).toHaveText('elderberry,fig,grape,kiwi,lemon,mango,banana,date');
    await page.getByTestId('all-left').click();
    await expect(page.getByTestId('right-order')).toHaveText('');
    await expect(page.getByTestId('left-order')).toHaveText('apple,apricot,blueberry,cherry,elderberry,fig,grape,kiwi,lemon,mango,banana,date');
  });

  test('drag reorders within a list', async ({ page }) => {
    const list = await open(page, 'case=dual');
    const apple = list.getByRole('option', { name: 'Apple' });
    const date = list.getByRole('option', { name: 'Date' });
    const from = (await apple.boundingBox())!;
    const to = (await date.boundingBox())!;
    await page.mouse.move(from.x + 20, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + from.height / 2 + 10, { steps: 2 });
    await expect(page.locator('.salmon-listbox-drag-ghost')).toHaveText('Apple');
    await page.mouse.move(to.x + 20, to.y + 2, { steps: 8 });
    await expect(page.locator('.salmon-listbox-drop-indicator')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.getByTestId('left-order')).toHaveText('apricot,banana,blueberry,cherry,apple,date');
    await expect(page.locator('.salmon-listbox-drag-ghost')).toHaveCount(0);
    const ev = await events(page);
    expect(ev.some((e) => e.type === 'dragstart:left')).toBe(true);
    expect(ev.some((e) => e.type === 'drag:left')).toBe(true);
    expect(ev.filter((e) => e.type === 'reorder:left').at(-1)!.detail).toMatchObject({ values: ['apple'], toIndex: 5, delta: null, source: 'pointer' });
    // A drag does not select (the click after the drag is suppressed).
    expect(await selectedLabels(list)).toEqual([]);
  });

  test('drag moves the selected items to another list of the same dragGroup', async ({ page }) => {
    const left = await open(page, 'case=dual');
    await left.getByRole('option', { name: 'Apple' }).click();
    await left.getByRole('option', { name: 'Banana' }).click();
    const right = page.locator('#right');
    const from = (await left.getByRole('option', { name: 'Banana' }).boundingBox())!;
    const target = (await right.getByRole('option', { name: 'Fig' }).boundingBox())!;
    await page.mouse.move(from.x + 20, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 20, target.y + 2, { steps: 10 });
    await expect(page.locator('.salmon-listbox-drag-ghost')).toHaveText('Banana +1', { useInnerText: true });
    await expect(right).toHaveAttribute('data-drop-target', '');
    await page.mouse.up();
    await expect(page.getByTestId('right-order')).toHaveText('elderberry,apple,banana,fig,grape,kiwi,lemon,mango');
    await expect(page.getByTestId('left-order')).toHaveText('apricot,blueberry,cherry,date');
    expect((await events(page)).find((e) => e.type === 'drop:right')!.detail).toMatchObject({ values: ['apple', 'banana'], fromList: 'left', toIndex: 1 });
  });

  test('onItemDragStart preventDefault cancels; Escape cancels a drag', async ({ page }) => {
    const list = await open(page, 'case=dual&nodrag');
    const box = (await list.getByRole('option', { name: 'Apple' }).boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 100, { steps: 6 });
    await expect(page.locator('.salmon-listbox-drag-ghost')).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByTestId('left-order')).toHaveText('apple,apricot,banana,blueberry,cherry,date');

    const list2 = await open(page, 'case=dual');
    const b2 = (await list2.getByRole('option', { name: 'Apple' }).boundingBox())!;
    await page.mouse.move(b2.x + 20, b2.y + 10);
    await page.mouse.down();
    await page.mouse.move(b2.x + 20, b2.y + 120, { steps: 6 });
    await expect(page.locator('.salmon-listbox-drag-ghost')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.salmon-listbox-drag-ghost')).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByTestId('left-order')).toHaveText('apple,apricot,banana,blueberry,cherry,date');
  });
});

test.describe('Listbox forms', () => {
  test('submits the value through the hidden select and restores it on reset', async ({ page }) => {
    await page.goto(url('case=form'));
    await page.getByRole('button', { name: 'Submit' }).click();
    expect(await page.evaluate(() => window.__submitted)).toEqual([
      ['fruit', 'banana'],
      ['basket', 'apple'],
      ['basket', 'kiwi'],
    ]);
    const lists = page.getByRole('listbox');
    await lists.nth(0).getByRole('option', { name: 'Grape' }).click();
    await lists.nth(1).getByRole('option', { name: 'Fig' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    expect(await page.evaluate(() => window.__submitted)).toEqual([
      ['fruit', 'grape'],
      ['basket', 'apple'],
      ['basket', 'kiwi'],
      ['basket', 'fig'],
    ]);
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(lists.nth(0).getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true');
    expect((await changes(page)).at(-1)).toMatchObject({ reason: 'reset', source: 'api' });
    await page.getByRole('button', { name: 'Submit' }).click();
    expect(await page.evaluate(() => window.__submitted)).toEqual([
      ['fruit', 'banana'],
      ['basket', 'apple'],
      ['basket', 'kiwi'],
    ]);
  });
});

test.describe('Listbox remote data', () => {
  test('reads ranges, sizes from totalRowCount, searches remotely', async ({ page }) => {
    const list = await open(page, 'case=remote');
    await expect(list.locator('[role="option"][aria-posinset="1"]')).toHaveText(/Customer 00000/);
    await expect(list.locator('[role="option"]').first()).toHaveAttribute('aria-setsize', '10000');
    await expect(list).not.toHaveAttribute('aria-busy', 'true');
    const reads = () => page.evaluate(() => (window as unknown as { __lbReads: { range?: { start: number; end: number }; query: { search: { text: string } | null } }[] }).__lbReads.map((r) => ({ range: r.range, search: r.query.search?.text ?? null })));
    expect((await reads())[0]).toEqual({ range: { start: 0, end: 100 }, search: null });
    await list.evaluate((el) => (el.scrollTop = 32 * 5000));
    await expect(list.locator('[role="option"][aria-posinset="5001"]')).toHaveText(/Customer 05000/);
    expect((await reads()).some((r) => r.range?.start === 5000)).toBe(true);
    await page.getByRole('searchbox').fill('0999');
    await expect(list.locator('[role="option"]').first()).toHaveAttribute('aria-setsize', '11');
    const last = (await reads()).at(-1)!;
    expect(last).toEqual({ range: { start: 0, end: 100 }, search: '0999' });
    await expect(page.getByRole('status')).toHaveText('11 results');
  });

  test('inline searchFields and query literals do not re-read on a parent re-render', async ({ page }) => {
    const list = await open(page, 'case=remote');
    await expect(list.locator('[role="option"][aria-posinset="1"]')).toHaveText(/Customer 00000/);
    const count = () => page.evaluate(() => (window as unknown as { __lbReads: unknown[] }).__lbReads.length);
    const before = await count();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Re-render/ }).click();
    await expect(page.getByRole('button', { name: 'Re-render (3)' })).toBeVisible();
    await page.waitForTimeout(150);
    expect(await count()).toBe(before);
    await expect(list.locator('[role="option"][aria-posinset="1"]')).toHaveText(/Customer 00000/);
  });

  test('a failed read shows the error with a retry', async ({ page }) => {
    const list = await open(page, 'case=remote&fail');
    await expect(page.getByRole('alert')).toContainText('Failed to load items');
    expect((await events(page)).some((e) => e.type === 'error')).toBe(true);
    await page.evaluate(() => ((window as unknown as { __fail: boolean }).__fail = false));
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(list.locator('[role="option"][aria-posinset="1"]')).toHaveText(/Customer 00000/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('onLoadError fires once per failed read, also when it sets parent state', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await open(page, 'case=remote&fail');
    await expect(page.getByRole('alert')).toContainText('Failed to load items');
    await page.waitForTimeout(300);
    await expect(page.locator('#remote-errors')).toHaveText('1');
    expect((await events(page)).filter((e) => e.type === 'error')).toHaveLength(1);
    expect(errors.filter((t) => t.includes('Maximum update depth'))).toEqual([]);
  });
});

test.describe('Listbox RTL', () => {
  test('the checkbox sits at the inline start under dir="rtl"', async ({ page }) => {
    const list = await open(page, 'case=rtl');
    const option = list.getByRole('option', { name: 'Apple' });
    const box = (await option.locator('.salmon-listbox-checkbox').boundingBox())!;
    const label = (await option.locator('.salmon-listbox-label').boundingBox())!;
    expect(box.x).toBeGreaterThan(label.x);
  });

  test('the selected check mark is not mirrored under dir="rtl"', async ({ page }) => {
    const list = await open(page, 'case=basic');
    await list.focus();
    await page.keyboard.press('ArrowDown');
    const borders = await list.evaluate((el) => {
      el.setAttribute('dir', 'rtl');
      const check = el.querySelector('[aria-selected="true"] .salmon-listbox-check')!;
      // The 16px glyph box holds the mark; the mark itself is the ::after
      // corner, drawn with physical sides so RTL does not mirror it.
      const box = getComputedStyle(check);
      const s = getComputedStyle(check, '::after');
      return [box.width, box.height, s.borderRightWidth, s.borderLeftWidth, s.borderBottomWidth];
    });
    expect(borders).toEqual(['16px', '16px', '2px', '0px', '2px']);
  });

  test('indicatorPosition="end" moves the checkbox to the inline end, mirrored in RTL', async ({ page }) => {
    await open(page, 'case=rtl');
    const option = page.locator('#end-list').getByRole('option', { name: 'Apple' });
    const box = (await option.locator('.salmon-listbox-checkbox').boundingBox())!;
    const label = (await option.locator('.salmon-listbox-label').boundingBox())!;
    expect(box.x).toBeLessThan(label.x);
    await option.click();
    await expect(option).toHaveAttribute('aria-selected', 'false');
  });
});
