import { expect, test, type Page } from '@playwright/test';
import { axeDropdowns } from './dropdowns-axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Select and MultiSelect (examples/vite-spa/dropdowns.html), with the shared
// popup, template, form and event behavior:
// APG select-only combobox keyboard and ARIA, pointer selection, search,
// multiple selection, forms, templates, virtualization, remote data, popup
// placement and the adaptive sheet, axe in light, dark and RTL.

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}dropdowns.html${query}`);
  await page.waitForFunction(() => window.__dd?.ready === true);
}

const events = (page: Page, id: string) => page.evaluate((i) => window.__dd.events.filter((e) => e.id === i), id);
const popup = (page: Page) => page.locator('.salmon-dropdown-popup');
const activeId = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-activedescendant') ?? null);
const activeLabel = (page: Page) => page.evaluate(() => {
  const id = document.activeElement?.getAttribute('aria-activedescendant');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
});

test.describe('Select', () => {
  test('APG select-only combobox: click opens a labelled listbox, Escape closes without change', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const trigger = page.locator('#select-basic');
    await expect(trigger).toHaveAttribute('role', 'combobox');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    const listId = await trigger.getAttribute('aria-controls');
    const list = page.locator(`[id="${listId}"]`);
    await expect(list).toHaveAttribute('role', 'listbox');
    await expect(list).toHaveAttribute('aria-labelledby', 'select-basic-label');
    await expect(page.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true');
    // The active option starts at the selected one; DOM focus stays on the trigger.
    await expect.poll(() => activeLabel(page)).toBe('Banana');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveText('Banana');
    expect(await events(page, 'select-basic')).toEqual([]);
    const open_ = await page.evaluate(() => window.__dd.open.filter((o) => o.id === 'select-basic').map((o) => `${o.open}:${o.reason}`));
    expect(open_).toEqual(['true:trigger', 'false:escape']);
    expect(problems).toEqual([]);
  });

  test('pointer selection commits, closes and keeps focus on the trigger', async ({ page }) => {
    await open(page);
    await page.locator('#select-basic').click();
    await page.getByRole('option', { name: 'Kiwi' }).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator('#select-basic')).toHaveText('Kiwi');
    await expect(page.locator('#select-basic')).toBeFocused();
    expect(await events(page, 'select-basic')).toEqual([{ id: 'select-basic', value: 'kiwi', reason: 'select', source: 'pointer', items: 1 }]);
    await expect(page.locator('select[name="fruit"]')).toHaveValue('kiwi');
  });

  test('keyboard: arrows open without changing the value, Home / End, Page keys, Enter selects, disabled options are skipped', async ({ page }) => {
    await open(page);
    const trigger = page.locator('#select-basic');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toHaveText('Banana');
    // The popup is a lazy chunk; wait for it before moving inside the list.
    await expect(popup(page)).toHaveCount(1);
    await expect.poll(() => activeLabel(page)).toBe('Banana');
    await page.keyboard.press('Home');
    await expect.poll(() => activeLabel(page)).toBe('Apple');
    await page.keyboard.press('End');
    await expect.poll(() => activeLabel(page)).toBe('Plum');
    await page.keyboard.press('Home');
    await page.keyboard.press('PageDown');
    // maxVisibleItems 8: Apple + 8 rows, Durian (disabled) skipped.
    await expect.poll(() => activeLabel(page)).toBe('Kiwi');
    await page.keyboard.press('PageUp');
    await expect.poll(() => activeLabel(page)).toBe('Apple');
    // Cherry -> Durian (disabled) -> Grape.
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
    await expect.poll(() => activeLabel(page)).toBe('Cherry');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => activeLabel(page)).toBe('Grape');
    await expect(page.getByRole('option', { name: 'Durian' })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger).toHaveText('Grape');
    // Alt+Down opens, Alt+Up selects the active option and closes.
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger).toHaveText('Kiwi');
    // Space opens; Tab closes and moves focus on.
    await page.keyboard.press(' ');
    await expect(popup(page)).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger).not.toBeFocused();
  });

  test('type-ahead selects on the closed Select and moves the active option when open; a repeated letter cycles', async ({ page }) => {
    await open(page);
    const trigger = page.locator('#select-basic');
    await trigger.focus();
    await page.keyboard.type('p');
    await expect(trigger).toHaveText('Peach');
    await page.waitForTimeout(600);
    await page.keyboard.type('pp');
    await expect(trigger).toHaveText('Plum');
    await page.waitForTimeout(600);
    await page.keyboard.type('ki');
    await expect(trigger).toHaveText('Kiwi');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(600);
    await page.keyboard.type('ma');
    await expect.poll(() => activeLabel(page)).toBe('Mango');
    await expect(trigger).toHaveText('Kiwi');
  });

  test('searchable: focus moves to the search input, typing filters with accents folded and marks matches, Escape clears then closes', async ({ page }) => {
    await open(page);
    const trigger = page.locator('#select-search');
    await trigger.click();
    const search = page.locator('.salmon-select-search-input');
    await expect(search).toBeFocused();
    await expect(search).toHaveAttribute('placeholder', 'Search countries');
    await expect(search).toHaveAttribute('aria-controls', (await trigger.getAttribute('aria-controls')) as string);
    await page.keyboard.type('o');
    // contains + ignoreAccents: Côte d’Ivoire, México, Österreich, ...
    await expect(page.getByRole('option')).toHaveText(['Česko', 'Côte d’Ivoire', 'México', 'Österreich']);
    await expect(page.locator('mark.salmon-dropdown__match').nth(1)).toHaveText('ô');
    await expect.poll(() => activeLabel(page)).toBe('Česko');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => activeLabel(page)).toBe('Côte d’Ivoire');
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await expect(page.getByRole('option')).toHaveCount(10);
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.type('per');
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveText('Perú');
    // The live region announces the result count after a search.
    await trigger.click();
    await page.keyboard.type('zz');
    await expect(page.locator('.salmon-dropdown-live')).toHaveText('No results');
    await expect(page.locator('.salmon-dropdown-empty')).toHaveText('No results found');
  });

  test('multiple with checkboxes: Space and click toggle, the popup stays open, select all is tri-state, group headers select groups', async ({ page }) => {
    await open(page);
    const trigger = page.locator('#select-multi');
    await expect(trigger).toHaveText('Apple, Pear');
    await trigger.click();
    const list = page.getByRole('listbox');
    await expect(list).toHaveAttribute('aria-multiselectable', 'true');
    const all = page.getByRole('option', { name: 'Select all' });
    await expect(all).toHaveAttribute('aria-checked', 'mixed');
    await expect(page.locator('.salmon-dropdown-option[aria-selected="true"] .salmon-dropdown-checkbox[data-state="checked"]').first()).toBeVisible();
    await page.getByRole('option', { name: 'Kiwi' }).click();
    await expect(popup(page)).toHaveCount(1);
    await expect(trigger).toHaveText('Apple, Pear, Kiwi');
    // Keyboard: Space toggles the active option.
    await page.keyboard.press('Home');
    await expect.poll(() => activeLabel(page)).toBe('Select all');
    await page.keyboard.press(' ');
    await expect(all).toHaveAttribute('aria-checked', 'true');
    let last = (await events(page, 'select-multi')).at(-1);
    expect(last?.reason).toBe('selectAll');
    expect((last?.value as string[]).length).toBe(15);
    await page.keyboard.press(' ');
    await expect(all).toHaveAttribute('aria-checked', 'false');
    // Group header (groupSelection): selects every enabled item of the group.
    await page.getByRole('option', { name: 'Citrus' }).click();
    await expect(trigger).toHaveText('Lemon, Lime, Orange');
    await expect(page.getByRole('option', { name: 'Citrus' })).toHaveAttribute('aria-checked', 'true');
    // Ctrl+A selects all, Enter toggles too.
    await page.keyboard.press('ControlOrMeta+a');
    last = (await events(page, 'select-multi')).at(-1);
    expect((last?.value as string[]).length).toBe(15);
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
  });

  test('maxSelected disables the remaining options and announces the limit', async ({ page }) => {
    await open(page);
    await page.locator('#select-limit').click();
    for (const name of ['Apple', 'Banana', 'Cherry']) await page.getByRole('option', { name }).click();
    await expect(page.getByRole('option', { name: 'Kiwi' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('option', { name: 'Apple' })).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.salmon-dropdown-live')).toHaveText('Selection limit of 3 reached');
    await page.getByRole('option', { name: 'Kiwi' }).click({ force: true });
    expect((await events(page, 'select-limit')).length).toBe(3);
  });

  test('hideSelected leaves selected items out of the list; valueDisplay count', async ({ page }) => {
    await open(page);
    const trigger = page.locator('#select-count');
    await expect(trigger).toHaveText('2 items selected');
    await trigger.click();
    await expect(page.getByRole('option', { name: 'Apple' })).toHaveCount(0);
    await page.getByRole('option', { name: 'Pear' }).click();
    await expect(trigger).toHaveText('3 items selected');
    await expect(page.getByRole('option', { name: 'Pear' })).toHaveCount(0);
  });

  test('forms: FormData carries the values, reset restores the initial values, required uses native validation', async ({ page }) => {
    await open(page);
    await page.locator('[data-testid="submit"]').click();
    expect(await page.evaluate(() => window.__dd.submitted)).toBeNull();
    // `required` is empty: the native select is invalid and focus moves to the visible trigger.
    await expect(page.locator('#select-required')).toBeFocused();
    await page.locator('#select-required').click();
    await page.getByRole('option', { name: 'Lime' }).click();
    await page.locator('#select-basic').click();
    await page.getByRole('option', { name: 'Mango' }).click();
    await page.locator('[data-testid="submit"]').click();
    expect(await page.evaluate(() => window.__dd.submitted)).toEqual([
      ['fruit', 'mango'],
      ['required', 'lime'],
      ['tags', 'apple'],
      ['tags', 'pear'],
      ['labels', 'apple'],
    ]);
    await page.locator('[data-testid="reset"]').click();
    await expect(page.locator('#select-basic')).toHaveText('Banana');
    expect((await events(page, 'select-basic')).at(-1)).toMatchObject({ value: 'banana', reason: 'reset', source: 'api' });
  });

  test('controlled value: the parent owns the value; ref reaches the trigger; focus and blur pass through', async ({ page }) => {
    await open(page);
    const trigger = page.locator('#select-controlled');
    await expect(trigger).toHaveText('Lemon');
    await page.locator('[data-testid="controlled-set"]').click();
    await expect(trigger).toHaveText('Kiwi');
    await trigger.click();
    await page.getByRole('option', { name: 'Plum' }).click();
    await expect(page.locator('[data-testid="controlled-value"]')).toHaveText('plum');
    expect(await page.evaluate(() => window.__ddRef?.id)).toBe('select-controlled');
    await page.evaluate(() => window.__ddRef?.blur());
    await page.evaluate(() => window.__ddRef?.focus());
    const reasons = (await events(page, 'select-controlled')).map((e) => e.reason);
    expect(reasons).toContain('focus');
    expect(reasons).toContain('blur');
  });

  test('templates: renderItem, getItemIcon, renderValue, header and footer, renderEmpty, getItemProps', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-testid="tpl-value"]')).toHaveText('Mango');
    await page.locator('#select-templates').click();
    const mango = page.getByRole('option', { name: /Mango/ });
    await expect(mango.locator('[data-testid="tpl-item"]')).toHaveText('Mango ✓');
    await expect(mango.locator('.dd-icon')).toHaveText('M');
    await expect(mango).toHaveAttribute('data-family', 'Stone');
    await expect(page.locator('[data-testid="tpl-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="tpl-footer"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#select-empty').click();
    await expect(page.locator('[data-testid="tpl-empty"]')).toHaveText('noData');
  });

  test('group headers render through renderGroupHeader; a failed read shows the error with a retry', async ({ page }) => {
    await open(page);
    await page.locator('#select-groups').click();
    await expect(page.locator('[data-testid="tpl-group"]').first()).toHaveText('BERRY');
    await expect(page.getByRole('group', { name: 'Citrus' })).toContainText('Lemon');
    await page.keyboard.press('Escape');
    await page.locator('#select-error').click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Request failed');
    expect((await events(page, 'select-error')).at(-1)).toMatchObject({ value: 'The fruit service is unavailable', reason: 'error' });
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('option', { name: 'Item 0', exact: true })).toBeVisible();
    await expect(alert).toHaveCount(0);
  });

  test('readOnly does not open; disabled is not focusable; clear button and Delete clear the value', async ({ page }) => {
    await open(page);
    await page.locator('#select-readonly').click();
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator('#select-readonly')).toHaveAttribute('aria-readonly', 'true');
    await expect(page.locator('#select-disabled')).toBeDisabled();
    await page.locator('[data-fixture="select-basic"] .salmon-select-clear').click();
    await expect(page.locator('#select-basic')).toHaveText('Pick a fruit');
    expect((await events(page, 'select-basic')).at(-1)).toMatchObject({ value: null, reason: 'clear', source: 'pointer' });
    await page.locator('#select-basic').focus();
    await page.keyboard.type('k');
    await page.keyboard.press('Delete');
    expect((await events(page, 'select-basic')).at(-1)).toMatchObject({ value: null, reason: 'clear', source: 'keyboard' });
  });

  test('virtualized list: bounded DOM options, setsize / posinset, the active option stays mounted', async ({ page }) => {
    await open(page);
    await page.locator('#select-large').click();
    const list = page.getByRole('listbox');
    expect(await page.getByRole('option').count()).toBeLessThanOrEqual(8 + 2 * 6);
    const first = page.getByRole('option').first();
    await expect(first).toHaveAttribute('aria-setsize', '1000');
    await expect(first).toHaveAttribute('aria-posinset', '1');
    // maxVisibleItems 8 sets the height.
    const box = await list.boundingBox();
    const option = await first.boundingBox();
    expect(Math.round((box?.height ?? 0) / (option?.height ?? 1))).toBe(8);
    await page.keyboard.press('End');
    const id = await activeId(page);
    await expect(page.locator(`[id="${id}"]`)).toHaveText('Item 999');
    await expect(page.locator(`[id="${id}"]`)).toHaveAttribute('aria-posinset', '1000');
    expect(await page.getByRole('option').count()).toBeLessThanOrEqual(20);
    await page.keyboard.press('Enter');
    await expect(page.locator('#select-large')).toHaveText('Item 999');
  });

  test('remote data: busy list, range reads while scrolling, search reads', async ({ page }) => {
    await open(page, '?delay=150');
    await page.locator('#select-remote').click();
    await expect(page.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.salmon-dropdown-loading')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Item 0', exact: true })).toBeVisible();
    await expect(page.getByRole('listbox')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('option').first()).toHaveAttribute('aria-setsize', '5000');
    await page.getByRole('listbox').evaluate((el) => (el.scrollTop = 32 * 400));
    await expect(page.getByRole('option', { name: 'Item 400', exact: true })).toBeVisible();
    const reads = await page.evaluate(() => window.__dd.reads.map((r) => r.start));
    expect(reads).toContain(400);
    await page.keyboard.type('49');
    await expect(page.getByRole('option').first()).toHaveText('Item 49');
    const searchReads = await page.evaluate(() => window.__dd.reads.filter((r) => r.search === '49'));
    expect(searchReads.length).toBeGreaterThan(0);
  });

  test('remote multiple: no select-all option and Ctrl+A keeps the value', async ({ page }) => {
    await open(page);
    const trigger = page.locator('#select-remote-multi');
    await expect(trigger).toHaveText('Item 7');
    await trigger.click();
    await expect(page.getByRole('option', { name: 'Item 0', exact: true })).toBeVisible();
    await expect(popup(page).locator('.salmon-dropdown-select-all')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveText('Item 7');
    expect(await events(page, 'select-remote-multi')).toEqual([]);
  });

  test('popup placement: below the trigger, at least as wide, aligned to the inline start and mirrored in RTL', async ({ page }) => {
    await open(page);
    await page.locator('#select-basic').click();
    let t = await page.locator('#select-basic').locator('..').boundingBox();
    let p = await popup(page).boundingBox();
    expect(p && t && p.y >= t.y + t.height).toBeTruthy();
    expect(Math.round(p?.width ?? 0)).toBeGreaterThanOrEqual(Math.round(t?.width ?? 0));
    expect(Math.abs((p?.x ?? 0) - (t?.x ?? 0))).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await page.locator('#select-rtl').click();
    t = await page.locator('#select-rtl').locator('..').boundingBox();
    p = await popup(page).boundingBox();
    expect(Math.abs((p?.x ?? 0) + (p?.width ?? 0) - ((t?.x ?? 0) + (t?.width ?? 0)))).toBeLessThanOrEqual(1);
    await expect(popup(page)).toHaveAttribute('dir', 'rtl');
    // Outside press closes.
    await page.mouse.click(1200, 700);
    await expect(popup(page)).toHaveCount(0);
  });

  test('popupMode="sheet": a full-screen dialog with a search field and a close button', async ({ page }) => {
    await open(page);
    await page.locator('#select-sheet').click();
    const sheet = page.getByRole('dialog', { name: 'Sheet fruit' });
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box?.width).toBe(1280);
    expect(box?.height).toBe(800);
    await expect(page.locator('.salmon-select-search-input')).toBeFocused();
    await page.keyboard.type('pe');
    await page.keyboard.press('Enter');
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('#select-sheet')).toHaveText('Peach');
    await page.locator('#select-sheet').click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#select-sheet')).toBeFocused();
  });

  test('axe: zero violations closed and open, light, dark and RTL', async ({ page }) => {
    await open(page);
    expect(await axeDropdowns(page)).toEqual([]);
    for (const id of ['#select-basic', '#select-multi', '#select-search', '#select-large', '#select-rtl', '#select-templates']) {
      await page.locator(id).click();
      expect(await axeDropdowns(page), id).toEqual([]);
      await page.keyboard.press('Escape');
      if (await popup(page).count()) await page.keyboard.press('Escape');
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('#select-multi').click();
    expect(await axeDropdowns(page)).toEqual([]);
  });

  test('forced colors keep selected, active and disabled options distinguishable', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    await page.locator('#select-basic').click();
    const selected = await page.getByRole('option', { name: 'Banana' }).evaluate((el) => getComputedStyle(el).backgroundColor);
    const plain = await page.getByRole('option', { name: 'Apple' }).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(selected).not.toBe(plain);
    const active = await page.getByRole('option', { name: 'Banana' }).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(active).toBe('solid');
  });

  test('touch targets are at least 24 px and a closed Select adds no document listeners', async ({ page }) => {
    await page.addInitScript(() => {
      const counts = { add: 0 };
      (window as unknown as { __listen: typeof counts }).__listen = counts;
      const orig = Document.prototype.addEventListener;
      Document.prototype.addEventListener = function (this: Document, ...args: Parameters<Document['addEventListener']>) {
        counts.add++;
        return orig.apply(this, args);
      } as Document['addEventListener'];
    });
    await open(page);
    const before = await page.evaluate(() => (window as unknown as { __listen: { add: number } }).__listen.add);
    await page.locator('#select-basic').focus();
    await page.keyboard.type('k');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => (window as unknown as { __listen: { add: number } }).__listen.add)).toBe(before);
    await page.locator('#select-basic').click();
    for (const option of await page.getByRole('option').all()) expect((await option.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
    expect((await page.locator('#select-basic').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
  });
});
