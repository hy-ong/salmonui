import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';
import { axeDropdowns } from './dropdowns-axe.ts';

// Combobox (examples/vite-spa/dropdowns.html; Combobox, AutoComplete,
// MultiSelect (typing) and MultiColumn ComboBox behavior): APG editable combobox keys and ARIA, creatable values, inline
// autofill, IME, chips, the `columns` grid popup and remote search.

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}dropdowns.html${query}`);
  await page.waitForFunction(() => window.__dd?.ready === true);
}

const events = (page: Page, id: string) => page.evaluate((i) => window.__dd.events.filter((e) => e.id === i), id);
const popup = (page: Page) => page.locator('.salmon-dropdown-popup');
const activeLabel = (page: Page) =>
  page.evaluate(() => {
    const id = document.activeElement?.getAttribute('aria-activedescendant');
    return id ? (document.getElementById(id)?.textContent ?? null) : null;
  });

test.describe('Combobox', () => {
  test('typing filters and opens; arrows move the active option; Enter commits; Escape closes, a second Escape clears', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const input = page.locator('#cbx-basic');
    await input.click();
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await page.keyboard.type('Ap');
    // startsWith (ComboBox default), case-insensitive.
    await expect(page.getByRole('option')).toHaveText(['Apple', 'Apricot']);
    await expect(page.getByRole('listbox')).toHaveAttribute('id', (await input.getAttribute('aria-controls')) as string);
    expect(await activeLabel(page)).toBeNull();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await activeLabel(page)).toBe('Apricot');
    await page.keyboard.press('Enter');
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toHaveValue('Apricot');
    await expect(input).toBeFocused();
    expect(await events(page, 'cbx-basic')).toEqual([{ id: 'cbx-basic', value: 'apricot', reason: 'select', source: 'keyboard', items: 1 }]);
    // Home / End stay in the text (caret), not in the list.
    await page.keyboard.press('Home');
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(0);
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(input).toHaveValue('Apricot');
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('');
    expect((await events(page, 'cbx-basic')).at(-1)).toMatchObject({ value: null, reason: 'clear' });
    // Alt+Down opens without moving, Alt+Up closes.
    await page.keyboard.press('Alt+ArrowDown');
    await expect(popup(page)).toHaveCount(1);
    await page.keyboard.press('Alt+ArrowUp');
    await expect(popup(page)).toHaveCount(0);
    // Unmatched text without creatable reverts on blur.
    await page.keyboard.type('zzz');
    await page.keyboard.press('Tab');
    await expect(input).toHaveValue('');
    expect(problems).toEqual([]);
  });

  test('the trigger button toggles the popup and stays out of the tab order', async ({ page }) => {
    await open(page);
    const button = page.locator('[data-fixture="cbx-basic"] .salmon-combobox-trigger');
    await expect(button).toHaveAttribute('tabindex', '-1');
    await button.click();
    await expect(popup(page)).toHaveCount(1);
    await expect(page.locator('#cbx-basic')).toBeFocused();
    await button.click();
    await expect(popup(page)).toHaveCount(0);
  });

  test('creatable: Enter commits new text through onCreateItem; null rejects', async ({ page }) => {
    await open(page);
    const input = page.locator('#cbx-creatable');
    await input.click();
    await page.keyboard.type('Fig');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('Fig');
    expect((await events(page, 'cbx-creatable')).at(-1)).toEqual({ id: 'cbx-creatable', value: 'fig', reason: 'create', source: 'keyboard', items: 1 });
    // An existing label (any case) selects that item.
    await input.fill('');
    await page.keyboard.type('kiwi');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    expect((await events(page, 'cbx-creatable')).at(-1)).toMatchObject({ value: 'kiwi', reason: 'select' });
    const before = (await events(page, 'cbx-creatable')).length;
    await input.fill('');
    await page.keyboard.type('nope');
    await page.keyboard.press('Tab');
    expect((await events(page, 'cbx-creatable')).length).toBe(before);
  });

  test('autofill completes the first match inline with the completion selected', async ({ page }) => {
    await open(page);
    const input = page.locator('#cbx-autofill');
    await expect(input).toHaveAttribute('aria-autocomplete', 'both');
    await input.click();
    await page.keyboard.type('bl');
    await expect(input).toHaveValue('blueberry');
    const selection = await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]);
    expect(selection).toEqual([2, 9]);
    expect(await activeLabel(page)).toBe('Blueberry');
    // Deleting does not autofill.
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue('bl');
    await page.keyboard.type('u');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('Blueberry');
  });

  test('IME composition: no filtering or opening until composition ends', async ({ page }) => {
    await open(page);
    const input = page.locator('#cbx-basic');
    await input.focus();
    await input.dispatchEvent('compositionstart', { data: '' });
    await page.keyboard.insertText('ki');
    await expect(popup(page)).toHaveCount(0);
    await page.keyboard.press('Enter');
    expect(await events(page, 'cbx-basic')).toEqual([]);
    await input.dispatchEvent('compositionend', { data: 'ki' });
    await expect(page.getByRole('option')).toHaveText(['Kiwi']);
  });

  test('AutoComplete recipe: opens from one character, contains search, capped suggestions, marked matches, Backspace re-filters', async ({ page }) => {
    await open(page);
    const input = page.locator('#cbx-auto');
    await expect(page.locator('[data-fixture="cbx-auto"] .salmon-combobox-trigger')).toHaveCount(0);
    await input.click();
    await expect(popup(page)).toHaveCount(0);
    await page.keyboard.type('r');
    // contains 'r': Zürich, Kraków, Reykjavík, Montréal (maxResults 5 caps the list).
    const options = page.getByRole('option');
    expect(await options.count()).toBeLessThanOrEqual(5);
    await expect(options.first()).toHaveText('Zürich');
    await expect(page.locator('mark.salmon-dropdown__match').first()).toHaveText('r');
    await page.keyboard.type('n');
    await expect(options).toHaveText(['Bern']);
    await page.keyboard.press('Backspace');
    expect(await options.count()).toBeGreaterThan(1);
    await page.keyboard.press('Backspace');
    await expect(popup(page)).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await expect(popup(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    // Free text is the value (creatable).
    await page.keyboard.type('Atlantis');
    await page.keyboard.press('Enter');
    expect((await events(page, 'cbx-auto')).at(-1)).toMatchObject({ value: 'Atlantis', reason: 'create' });
  });

  test('multiple: chips, Backspace removes the last chip, arrows move between chips, Delete and the remove button remove, commitOnBlur adds typed text', async ({ page }) => {
    await open(page);
    const input = page.locator('#cbx-multi');
    const chips = page.locator('[data-fixture="cbx-multi"] [role="listitem"]');
    await expect(chips).toHaveText(['Apple']);
    await input.click();
    await expect(popup(page)).toHaveCount(1);
    await page.keyboard.type('ki');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(chips).toHaveText(['Apple', 'Kiwi']);
    await expect(input).toHaveValue('');
    await expect(popup(page)).toHaveCount(1);
    expect((await events(page, 'cbx-multi')).at(-1)).toMatchObject({ value: ['apple', 'kiwi'], reason: 'add' });
    await page.getByRole('option', { name: 'Lime' }).click();
    await expect(chips).toHaveText(['Apple', 'Kiwi', 'Lime']);
    await page.keyboard.press('Backspace');
    await expect(chips).toHaveText(['Apple', 'Kiwi']);
    expect((await events(page, 'cbx-multi')).at(-1)).toMatchObject({ value: ['apple', 'kiwi'], reason: 'remove' });
    await page.keyboard.press('Escape');
    const field = page.locator('[data-fixture="cbx-multi"]');
    await page.keyboard.press('ArrowLeft');
    await expect(field.getByRole('button', { name: 'Remove Kiwi' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(field.getByRole('button', { name: 'Remove Apple' })).toBeFocused();
    await page.keyboard.press('Delete');
    await expect(chips).toHaveText(['Kiwi']);
    await field.getByRole('button', { name: 'Remove Kiwi' }).click();
    await expect(chips).toHaveCount(0);
    await expect(input).toBeFocused();
    // commitOnBlur with creatable: typed text becomes a chip when focus leaves.
    await page.keyboard.type('Fig');
    await page.keyboard.press('Tab');
    await expect(chips).toHaveText(['Fig']);
    expect((await events(page, 'cbx-multi')).at(-1)).toMatchObject({ value: ['Fig'], reason: 'create' });
  });

  test('form reset restores the value and the input text with onInputChange reason reset', async ({ page }) => {
    await open(page);
    const chips = page.locator('[data-fixture="cbx-multi"] [role="listitem"]');
    await page.locator('#cbx-multi').click();
    await page.getByRole('option', { name: 'Kiwi' }).click();
    await expect(chips).toHaveText(['Apple', 'Kiwi']);
    await page.locator('[data-testid="reset"]').click();
    await expect(chips).toHaveText(['Apple']);
    expect((await events(page, 'cbx-multi')).at(-1)).toMatchObject({ value: ['apple'], reason: 'reset', source: 'api' });
    expect((await events(page, 'cbx-multi-input')).at(-1)).toEqual({ id: 'cbx-multi-input', value: '', reason: 'reset', source: 'api' });
  });

  test('the columns popup is a grid with sortable headers, row navigation and search over several fields', async ({ page }) => {
    await open(page);
    const input = page.locator('#cbx-columns');
    await expect(input).toHaveAttribute('aria-haspopup', 'grid');
    await input.click();
    const grid = page.getByRole('grid');
    await expect(grid).toBeVisible();
    await expect(grid).toHaveAttribute('aria-rowcount', '2001');
    await expect(grid).toHaveAttribute('data-striped', '');
    await expect(grid).toHaveAttribute('data-grid-lines', 'both');
    await expect(page.getByRole('columnheader')).toHaveText(['ID', 'Name', 'City', 'Age', 'Active']);
    const firstRow = page.locator('[role="rowgroup"] [role="row"][aria-rowindex="2"]');
    await expect(firstRow.getByRole('gridcell')).toHaveText(['0', 'Person 0', 'Zürich', '20', '']);
    await expect(firstRow.getByRole('gridcell').nth(4).locator('[role="img"]')).toHaveAttribute('aria-label', 'false');
    // Widths: 60 px, 35 %, ...
    const idCell = await firstRow.getByRole('gridcell').first().boundingBox();
    expect(Math.round(idCell?.width ?? 0)).toBe(60);
    // Align end.
    await expect(firstRow.getByRole('gridcell').first()).toHaveAttribute('data-align', 'end');
    expect(await page.locator('[role="rowgroup"] [role="row"]').count()).toBeLessThanOrEqual(1 + 8 + 12);
    // Sorting: Age ascending, descending (aria-sort).
    const age = page.getByRole('columnheader', { name: 'Age' });
    await age.getByRole('button').click();
    await expect(age).toHaveAttribute('aria-sort', 'ascending');
    await age.getByRole('button').click();
    await expect(age).toHaveAttribute('aria-sort', 'descending');
    await expect(page.locator('[role="rowgroup"] [role="row"][aria-rowindex="2"] [role="gridcell"]').nth(3)).toHaveText('69');
    // Ctrl+click adds a level.
    await page.getByRole('columnheader', { name: 'City' }).getByRole('button').click({ modifiers: ['ControlOrMeta'] });
    await expect(page.getByRole('columnheader', { name: 'City' })).toHaveAttribute('aria-sort', 'ascending');
    await expect(age).toHaveAttribute('aria-sort', 'descending');
    await expect(input).toBeFocused();
    // Search over name and city (searchFields), rows are the navigable unit.
    await page.keyboard.type('kraków');
    await expect(page.locator('[role="rowgroup"] [role="row"][aria-rowindex="2"] [role="gridcell"]').nth(2)).toHaveText('Kraków');
    const id = await input.getAttribute('aria-activedescendant');
    await expect(page.locator(`[id="${id}"]`)).toHaveAttribute('role', 'row');
    await page.keyboard.press('ArrowDown');
    const label = await page.locator(`[id="${await input.getAttribute('aria-activedescendant')}"] [role="gridcell"]`).nth(1).textContent();
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue(label as string);
    expect((await events(page, 'cbx-columns')).at(-1)?.reason).toBe('select');
  });

  test('columns: at 390px the grid keeps its column widths and scrolls horizontally instead of clipping the last column', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await page.locator('#cbx-columns').click();
    const grid = page.getByRole('grid');
    await expect(grid).toBeVisible();
    // The popup is placed (clamped to the viewport) after it measured itself.
    await expect
      .poll(async () => {
        const box = await page.locator('.salmon-dropdown-popup').boundingBox();
        return (box?.x ?? 0) + (box?.width ?? 0);
      })
      .toBeLessThanOrEqual(390);
    const m = await grid.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
    expect(m.overflowX).toBe('auto');
    expect(m.scroll).toBeGreaterThan(m.client);
    // The last column is reachable: scrolled to the end, it ends inside the grid.
    await grid.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const gridBox = await grid.boundingBox();
    const last = await page.getByRole('columnheader', { name: 'Active' }).boundingBox();
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThanOrEqual((gridBox?.x ?? 0) + (gridBox?.width ?? 0) + 1);
    expect(Math.round(last?.width ?? 0)).toBeGreaterThan(40);
  });

  test('columns: renderHeader, renderCell, cellProps, a fixed rowHeight and an initial sortBy', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await page.locator('#cbx-columns2').click();
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(page.locator('[data-testid="tpl-col-header"]')).toHaveText('Name!');
    await expect(page.getByRole('columnheader', { name: 'Age' })).toHaveAttribute('aria-sort', 'descending');
    const first = page.locator('[role="rowgroup"] [role="row"][aria-rowindex="2"]');
    await expect(first.locator('[data-testid="tpl-cell"]')).toHaveText('69 y');
    expect(Math.round((await first.boundingBox())?.height ?? 0)).toBe(40);
    expect(await page.locator('.salmon-combobox-grid-cell.dd-bern').count()).toBeGreaterThan(0);
    // Two columns over the same field render without duplicate React keys.
    await expect(page.getByRole('columnheader', { name: 'Months' })).toBeVisible();
    await expect(first.getByRole('gridcell').nth(3)).toHaveText('828');
    expect(problems).toEqual([]);
  });

  test('remote: typing sends debounced search reads and aborts superseded ones; aria-busy while loading', async ({ page }) => {
    await open(page, '?delay=200');
    const input = page.locator('#cbx-remote');
    await input.click();
    await expect(page.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('option').first()).toHaveText('Item 0');
    await page.keyboard.type('123');
    await expect(page.getByRole('option').first()).toHaveText('Item 123');
    const reads = await page.evaluate(() => window.__dd.reads.filter((r) => r.search !== null).map((r) => r.search));
    // Debounce: one read for the final text, not one per keystroke.
    expect(reads).toEqual(['123']);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(80);
    await page.keyboard.press('Backspace');
    await expect(page.getByRole('option').first()).toHaveText('Item 1');
    const aborted = await page.evaluate(() => window.__dd.reads.filter((r) => r.aborted).length);
    expect(aborted).toBeGreaterThanOrEqual(1);
  });

  test('RTL: chips arrows mirror', async ({ page }) => {
    await open(page);
    const input = page.locator('#cbx-rtl');
    await input.click();
    await page.keyboard.press('Escape');
    const field = page.locator('[data-fixture="cbx-rtl"]');
    await page.keyboard.press('ArrowRight');
    await expect(field.getByRole('button', { name: 'Remove Lime' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(field.getByRole('button', { name: 'Remove Kiwi' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(input).toBeFocused();
  });

  test('axe: zero violations closed and open', async ({ page }) => {
    await open(page);
    expect(await axeDropdowns(page)).toEqual([]);
    for (const id of ['#cbx-basic', '#cbx-multi', '#cbx-columns', '#cbx-auto']) {
      await page.locator(id).click();
      if (id === '#cbx-auto') await page.keyboard.type('a');
      await expect(page.locator(id === '#cbx-columns' ? '[role="grid"]' : '[role="listbox"]')).toBeVisible();
      expect(await axeDropdowns(page), id).toEqual([]);
      await page.keyboard.press('Escape');
    }
  });
});
